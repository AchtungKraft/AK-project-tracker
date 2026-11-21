import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * Tote photo organizing (Phase D). Changes ONLY which content entry a photo belongs to
 * (StoredPropertyPhoto.stored_property_id / sort_order) and the active/retired state of entries.
 * Never touches files, inventory, parts, purchasing, commitments, containers or labels.
 *
 * Every operation is journaled in StorageCustodyEvent before it is applied (state pending ->
 * completed), keyed by a client op_key, so a retry resumes the same plan instead of repeating it.
 */
const respond = (d, s = 200) => Response.json(d, { status: s });
const idOk = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{12,120}$/.test(s);
const safeText = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const MAX_PHOTOS = 200;
const ORG_TYPES = ['photo_group', 'photo_separate'];
const PLACEHOLDER = 'Unidentified Item';
const NEW = '__new__';

class Fail extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }

async function inBatches(items, fn, size = 6) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/** Loads and validates the selection: every photo and its entry must belong to this tote. */
async function loadSelection(db, container, photoIds) {
  if (!Array.isArray(photoIds) || !photoIds.length) throw new Fail(400, 'Select at least one photo');
  const ids = [...new Set(photoIds)];
  if (ids.length > MAX_PHOTOS) throw new Fail(400, `Select at most ${MAX_PHOTOS} photos at a time`);
  if (!ids.every(idOk)) throw new Fail(400, 'Invalid photo id');
  const photos = await db.entities.StoredPropertyPhoto.filter({ id: { $in: ids } }, '-created_date', ids.length + 5);
  if (photos.length !== ids.length) throw new Fail(404, 'Some selected photos no longer exist');
  if (photos.some((p) => p.archived || p.container_id !== container.id)) throw new Fail(409, 'All selected photos must belong to this tote');
  const entryIds = [...new Set(photos.map((p) => p.stored_property_id).filter(Boolean))];
  const entries = entryIds.length ? await db.entities.StoredProperty.filter({ id: { $in: entryIds } }) : [];
  if (entries.length !== entryIds.length || entries.some((e) => e.container_id !== container.id || e.status !== 'in_storage')) {
    throw new Fail(409, 'A selected photo belongs to an item that is no longer in this tote');
  }
  const totals = new Map();
  if (entryIds.length) {
    const rows = await db.entities.StoredPropertyPhoto.filter({ stored_property_id: { $in: entryIds }, archived: false }, '-created_date', 5000);
    for (const r of rows) totals.set(r.stored_property_id, (totals.get(r.stored_property_id) || 0) + 1);
  }
  return { photos, entries: new Map(entries.map((e) => [e.id, e])), totals };
}

/** Entries that would be left empty are retired; identified / converted entries are protected. */
function checkSources(moves, entries, totals) {
  const outCount = new Map();
  for (const m of moves) if (m.from) outCount.set(m.from, (outCount.get(m.from) || 0) + 1);
  const retire = [];
  for (const [id, n] of outCount) {
    const e = entries.get(id);
    if (e.converted_inventory_item_id) throw new Fail(409, `"${e.name}" is linked to tracked inventory. Its photos cannot be moved.`, 'INVENTORY_LINKED');
    if ((totals.get(id) || 0) - n <= 0) {
      if (e.catalog_part_id) throw new Fail(409, `"${e.name}" is identified as a catalog part. Keep at least one photo in it, or remove the part match first.`, 'IDENTIFIED_WOULD_EMPTY');
      retire.push(id);
    }
  }
  return retire;
}

function newEntryRecord(container, user, key, fields) {
  const q = fields.quantity;
  const known = Number.isFinite(q) && q > 0;
  return {
    intake_key: key, name: safeText(fields.name, 150) || PLACEHOLDER, property_type: 'unidentified',
    ownership_type: container.client_account_id ? 'client' : 'unknown',
    client_account_id: container.client_account_id || null, project_id: container.project_id || null,
    container_id: container.id, location_id: null, quantity_known: known, quantity: known ? q : null,
    condition: 'unknown', status: 'in_storage', description: safeText(fields.description, 1200), notes: '',
    created_by: user.id, last_updated_by: user.id,
  };
}

