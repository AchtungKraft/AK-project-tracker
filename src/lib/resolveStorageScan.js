/**
 * resolveStorageScan — Canonical QR payload resolver for Storage Platform V2.
 *
 * Supported QR formats (production):
 *   AK_LOCATION:{id}              — Location by entity ID
 *   AK_LOC:{template_key}:{project_id} — Project storage location by template
 *   AK_CTR:{container_id}         — Container by entity ID
 *
 * Returns: { entity_type, entity_id, entity, valid, error }
 */

/**
 * Parse a raw QR string into a structured descriptor (no DB lookup).
 * Returns { type, id, template_key, project_id } or null.
 */
export function parseQRPayload(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // AK_LOCATION:{id}
  if (trimmed.startsWith('AK_LOCATION:')) {
    const id = trimmed.slice('AK_LOCATION:'.length);
    if (id) return { type: 'LOCATION', id };
  }

  // AK_LOC:{template_key}:{project_id}
  if (trimmed.startsWith('AK_LOC:')) {
    const rest = trimmed.slice('AK_LOC:'.length);
    const parts = rest.split(':');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { type: 'LOCATION_TEMPLATE', template_key: parts[0], project_id: parts[1] };
    }
  }

  // AK_CTR:{container_id}
  if (trimmed.startsWith('AK_CTR:')) {
    const id = trimmed.slice('AK_CTR:'.length);
    if (id) return { type: 'CONTAINER', id };
  }

  return null;
}

/**
 * Resolve a parsed QR descriptor against live data arrays.
 * @param {string} rawQR - The decoded QR string
 * @param {{ locations: Array, containers: Array, inventoryItems: Array }} data
 * @returns {{ entity_type: string, entity_id: string|null, entity: object|null, valid: boolean, error: string|null, raw: string }}
 */
export function resolveStorageScan(rawQR, { locations = [], containers = [], inventoryItems = [] } = {}) {
  const base = { raw: rawQR, entity_type: null, entity_id: null, entity: null, valid: false, error: null };

  const parsed = parseQRPayload(rawQR);
  if (!parsed) {
    return { ...base, error: 'QR not recognized — not an Ächtung Kraft storage code' };
  }

  // ── LOCATION by ID ──
  if (parsed.type === 'LOCATION') {
    const loc = locations.find(l => l.id === parsed.id);
    if (!loc) {
      return { ...base, entity_type: 'LOCATION', entity_id: parsed.id, error: 'Storage location no longer exists' };
    }
    if (loc.active === false) {
      return { ...base, entity_type: 'LOCATION', entity_id: loc.id, entity: loc, error: 'Storage location is inactive' };
    }
    return { ...base, entity_type: 'LOCATION', entity_id: loc.id, entity: loc, valid: true };
  }

  // ── LOCATION by template key + project ──
  if (parsed.type === 'LOCATION_TEMPLATE') {
    const loc = locations.find(l =>
      l.template_key === parsed.template_key &&
      l.project_id === parsed.project_id
    );
    if (!loc) {
      return { ...base, entity_type: 'LOCATION', error: 'Project storage location no longer exists' };
    }
    if (loc.active === false) {
      return { ...base, entity_type: 'LOCATION', entity_id: loc.id, entity: loc, error: 'Storage location is inactive' };
    }
    return { ...base, entity_type: 'LOCATION', entity_id: loc.id, entity: loc, valid: true };
  }

  // ── CONTAINER by ID ──
  if (parsed.type === 'CONTAINER') {
    const ctr = containers.find(c => c.id === parsed.id);
    if (!ctr) {
      return { ...base, entity_type: 'CONTAINER', entity_id: parsed.id, error: 'Container no longer exists' };
    }
    if (ctr.active === false || ctr.status === 'archived') {
      return { ...base, entity_type: 'CONTAINER', entity_id: ctr.id, entity: ctr, error: 'Container is archived' };
    }
    return { ...base, entity_type: 'CONTAINER', entity_id: ctr.id, entity: ctr, valid: true };
  }

  return { ...base, error: 'QR format not supported' };
}

/**
 * Build a breadcrumb path string for a location.
 */
export function buildBreadcrumb(locationId, locations) {
  const path = [];
  let cur = locationId;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const l = locations.find(x => x.id === cur);
    if (!l) break;
    path.unshift(l.location_area);
    cur = l.parent_id;
  }
  return path.join(' › ');
}