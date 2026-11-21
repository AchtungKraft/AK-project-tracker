import { Button } from "@/components/ui/button";
import { ArrowRightLeft, BadgeCheck, Camera, Pencil, Split } from "lucide-react";

/** Contextual actions for one item. Tracked inventory keeps only read-only details. */
export default function EntryDetailActions({ item, onAction }) {
  const tracked = item.inventory_linked;
  const actions = [
    { key: 'capture', label: 'Add Photos', icon: Camera, show: !tracked },
    { key: 'details', label: 'Edit Details', icon: Pencil, show: true },
    { key: 'identify', label: 'Identify as Part', icon: BadgeCheck, show: !tracked },
    { key: 'separate', label: 'Separate Photos', icon: Split, show: !tracked && item.photo_count > 1 },
    { key: 'move', label: 'Move to Another Tote', icon: ArrowRightLeft, show: !tracked },
  ].filter((a) => a.show);
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        {actions.map(({ key, label, icon: Icon }) => (
          <Button key={key} variant="outline" onClick={() => onAction(key)}
            className={`h-11 gap-1.5 text-xs justify-start border-gray-700 text-gray-100 ${key === 'move' ? 'col-span-2 justify-center' : ''}`}>
            <Icon className="w-4 h-4 shrink-0" /><span className="truncate">{label}</span>
          </Button>
        ))}
      </div>
      {tracked && <p className="text-[11px] text-amber-300">This item is tracked inventory. Move or change its stock from Parts Tracker.</p>}
    </div>
  );
}