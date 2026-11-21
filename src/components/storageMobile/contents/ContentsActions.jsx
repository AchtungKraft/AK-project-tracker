import { Button } from "@/components/ui/button";
import { ArrowRightLeft, BadgeCheck, Pencil } from "lucide-react";

/** Only the actions that fit the selected contents. */
export default function ContentsActions({ items, onAction }) {
  if (!items.length) return <p className="text-[11px] text-gray-500">Tap items or photos to select them.</p>;
  const entries = items.filter((i) => i.kind === 'entry');
  const single = items.length === 1 && entries.length === 1;
  const tracked = entries.filter((e) => e.inventory_linked);
  const actions = [
    { key: 'move', label: 'Move Selected Contents', icon: ArrowRightLeft, show: true, disabled: tracked.length > 0 },
    { key: 'details', label: 'Edit Details', icon: Pencil, show: single },
    { key: 'identify', label: 'Identify as Part', icon: BadgeCheck, show: single && !entries[0].inventory_linked },
  ].filter((a) => a.show);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {actions.map(({ key, label, icon: Icon, disabled }) => (
          <Button key={key} size="sm" variant={key === 'move' ? 'default' : 'outline'} disabled={disabled} onClick={() => onAction(key)}
            className="h-10 shrink-0 gap-1.5 text-xs">
            <Icon className="w-4 h-4" />{label}
          </Button>
        ))}
      </div>
      {tracked.length > 0 && (
        <p className="text-[11px] text-amber-300">"{tracked[0].name}" is tracked inventory. Move its stock from Parts Tracker instead.</p>
      )}
    </div>
  );
}