/** Create-or-reuse by intake_key so a retried request never duplicates an entry. */
async function ensureEntry(db, container, user, key, fields) {
  const prior = await db.entities.StoredProperty.filter({ intake_key: key, container_id: container.id });
  if (prior.length) return prior[0];
  return db.entities.StoredProperty.create(newEntryRecord(container, user, key, fields));
}

async function nextSort(db, entryId) {
  const rows = await db.entities.StoredPropertyPhoto.filter({ stored_property_id: entryId, archived: false }, '-sort_order', 1);
  return rows.length ? (rows[0].sort_order || 0) + 1 : 0;
}

async function applyPlan(db, user, d) {
  const now = new Date().toISOString();
  await inBatches(d.reactivate_entry_ids || [], (id) => db.entities.StoredProperty.update(id, { status: 'in_storage', retired_at: null, retired_by: null, retired_reason: null, last_updated_by: user.id }));
  await inBatches(d.moves, (m) => db.entities.StoredPropertyPhoto.update(m.photo_id, { stored_property_id: m.to, sort_order: m.to_sort }));
  await inBatches(d.retired_entry_ids || [], async (id) => {
    const left = await db.entities.StoredPropertyPhoto.filter({ stored_property_id: id, archived: false }, '-created_date', 1);
    if (!left.length) await db.entities.StoredProperty.update(id, { status: 'retired', retired_at: now, retired_by: user.id, retired_reason: 'No photos left after organizing', last_updated_by: user.id });
  });
}

const summary = (ev) => ({
  event_id: ev.id, event_type: ev.event_type, operation: ev.details?.operation, moved: ev.details?.moves?.length || 0,
  created_entry_ids: ev.details?.created_entry_ids || [], retired_entry_ids: ev.details?.retired_entry_ids || [],
  destination_entry_ids: ev.details?.destination_entry_ids || [],
});

async function journalAndApply(db, user, container, type, actionKey, details, propertyId) {
  const ev = await db.entities.StorageCustodyEvent.create({
    event_type: type, container_id: container.id, stored_property_id: propertyId || undefined,
    project_id: container.project_id || undefined, client_account_id: container.client_account_id || undefined,
    performed_by: user.id, performed_at: new Date().toISOString(), action_key: actionKey,
    notes: 'Photo organizing only: no inventory, purchasing or file changes',
    details: { ...details, state: 'pending', performed_by_name: user.full_name || user.email || null, undone_by: null },
  });
  await applyPlan(db, user, ev.details);
  return db.entities.StorageCustodyEvent.update(ev.id, { details: { ...ev.details, state: 'completed', completed_at: new Date().toISOString() } });
}

/** Returns a completed or resumed result for a key already used, else null. */
async function replay(db, user, container, actionKey) {
  const [prior] = await db.entities.StorageCustodyEvent.filter({ container_id: container.id, action_key: actionKey }, 'created_date', 1);
  if (!prior) return null;
  if (prior.details?.state !== 'completed') {
    await applyPlan(db, user, prior.details);
    const done = await db.entities.StorageCustodyEvent.update(prior.id, { details: { ...prior.details, state: 'completed', completed_at: new Date().toISOString() } });
    return { ...summary(done), resumed: true };
  }
  return { ...summary(prior), idempotent_hit: true };
}

