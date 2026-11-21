import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * Phase E.1: move individual physical contents (whole content entries with all their photos,
 * and unsorted photos) from one tote to another. Separate from moving a whole tote.
 *
 * Changes ONLY StoredProperty.container_id and StoredPropertyPhoto.container_id. Never touches
 * files, ids, names, quantities, part links, inventory, purchasing, labels or tote numbering.
 *
 * No multi-record transactions exist on the platform, so every move is:
 *   1. journaled first (StorageCustodyEvent move_property, state pending, full plan, op_key),
 *   2. checked against other pending moves of the same records (earliest journal wins),
 *   3. re-validated against current data, then applied idempotently,
 *   4. swept so every photo of a moved item ends in the destination, then marked completed.
 * A retry with the same op_key resumes the same plan; a crashed move is resumed by the next
 * conflicting request or by its own retry.
 */
const respond = (d, s = 200) => Response.json(d, { status: s });
const idOk = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{12,120}$/.test(s);
const MAX_ENTRIES = 50, MAX_LOOSE = 100, MAX_PHOTOS = 600;
const STALE_MS = 2 * 60_000;
const TYPE = 'move_property';

class Fail extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }

async function inBatches(items, fn, size = 6) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

const activeTote = (c) => c && c.active !== false && c.status !== 'archived' && c.label_state !== 'voided';
const toteRef = (c) => ({ id: c.id, short_code: c.short_code || null, name: c.name || null, location_id: c.location_id || null });

async function loadTote(db, id, label) {
  if (!idOk(id)) throw new Fail(400, `Valid ${label} tote required`);
  const [c] = await db.entities.StorageContainer.filter({ id });
  if (!activeTote(c)) throw new Fail(404, `The ${label} tote was not found or is not active`, 'TOTE_INACTIVE');
  return c;
}

const cleanIds = (list, max, what) => {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Fail(400, `Invalid ${what} list`);
  const ids = [...new Set(list)];
  if (!ids.every(idOk)) throw new Fail(400, `Invalid ${what} id`);
  if (ids.length > max) throw new Fail(400, `Move at most ${max} ${what}s at a time`);
  return ids;
};

/** Validates the selection against CURRENT data and returns the move plan. */
async function buildPlan(db, source, entryIds, looseIds) {
  const entries = entryIds.length ? await db.entities.StoredProperty.filter({ id: { $in: entryIds } }, '-created_date', entryIds.length + 5) : [];
  if (entries.length !== entryIds.length) throw new Fail(404, 'Some selected items no longer exist', 'MISSING');
  for (const e of entries) {
    if (e.container_id !== source.id || e.status !== 'in_storage') throw new Fail(409, `"${e.name}" is no longer in this tote`, 'NOT_IN_SOURCE');
    if (e.converted_inventory_item_id) {
      throw new Fail(409, `"${e.name}" is tracked inventory. Its stock must be moved with the Parts Tracker inventory move, which keeps quantities and locations correct. Nothing was moved.`, 'INVENTORY_LINKED');
    }
  }
  const loose = looseIds.length ? await db.entities.StoredPropertyPhoto.filter({ id: { $in: looseIds } }, '-created_date', looseIds.length + 5) : [];
  if (loose.length !== looseIds.length) throw new Fail(404, 'Some selected photos no longer exist', 'MISSING');
  for (const p of loose) {
    if (p.archived || p.container_id !== source.id) throw new Fail(409, 'A selected photo is no longer in this tote', 'NOT_IN_SOURCE');
    if (p.stored_property_id) throw new Fail(409, 'A selected photo now belongs to an item. Move the whole item, or use Separate first.', 'PHOTO_GROUPED');
  }
  const entryPhotos = entries.length
    ? await db.entities.StoredPropertyPhoto.filter({ stored_property_id: { $in: entryIds }, archived: false }, '-created_date', MAX_PHOTOS + 1) : [];
  if (entryPhotos.length > MAX_PHOTOS) throw new Fail(400, `These items hold more than ${MAX_PHOTOS} photos. Move fewer items at a time.`);
  return {
    entry_ids: entryIds, loose_photo_ids: looseIds,
    entry_names: entries.map((e) => e.name),
    entry_photo_moves: entryPhotos.map((p) => ({ photo_id: p.id, entry_id: p.stored_property_id, from_container_id: p.container_id })),
  };
}

