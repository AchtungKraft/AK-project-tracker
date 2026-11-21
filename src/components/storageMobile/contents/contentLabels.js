export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Short secondary line for an item: photos and quantity. */
export function itemMeta(item) {
  if (item.kind === 'photo') return 'Unsorted photo';
  return [
    plural(item.photo_count, 'photo'),
    item.quantity != null ? `Qty ${item.quantity}` : null,
  ].filter(Boolean).join(' · ');
}

/** Identification line: tracked inventory, the catalog part name, or not identified. */
export function itemIdentity(item) {
  if (item.inventory_linked) return { identified: true, text: 'Tracked inventory' };
  if (item.identified) return { identified: true, text: item.part_name || 'Catalog part' };
  return { identified: false, text: 'Not identified' };
}

/** Pseudo photo so the existing organize dialogs can act on a whole content entry. */
export const entryAsPhoto = (item) => ({
  id: item.cover?.id || item.id, group_id: item.id, group_name: item.name, group_size: item.photo_count,
  identified: item.identified, part_name: item.part_name,
});

/** "2 items with 5 photos and 1 unsorted photo" */
export function describeSelection(entries, photos) {
  const photoTotal = entries.reduce((n, e) => n + (e.photo_count || 0), 0);
  const parts = [];
  if (entries.length) parts.push(`${plural(entries.length, 'item')} with ${plural(photoTotal, 'photo')}`);
  if (photos.length) parts.push(plural(photos.length, 'unsorted photo'));
  return parts.join(' and ');
}