async function organize(db, user, container, body) {
  const op = body.operation;
  if (!['group_new', 'group_existing', 'unsort', 'individual'].includes(op)) throw new Fail(400, 'Unknown organizing operation');
  if (!idOk(body.op_key)) throw new Fail(400, 'Stable op_key required');
  const actionKey = 'org_' + body.op_key;
  const done = await replay(db, user, container, actionKey);
  if (done) return done;

  const { photos, entries, totals } = await loadSelection(db, container, body.photo_ids);
  let target = null;
  if (op === 'group_existing') {
    if (!idOk(body.target_property_id)) throw new Fail(400, 'Choose the item to add these photos to');
    [target] = await db.entities.StoredProperty.filter({ id: body.target_property_id, container_id: container.id });
    if (!target || target.status !== 'in_storage') throw new Fail(409, 'That item is no longer in this tote');
    if (target.converted_inventory_item_id) throw new Fail(409, `"${target.name}" is linked to tracked inventory and cannot take new photos`, 'INVENTORY_LINKED');
  }
  let moves = [];
  if (op === 'group_new') moves = photos.map((p) => ({ photo_id: p.id, from: p.stored_property_id || null, from_sort: p.sort_order || 0, to: NEW }));
  if (op === 'group_existing') moves = photos.filter((p) => p.stored_property_id !== target.id).map((p) => ({ photo_id: p.id, from: p.stored_property_id || null, from_sort: p.sort_order || 0, to: target.id }));
  if (op === 'unsort') moves = photos.filter((p) => p.stored_property_id).map((p) => ({ photo_id: p.id, from: p.stored_property_id, from_sort: p.sort_order || 0, to: null }));
  if (op === 'individual') {
    const outPer = new Map();
    for (const p of photos) if (p.stored_property_id) outPer.set(p.stored_property_id, (outPer.get(p.stored_property_id) || 0) + 1);
    // A photo that is already the only photo of its entry is already an individual item: left as is.
    moves = photos.filter((p) => !(p.stored_property_id && totals.get(p.stored_property_id) === 1))
      .map((p) => ({ photo_id: p.id, from: p.stored_property_id || null, from_sort: p.sort_order || 0, to: NEW + p.id }));
  }
  if (!moves.length) throw new Fail(409, op === 'unsort' ? 'The selected photos are already unsorted' : 'Nothing to change: the selected photos are already organized that way', 'NOTHING_TO_DO');
  const retired = checkSources(moves, entries, totals);

  // Plan is fixed: create destination entries (idempotent by intake key), then journal + apply.
  const created = [];
  if (op === 'group_new') {
    const q = body.quantity == null || body.quantity === '' ? null : Number(body.quantity);
    if (q != null && (!Number.isFinite(q) || q <= 0 || q > 99999)) throw new Fail(400, 'Quantity must be a positive number');
    const e = await ensureEntry(db, container, user, actionKey, { name: body.name, description: body.description, quantity: q });
    created.push(e.id);
    moves.forEach((m, i) => { m.to = e.id; m.to_sort = i; });
  } else if (op === 'individual') {
    const made = [];
    await inBatches(moves, async (m) => { made.push([m, await ensureEntry(db, container, user, `${actionKey}_${m.photo_id}`, {})]); });
    for (const [m, e] of made) { m.to = e.id; m.to_sort = 0; created.push(e.id); }
  } else if (op === 'group_existing') {
    let s = await nextSort(db, target.id);
    for (const m of moves) m.to_sort = s++;
  } else {
    for (const m of moves) m.to_sort = 0;
  }
  const destinations = [...new Set(moves.map((m) => m.to).filter(Boolean))];
  const details = {
    operation: op, photo_ids: moves.map((m) => m.photo_id), moves,
    source_entry_ids: [...new Set(moves.map((m) => m.from).filter(Boolean))],
    destination_entry_ids: destinations, created_entry_ids: created, retired_entry_ids: retired,
  };
  const type = op.startsWith('group') ? 'photo_group' : 'photo_separate';
  const ev = await journalAndApply(db, user, container, type, actionKey, details, destinations.length === 1 ? destinations[0] : null);
  return summary(ev);
}

/** Most recent organizing operation that is not undone; eligible only if nothing changed since. */
async function findUndoable(db, container) {
  const events = await db.entities.StorageCustodyEvent.filter({ container_id: container.id, event_type: { $in: ORG_TYPES } }, '-performed_at', 25);
  const ev = events.find((e) => e.details?.state === 'completed' && !e.details?.undone_by);
  if (!ev) return { event: null };
  const d = ev.details;
  const photos = await db.entities.StoredPropertyPhoto.filter({ id: { $in: d.photo_ids } }, '-created_date', d.photo_ids.length + 5);
  const byId = new Map(photos.map((p) => [p.id, p]));
  const moved = d.moves.every((m) => { const p = byId.get(m.photo_id); return p && !p.archived && p.container_id === container.id && (p.stored_property_id || null) === m.to; });
  if (!moved) return { event: ev, reason: 'Photos were organized again since then' };
  const ids = [...new Set([...(d.created_entry_ids || []), ...(d.retired_entry_ids || []), ...(d.source_entry_ids || [])])];
  const entries = ids.length ? await db.entities.StoredProperty.filter({ id: { $in: ids } }) : [];
  const ent = new Map(entries.map((e) => [e.id, e]));
  for (const id of d.created_entry_ids || []) {
    const e = ent.get(id);
    if (!e || e.status !== 'in_storage') return { event: ev, reason: 'A new item from this action has changed' };
    if (e.catalog_part_id || e.converted_inventory_item_id) return { event: ev, reason: `"${e.name}" has since been identified as a part` };
  }
  for (const id of d.source_entry_ids || []) {
    const e = ent.get(id);
    const expect = (d.retired_entry_ids || []).includes(id) ? 'retired' : 'in_storage';
    if (!e || e.status !== expect || e.container_id !== container.id) return { event: ev, reason: 'An original item has changed since then' };
  }
  return { event: ev, eligible: true };
}