const touched = (d) => new Set([...(d.entry_ids || []), ...(d.loose_photo_ids || [])]);
const earlier = (a, b) => a.created_date < b.created_date || (a.created_date === b.created_date && a.id < b.id);

/** Applies a journaled plan. Idempotent: safe to run again after a crash. */
async function applyPlan(db, user, d) {
  const dest = d.to_container_id, src = d.from_container_id;
  await inBatches(d.entry_ids, (id) => db.entities.StoredProperty.update(id, { container_id: dest, last_updated_by: user.id }));
  await inBatches(d.entry_photo_moves.map((m) => m.photo_id), (id) => db.entities.StoredPropertyPhoto.update(id, { container_id: dest }));
  await inBatches(d.loose_photo_ids, (id) => db.entities.StoredPropertyPhoto.update(id, { container_id: dest }));
  // Sweep: a photo added to a moved item meanwhile still travels with it (never a partial item).
  let swept = [];
  if (d.entry_ids.length) {
    const rows = await db.entities.StoredPropertyPhoto.filter({ stored_property_id: { $in: d.entry_ids }, archived: false }, '-created_date', MAX_PHOTOS + 50);
    swept = rows.filter((p) => p.container_id !== dest).map((p) => p.id);
    await inBatches(swept, (id) => db.entities.StoredPropertyPhoto.update(id, { container_id: dest }));
  }
  // A loose photo grouped into an item that stayed behind goes back with that item.
  const loose = d.loose_photo_ids.length ? await db.entities.StoredPropertyPhoto.filter({ id: { $in: d.loose_photo_ids } }, '-created_date', d.loose_photo_ids.length + 5) : [];
  const moved = new Set(d.entry_ids);
  const returned = loose.filter((p) => p.stored_property_id && !moved.has(p.stored_property_id)).map((p) => p.id);
  await inBatches(returned, (id) => db.entities.StoredPropertyPhoto.update(id, { container_id: src }));
  return { swept, returned };
}

async function complete(db, user, ev, extra = {}) {
  const r = await applyPlan(db, user, ev.details);
  const moved = [...new Set([...ev.details.entry_photo_moves.map((m) => m.photo_id), ...r.swept, ...ev.details.loose_photo_ids.filter((id) => !r.returned.includes(id))])];
  return db.entities.StorageCustodyEvent.update(ev.id, {
    details: { ...ev.details, ...extra, state: 'completed', completed_at: new Date().toISOString(), moved_photo_ids: moved, swept_photo_ids: r.swept, returned_photo_ids: r.returned },
  });
}

async function abort(db, ev, reason) {
  await db.entities.StorageCustodyEvent.update(ev.id, {
    action_key: `${ev.action_key}:aborted:${ev.id}`,
    details: { ...ev.details, state: 'aborted', aborted_reason: reason, aborted_at: new Date().toISOString() },
  });
}

const summary = (ev) => ({
  event_id: ev.id, operation_id: ev.details.operation_id,
  moved_entries: ev.details.entry_ids.length,
  moved_photos: ev.details.moved_photo_ids?.length ?? 0,
  moved_loose_photos: ev.details.loose_photo_ids.length - (ev.details.returned_photo_ids?.length || 0),
  destination: ev.details.to_tote, source: ev.details.from_tote,
});

