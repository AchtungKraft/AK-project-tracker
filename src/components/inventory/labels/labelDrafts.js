// Print drafts: what one label will print, plus what is saved on the container.
// Opening or cancelling a print never saves; only pendingChanges() + explicit Save does.

export const GENERAL_FALLBACK = { id: null, key: 'general', name: 'General Storage', color: '#6b7280' };

export function resolveCategory(categories, id) {
  const active = (categories || []).filter(c => c.active !== false);
  return active.find(c => c.id === id) || active.find(c => c.key === 'general') || GENERAL_FALLBACK;
}

export function draftFromContainer(c) {
  return {
    key: c.id, container_id: c.id, short_code: c.short_code || '',
    qr_code_value: c.qr_code_value || '', container_type: c.container_type,
    saved_name: c.name || '', name: c.name || '',
    saved_category_id: c.storage_category_id || null, category_id: c.storage_category_id || null,
  };
}

export function draftFromReserved(l) {
  return {
    key: l.id, container_id: null, short_code: l.short_code, qr_code_value: l.qr_code_value,
    container_type: l.container_type, saved_name: '', name: '', saved_category_id: null, category_id: null,
  };
}

export const toPrintLabel = (d, categories) => ({
  name: d.name, short_code: d.short_code, qr_code_value: d.qr_code_value,
  category: resolveCategory(categories, d.category_id),
});

export function pendingChanges(drafts) {
  return drafts.filter(d => d.container_id).map(d => {
    const item = { container_id: d.container_id };
    if (d.name.trim() !== d.saved_name) item.name = d.name.trim();
    if (d.category_id !== d.saved_category_id) item.storage_category_id = d.category_id;
    return item;
  }).filter(i => Object.keys(i).length > 1);
}

/** After a successful save, the saved values become the new baseline. */
export function markSaved(drafts, saved) {
  const byId = new Map(saved.map(s => [s.id, s]));
  return drafts.map(d => {
    const s = byId.get(d.container_id);
    return s ? { ...d, name: s.name, saved_name: s.name,
      category_id: s.storage_category_id || null, saved_category_id: s.storage_category_id || null } : d;
  });
}