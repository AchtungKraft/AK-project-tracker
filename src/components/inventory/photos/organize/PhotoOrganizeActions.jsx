import { Button } from "@/components/ui/button";
import { BadgeCheck, Layers, Pencil, Split } from "lucide-react";

/** Contextual actions for the current selection; only actions that fit the selection are shown. */
export default function PhotoOrganizeActions({ info, onAction }) {
  if (!info.count) return <p className="text-[11px] text-gray-500">Tap photos to select them.</p>;
  const single = !!info.singleEntryId;
  const actions = [
    { key: 'group', label: 'Group as Item', icon: Layers, show: true },
    { key: 'separate', label: 'Separate', icon: Split, show: true },
    { key: 'details', label: 'Add Details', icon: Pencil, show: single },
    { key: 'identify', label: 'Identify as Part', icon: BadgeCheck, show: single },
  ].filter((a) => a.show);
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
      {actions.map(({ key, label, icon: Icon }) => (
        <Button key={key} size="sm" variant="outline" onClick={() => onAction(key)} className="h-10 shrink-0 gap-1.5 text-xs border-gray-700 text-gray-100">
          <Icon className="w-4 h-4" />{label}
        </Button>
      ))}
    </div>
  );
}