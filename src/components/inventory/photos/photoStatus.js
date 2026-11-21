/** Shared status vocabulary for tote photos. */
export function photoStatus(photo) {
  if (photo.identified) return { key: 'identified', label: 'Identified', chip: 'bg-blue-950/60 border-blue-800/60 text-blue-200', dot: 'bg-blue-400' };
  if (photo.group_id) return { key: 'documented', label: 'Documented', chip: 'bg-indigo-950/60 border-indigo-800/60 text-indigo-200', dot: 'bg-indigo-400' };
  return { key: 'unsorted', label: 'Unsorted', chip: 'bg-amber-950/50 border-amber-800/60 text-amber-200', dot: 'bg-amber-400' };
}

const GROUP_COLORS = ['bg-indigo-600', 'bg-teal-600', 'bg-fuchsia-600', 'bg-sky-600', 'bg-emerald-600', 'bg-orange-600'];

/** Photos of the same content entry share one marker color. */
export function groupColor(groupId) {
  let h = 0;
  for (const c of groupId || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

export const photoDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : null;