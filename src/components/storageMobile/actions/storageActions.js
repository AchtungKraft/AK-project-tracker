import { ArrowRightLeft, BadgeCheck, Camera, Eye, Layers, Pencil, Split } from "lucide-react";

/**
 * One action vocabulary for every Storage Mobile screen.
 * Actions depend on what is selected, never on which screen it was selected from.
 * The backend stays authoritative; these rules only decide what to offer.
 */
const TRACKED = 'Tracked inventory moves from Parts Tracker.';

const def = (key, label, icon, extra = {}) => ({ key, label, icon, ...extra });
const move = (label, reason) => def('move', label, ArrowRightLeft, reason ? { disabled: true, reason } : {});

/** Actions for one documented item (shared by item detail and single-item selections). */
export function itemActions(item, { includeOpen = false } = {}) {
  const open = includeOpen ? [def('open', 'View', Eye, { primary: true })] : [];
  if (item.tracked) return [...open, def('details', 'Edit Details', Pencil), move('Move to Tote', TRACKED)];
  return [
    ...open,
    def('details', 'Edit Details', Pencil),
    def('capture', 'Add Photos', Camera),
    def('identify', item.identified ? 'Change Part Match' : 'Identify as Part', BadgeCheck),
    def('separate', 'Separate Photos', Split, item.size > 1 ? {} : { disabled: true, reason: 'This item has one photo; there is nothing to separate.' }),
    move('Move to Tote'),
  ];
}

/**
 * sel: { unsorted: number, groups: [{ id, size, selected, identified, tracked }] }
 * opts.photoLevel: individual photos are selected (Photos mode) rather than whole items (Contents mode).
 * opts.canOpen / opts.canMove: the screen can open item detail / move contents.
 */
export function selectionActions(sel, { photoLevel = false, canOpen = true, canMove = true } = {}) {
  const n = sel.unsorted;
  const groups = sel.groups;
  if (!n && !groups.length) return [];
  const tracked = groups.some((g) => g.tracked);
  const partial = groups.some((g) => g.selected < g.size);
  const moveReason = tracked ? TRACKED
    : partial ? 'Select every photo of the item (or open the item) to move it to another tote.' : null;
  const total = n + groups.length;
  const moveAction = canMove ? [move(total === 1 ? 'Move to Tote' : 'Move Selected', moveReason)] : [];

  if (!groups.length) {
    return n === 1
      ? [def('view', 'View', Eye), def('group', 'Group as Item', Layers, { primary: true }), ...moveAction]
      : [def('group', 'Group as Item', Layers, { primary: true }), def('individual', 'Separate into Items', Split), ...moveAction];
  }
  if (groups.length === 1 && !n) {
    const g = groups[0];
    const actions = itemActions(g, { includeOpen: canOpen })
      .filter((a) => canOpen || (a.key !== 'capture'))
      .filter((a) => canMove || a.key !== 'move')
      .map((a) => (a.key === 'move' && !a.disabled && moveReason ? { ...a, disabled: true, reason: moveReason } : a));
    // In Photos mode the selected photos themselves can be separated or regrouped.
    if (photoLevel) {
      return actions
        .map((a) => (a.key === 'separate' ? { ...a, disabled: false, reason: undefined } : a))
        .concat(def('group', 'Group as Item', Layers));
    }
    return actions;
  }
  // Several items, or items plus unsorted photos.
  if (photoLevel) return [def('group', 'Group as Item', Layers, { primary: true }), def('separate', 'Separate Photos', Split), ...moveAction];
  return moveAction.map((a) => ({ ...a, label: 'Move Selected Contents', primary: !a.disabled }));
}