import { memo } from "react";
import { BadgeCheck, Check, ChevronRight, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import PhotoThumb from "@/components/inventory/photos/PhotoThumb";
import { itemIdentity, itemMeta } from "./contentLabels";

/** List form of a content item. */
function ContentRow({ item, selecting, selected, onOpen, onToggle, onBroken }) {
  const entry = item.kind === 'entry';
  return (
    <button type="button" onClick={() => (selecting ? onToggle(item) : onOpen(item))} aria-pressed={selecting ? selected : undefined}
      className={cn("flex w-full items-center gap-3 rounded-lg border bg-gray-900/60 p-1.5 pr-2 text-left min-w-0",
        selected ? "border-red-500 bg-red-950/20" : "border-gray-800 active:bg-gray-800")}>
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-gray-900">
        {item.cover ? <PhotoThumb photo={item.cover} iconClass="w-5 h-5" onBroken={onBroken} />
          : <span className="flex h-full items-center justify-center text-gray-600"><Package className="w-5 h-5" /></span>}
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn("block text-sm truncate", entry ? "font-semibold text-white" : "text-gray-400")}>{entry ? item.name : 'Unsorted photo'}</span>
        {entry && <span className="block text-[11px] text-gray-400 truncate">{itemMeta(item)}</span>}
        {entry && (() => { const id = itemIdentity(item); return (
          <span className={cn("block text-[11px] truncate", id.identified ? "font-medium text-blue-300" : "text-gray-500")}>{id.identified && !item.inventory_linked ? `Identified: ${id.text}` : id.text}</span>
        ); })()}
      </span>
      {item.identified && !selecting && <BadgeCheck className="w-4 h-4 shrink-0 text-blue-300" aria-label="Identified" />}
      {selecting ? (
        <span className={cn("w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center",
          selected ? "bg-red-600 border-red-600 text-white" : "border-gray-500")}>{selected && <Check className="w-4 h-4" />}</span>
      ) : <ChevronRight className="w-4 h-4 shrink-0 text-gray-600" />}
    </button>
  );
}

export default memo(ContentRow);