async function move(db, user, body) {
  if (!idOk(body.op_key)) throw new Fail(400, 'Stable op_key required');
  const actionKey = 'cmove_' + body.op_key;
  const [prior] = await db.entities.StorageCustodyEvent.filter({ action_key: actionKey }, 'created_date', 1);
  if (prior) {
    if (prior.details?.state === 'completed') return { ...summary(prior), idempotent_hit: true };
    return { ...summary(await complete(db, user, prior, { resumed: true })), resumed: true };
  }
  const entryIds = cleanIds(body.entry_ids, MAX_ENTRIES, 'item');
  const looseIds = cleanIds(body.photo_ids, MAX_LOOSE, 'photo');
  if (!entryIds.length && !looseIds.length) throw new Fail(400, 'Select at least one item or photo to move');
  const source = await loadTote(db, body.source_container_id, 'source');
  const dest = await loadTote(db, body.destination_container_id, 'destination');
  if (source.id === dest.id) throw new Fail(400, 'Choose a different tote. The contents are already in this one.', 'SAME_TOTE');

  const plan = await buildPlan(db, source, entryIds, looseIds);
  const now = new Date().toISOString();
  const ev = await db.entities.StorageCustodyEvent.create({
    event_type: TYPE, container_id: source.id, from_container_id: source.id, to_container_id: dest.id,
    from_location_id: source.location_id || undefined, to_location_id: dest.location_id || undefined,
    stored_property_id: entryIds.length === 1 ? entryIds[0] : undefined,
    performed_by: user.id, performed_at: now, action_key: actionKey,
    notes: 'Physical contents moved between totes. No inventory, purchasing or file changes.',
    details: {
      kind: 'content_move', physical_move: true, operation_id: body.op_key, state: 'pending',
      from_container_id: source.id, to_container_id: dest.id, from_tote: toteRef(source), to_tote: toteRef(dest),
      performed_by_name: user.full_name || user.email || null, ...plan,
    },
  });

  // Earliest journal wins when two moves touch the same records at once.
  const mine = touched(ev.details);
  const recent = await db.entities.StorageCustodyEvent.filter({ event_type: TYPE, from_container_id: source.id }, '-created_date', 50);
  const rival = recent.find((o) => o.id !== ev.id && o.details?.state === 'pending' && earlier(o, ev) && [...touched(o.details)].some((id) => mine.has(id)));
  if (rival) {
    if (Date.now() - new Date(rival.performed_at).getTime() > STALE_MS) await complete(db, user, rival, { recovered_by: ev.id });
    await abort(db, ev, `conflict:${rival.id}`);
    throw new Fail(409, 'Someone else is moving some of these contents right now. Refresh the tote and try again.', 'CONFLICT');
  }
  // Re-check against current data now that this move holds the records.
  let fresh;
  try { fresh = await buildPlan(db, source, entryIds, looseIds); }
  catch (e) {
    await abort(db, ev, `revalidate:${e.code || e.message}`);
    // A duplicate submit of this same move may have just finished it.
    const [twin] = await db.entities.StorageCustodyEvent.filter({ action_key: actionKey }, 'created_date', 1);
    if (twin?.details?.state === 'completed') return { ...summary(twin), idempotent_hit: true };
    throw e;
  }
  const working = { ...ev, details: { ...ev.details, ...fresh } };
  return summary(await complete(db, user, working));
}

/** Content moves into and out of a tote (whole-tote moves are a separate history). */
async function history(db, body) {
  const c = await loadTote(db, body.container_id, 'requested');
  const [out, inn] = await Promise.all([
    db.entities.StorageCustodyEvent.filter({ event_type: TYPE, from_container_id: c.id }, '-performed_at', 25),
    db.entities.StorageCustodyEvent.filter({ event_type: TYPE, to_container_id: c.id }, '-performed_at', 25),
  ]);
  const rows = [...out, ...inn].filter((e) => e.details?.kind === 'content_move' && e.details?.state === 'completed')
    .sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1)).slice(0, 25);
  return rows.map((e) => {
    const d = e.details, outgoing = d.from_container_id === c.id;
    return {
      id: e.id, operation_id: d.operation_id, direction: outgoing ? 'out' : 'in', other_tote: outgoing ? d.to_tote : d.from_tote,
      entry_names: d.entry_names || [], entries: d.entry_ids.length,
      loose_photos: d.loose_photo_ids.length - (d.returned_photo_ids?.length || 0), photos: d.moved_photo_ids?.length || 0,
      performed_at: e.performed_at, performed_by_name: d.performed_by_name || null,
    };
  });
}

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
    if (body?.action === 'move') return respond({ success: true, ...(await move(db, user, body)) });
    if (body?.action === 'history') return respond({ success: true, moves: await history(db, body) });
    return respond({ error: 'Unsupported content move operation' }, 400);
  } catch (error) {
    if (error instanceof Fail) return respond({ error: error.message, code: error.code || null }, error.status);
    return respond({ error: error?.message || 'Content move service error' }, 500);
  }
});