async function undo(db, user, container, body) {
  if (!idOk(body.event_id)) throw new Fail(400, 'event_id required');
  const actionKey = 'undo_' + body.event_id;
  const done = await replay(db, user, container, actionKey);
  if (done) return done;
  const { event, eligible, reason } = await findUndoable(db, container);
  if (!event || event.id !== body.event_id) throw new Fail(409, 'Only the most recent organizing action can be undone', 'NOT_LATEST');
  if (!eligible) throw new Fail(409, `Undo is no longer available: ${reason}`, 'NOT_ELIGIBLE');
  const d = event.details;
  const moves = d.moves.map((m) => ({ photo_id: m.photo_id, from: m.to, from_sort: m.to_sort, to: m.from, to_sort: m.from_sort }));
  const details = {
    operation: 'undo', undoes_event_id: event.id, undoes_operation: d.operation, photo_ids: d.photo_ids, moves,
    source_entry_ids: d.destination_entry_ids, destination_entry_ids: d.source_entry_ids,
    reactivate_entry_ids: d.retired_entry_ids || [], created_entry_ids: [], retired_entry_ids: d.created_entry_ids || [],
  };
  const ev = await journalAndApply(db, user, container, 'photo_undo', actionKey, details, null);
  await db.entities.StorageCustodyEvent.update(event.id, { details: { ...d, undone_by: ev.id, undone_at: new Date().toISOString() } });
  return summary(ev);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return respond({ error: 'Unauthenticated' }, 401);
    const db = base44.asServiceRole;
    let staff = user.role === 'admin';
    if (!staff) {
      const members = await db.entities.TeamMember.filter({ user_id: user.id });
      staff = members.some((m) => m.is_achtung_kraft_member === true && m.active !== false);
    }
    if (!staff) return respond({ error: 'AK staff only' }, 403);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'search_parts') {
      const q = safeText(body.query, 80);
      if (q.length < 2) return respond({ success: true, parts: [] });
      const re = { $regex: escapeRe(q), $options: 'i' };
      const parts = await db.entities.Part.filter({ $or: [{ part_name: re }, { vendor_part_number: re }] }, 'part_name', 20);
      return respond({ success: true, parts: parts.map((p) => ({ id: p.id, part_name: p.part_name || null, vendor_part_number: p.vendor_part_number || null })) });
    }

    if (!['organize', 'undo', 'last_operation'].includes(action)) return respond({ error: 'Unsupported organizing operation' }, 400);
    if (!idOk(body.container_id)) return respond({ error: 'Valid container_id required' }, 400);
    const [container] = await db.entities.StorageContainer.filter({ id: body.container_id });
    if (!container || container.active === false || container.status === 'archived') return respond({ error: 'Active container not found' }, 404);

    if (action === 'last_operation') {
      const { event, eligible, reason } = await findUndoable(db, container);
      if (!event) return respond({ success: true, operation: null });
      return respond({ success: true, operation: { ...summary(event), performed_at: event.performed_at, performed_by_name: event.details?.performed_by_name || null, eligible: !!eligible, reason: reason || null } });
    }
    const result = action === 'organize' ? await organize(db, user, container, body) : await undo(db, user, container, body);
    return respond({ success: true, ...result });
  } catch (error) {
    if (error instanceof Fail) return respond({ error: error.message, code: error.code || null }, error.status);
    return respond({ error: error?.message || 'Photo organizing service error' }, 500);
  }
});