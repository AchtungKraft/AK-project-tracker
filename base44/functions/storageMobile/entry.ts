import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * Storage Mobile read service (Phase E). Staff-only, read-only.
 * Never mutates containers, contents, inventory, labels or numbering.
 * Moves still go through transferInventoryBatch; organizing through storagePhotoOrganize.
 *
 * Actions:
 *   resolve   {code}         QR text, browser QR token (24-hex id) or /st/{id} URL
 *   container {container_id} tote summary for the mobile tote screen
 *   recent    {}             the caller's own recent totes (stored on their user record)
 *   search    {q, page}      totes by id/name/client/project/location/contents/linked part
 *   locations {}             active locations for the move destination picker
 */
const reply = (o, s = 200) => Response.json(o, { status: s });
const HEX = /^[a-fA-F0-9]{24}$/;
const PAGE = 20;
const live = (c) => c && c.active !== false && c.status !== 'archived';
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseCode(raw) {
  const s = String(raw || '').trim();
  if (HEX.test(s)) return { type: 'CONTAINER', id: s };
  const url = /^https?:\/\/[^/\s]+\/st\/([a-fA-F0-9]{24})\/?(?:[?#].*)?$/i.exec(s);
  if (url) return { type: 'CONTAINER', id: url[1] };
  let m = /^AK_CTR:([a-fA-F0-9]{24})$/.exec(s);
  if (m) return { type: 'CONTAINER', id: m[1] };
  m = /^AK_LOCATION:([a-zA-Z0-9_-]{6,60})$/.exec(s);
  if (m) return { type: 'LOCATION', id: m[1] };
  m = /^AK_LOC:([^:\s]{1,80}):([a-zA-Z0-9_-]{6,60})$/.exec(s);
  if (m) return { type: 'LOCATION_TEMPLATE', template_key: m[1], project_id: m[2] };
  return null;
}

async function summarize(db, containers, withCounts = false) {
  const ids = (f) => [...new Set(containers.map((c) => c[f]).filter(Boolean))];
  const [locations, projects, clients] = await Promise.all([
    db.entities.Location.list('sort_order', 2000),
    ids('project_id').length ? db.entities.Project.filter({ id: { $in: ids('project_id') } }) : [],
    ids('client_account_id').length ? db.entities.ClientAccount.filter({ id: { $in: ids('client_account_id') } }) : [],
  ]);
  const locById = new Map(locations.map((l) => [l.id, l]));
  const pathOf = (id) => {
    const out = []; const seen = new Set();
    while (id && !seen.has(id) && out.length < 10) { seen.add(id); const l = locById.get(id); if (!l) break; out.unshift(l.short_code || l.location_area); id = l.parent_id; }
    return out;
  };
  const pName = new Map(projects.map((p) => [p.id, p.name]));
  const cName = new Map(clients.map((c) => [c.id, c.name]));
  const projClient = new Map(projects.map((p) => [p.id, p.client_account_id]));
  const extraClients = [...new Set(projects.map((p) => p.client_account_id).filter((id) => id && !cName.has(id)))];
  if (extraClients.length) (await db.entities.ClientAccount.filter({ id: { $in: extraClients } })).forEach((c) => cName.set(c.id, c.name));
  return Promise.all(containers.map(async (c) => {
    const clientId = c.client_account_id || projClient.get(c.project_id) || null;
    const row = {
      id: c.id, name: c.name, short_code: c.short_code || null, container_type: c.container_type, color: c.color || null,
      photo: c.photo || null, location_id: c.location_id || null, home_location_id: c.home_location_id || null,
      location_path: pathOf(c.location_id), location_name: locById.get(c.location_id)?.location_area || null,
      project_id: c.project_id || null, project_name: pName.get(c.project_id) || null,
      client_account_id: clientId, client_name: cName.get(clientId) || null,
    };
    if (withCounts) {
      const photos = await db.entities.StoredPropertyPhoto.filter({ container_id: c.id, archived: false }, '-created_date', 2000);
      row.photo_count = photos.length;
      row.unsorted_count = photos.filter((p) => !p.stored_property_id).length;
    }
    return row;
  }));
}

async function resolveCode(db, raw) {
  const p = parseCode(raw);
  if (!p) return { error: 'Not an Ächtung Kraft storage code', status: 400 };
  if (p.type === 'CONTAINER') {
    const [label] = await db.entities.StorageLabel.filter({ id: p.id });
    if (label) {
      if (label.status === 'reserved' || label.status === 'activating') {
        return { kind: 'reserved', label: { id: label.id, short_code: label.short_code, container_type: label.container_type } };
      }
      if (label.status === 'voided') return { error: 'This label has been voided', status: 409 };
      const matches = await db.entities.StorageContainer.filter({ qr_code_value: `AK_CTR:${label.id}` });
      if (matches.length > 1) return { error: 'Duplicate box identity detected. Admin review required.', status: 409 };
      if (!live(matches[0])) return { error: 'This tote is no longer active', status: 404 };
      return { kind: 'container', container_id: matches[0].id };
    }
    const [byId] = await db.entities.StorageContainer.filter({ id: p.id });
    if (live(byId)) return { kind: 'container', container_id: byId.id };
    const [byQr] = await db.entities.StorageContainer.filter({ qr_code_value: `AK_CTR:${p.id}` });
    if (live(byQr)) return { kind: 'container', container_id: byQr.id };
    return { error: 'No active tote for this code', status: 404 };
  }
  const [loc] = p.type === 'LOCATION'
    ? await db.entities.Location.filter({ id: p.id })
    : await db.entities.Location.filter({ template_key: p.template_key, project_id: p.project_id });
  if (!loc || loc.active === false) return { error: 'Storage location not found or inactive', status: 404 };
  return { kind: 'location', location_id: loc.id, location_name: loc.location_area };
}

async function search(db, q, page) {
  const rx = { $regex: escRx(q), $options: 'i' };
  const [direct, clients, projects, locations, contents, parts] = await Promise.all([
    db.entities.StorageContainer.filter({ $or: [{ name: rx }, { short_code: rx }, { description: rx }] }, '-updated_date', 200),
    db.entities.ClientAccount.filter({ name: rx }, 'name', 50),
    db.entities.Project.filter({ name: rx }, 'name', 50),
    db.entities.Location.list('sort_order', 2000),
    db.entities.StoredProperty.filter({ status: 'in_storage', $or: [{ name: rx }, { description: rx }, { notes: rx }] }, '-updated_date', 200),
    db.entities.Part.filter({ $or: [{ part_name: rx }, { vendor_part_number: rx }] }, 'part_name', 50),
  ]);
  // A matching location also matches everything stored below it.
  const re = new RegExp(escRx(q), 'i');
  const children = new Map();
  locations.forEach((l) => { if (l.parent_id) children.set(l.parent_id, [...(children.get(l.parent_id) || []), l.id]); });
  const locHit = new Map();
  locations.filter((l) => l.active !== false && (re.test(l.location_area || '') || re.test(l.short_code || ''))).forEach((l) => {
    const stack = [l.id];
    while (stack.length) { const id = stack.pop(); if (locHit.has(id)) continue; locHit.set(id, l.location_area); stack.push(...(children.get(id) || [])); }
  });
  const partById = new Map(parts.map((p) => [p.id, p]));
  const partContents = parts.length
    ? await db.entities.StoredProperty.filter({ status: 'in_storage', catalog_part_id: { $in: parts.map((p) => p.id) } }, '-updated_date', 200) : [];
  const clientIds = clients.map((c) => c.id); const projectIds = projects.map((p) => p.id); const locIds = [...locHit.keys()];
  const or = [];
  if (clientIds.length) or.push({ client_account_id: { $in: clientIds } });
  if (projectIds.length) or.push({ project_id: { $in: projectIds } });
  if (locIds.length) or.push({ location_id: { $in: locIds } });
  const related = or.length ? await db.entities.StorageContainer.filter({ $or: or }, '-updated_date', 300) : [];

  const hits = new Map(); // container_id -> {score, reasons}
  const add = (id, score, reason) => {
    if (!id) return;
    const h = hits.get(id) || { score: 0, reasons: [] };
    h.score += score;
    if (h.reasons.length < 3 && !h.reasons.includes(reason)) h.reasons.push(reason);
    hits.set(id, h);
  };
  const cName = new Map(clients.map((c) => [c.id, c.name])); const pName = new Map(projects.map((p) => [p.id, p.name]));
  direct.forEach((c) => add(c.id, re.test(c.short_code || '') ? 100 : re.test(c.name || '') ? 60 : 20,
    re.test(c.short_code || '') ? `Tote ${c.short_code}` : re.test(c.name || '') ? 'Tote name' : 'Tote description'));
  related.forEach((c) => {
    if (cName.has(c.client_account_id)) add(c.id, 30, `Client: ${cName.get(c.client_account_id)}`);
    if (pName.has(c.project_id)) add(c.id, 30, `Project: ${pName.get(c.project_id)}`);
    if (locHit.has(c.location_id)) add(c.id, 20, `Location: ${locHit.get(c.location_id)}`);
  });
  contents.forEach((i) => add(i.container_id, 40, `Contents: ${i.name}`));
  partContents.forEach((i) => { const p = partById.get(i.catalog_part_id); add(i.container_id, 50, `Part: ${p?.vendor_part_number ? p.vendor_part_number + ' · ' : ''}${p?.part_name || ''}`); });

  const known = new Map([...direct, ...related].map((c) => [c.id, c]));
  const missing = [...hits.keys()].filter((id) => !known.has(id));
  if (missing.length) (await db.entities.StorageContainer.filter({ id: { $in: missing } })).forEach((c) => known.set(c.id, c));
  const ranked = [...hits.entries()].filter(([id]) => live(known.get(id)))
    .sort((a, b) => b[1].score - a[1].score || String(known.get(a[0]).name).localeCompare(String(known.get(b[0]).name)));
  const slice = ranked.slice(page * PAGE, page * PAGE + PAGE);
  const rows = await summarize(db, slice.map(([id]) => known.get(id)));
  return { results: rows.map((r, i) => ({ ...r, matches: slice[i][1].reasons })), total: ranked.length, page, has_more: (page + 1) * PAGE < ranked.length };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return reply({ error: 'Unauthenticated' }, 401);
    const db = base44.asServiceRole;
    let staff = user.role === 'admin';
    if (!staff) staff = (await db.entities.TeamMember.filter({ user_id: user.id })).some((m) => m.active !== false && m.is_achtung_kraft_member === true);
    if (!staff) return reply({ error: 'AK staff access required' }, 403);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'resolve') {
      const r = await resolveCode(db, body.code);
      return r.error ? reply({ error: r.error }, r.status) : reply({ success: true, ...r });
    }
    if (action === 'container') {
      if (!HEX.test(String(body.container_id || ''))) return reply({ error: 'Valid container_id required' }, 400);
      const [c] = await db.entities.StorageContainer.filter({ id: body.container_id });
      if (!live(c)) return reply({ error: 'Tote not found or no longer active' }, 404);
      const [row] = await summarize(db, [c], true);
      return reply({ success: true, container: row });
    }
    if (action === 'recent') {
      // The caller's own list only (their user record); never another user's activity.
      const ids = (Array.isArray(user.storage_recent_containers) ? user.storage_recent_containers : []).filter((id) => HEX.test(String(id))).slice(0, 8);
      if (!ids.length) return reply({ success: true, containers: [] });
      const found = (await db.entities.StorageContainer.filter({ id: { $in: ids } })).filter(live);
      const byId = new Map(found.map((c) => [c.id, c]));
      return reply({ success: true, containers: await summarize(db, ids.map((id) => byId.get(id)).filter(Boolean)) });
    }
    if (action === 'search') {
      const q = typeof body.q === 'string' ? body.q.trim().slice(0, 80) : '';
      if (q.length < 2) return reply({ success: true, results: [], total: 0, page: 0, has_more: false });
      const page = Number.isInteger(body.page) && body.page >= 0 && body.page < 50 ? body.page : 0;
      return reply({ success: true, ...(await search(db, q, page)) });
    }
    if (action === 'locations') {
      const rows = await db.entities.Location.list('sort_order', 2000);
      return reply({ success: true, locations: rows.filter((l) => l.active !== false).map((l) => ({
        id: l.id, location_area: l.location_area, short_code: l.short_code, parent_id: l.parent_id, location_type: l.location_type,
        color: l.color, project_id: l.project_id, template_key: l.template_key, qr_code_value: l.qr_code_value, active: l.active,
      })) });
    }
    return reply({ error: 'Unknown action' }, 400);
  } catch (e) {
    return reply({ error: e?.message || 'Storage mobile service error' }, 500);
  }
});