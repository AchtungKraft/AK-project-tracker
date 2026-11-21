/** Describes a photo selection: which items it touches and what organizing would do to them. */
export function selectionInfo(photos) {
  const groups = new Map();
  let unsorted = 0;
  for (const p of photos) {
    if (!p.group_id) { unsorted++; continue; }
    const g = groups.get(p.group_id) || { id: p.group_id, name: p.group_name, size: p.group_size || 0, identified: p.identified, part_name: p.part_name, selected: 0 };
    g.selected++;
    groups.set(p.group_id, g);
  }
  const list = [...groups.values()];
  return {
    count: photos.length,
    unsorted,
    groups: list,
    grouped: photos.length - unsorted,
    singleEntryId: unsorted === 0 && list.length === 1 ? list[0].id : null,
  };
}

/** Items that would be left with no photos if the selection moved out (excluding a target item). */
export function emptiedBy(info, targetId = null) {
  return info.groups.filter((g) => g.id !== targetId && g.size > 0 && g.selected >= g.size);
}