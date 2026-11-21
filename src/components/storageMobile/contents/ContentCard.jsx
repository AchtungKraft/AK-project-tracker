import { memo } from "react";
import { BadgeCheck, Check, Images, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import PhotoThumb from "@/components/inventory/photos/PhotoThumb";
import { itemMeta } from "./contentLabels";

/** One physical thing in the tote: a whole content entry or a single unsorted photo. */
function ContentCard({ item, selecting, selected, onOpen, onToggle, onBroken }) {
  const entry = item.kind === 'entry';
  return (
    <button type="button" onClick={() => (selecting ? onToggle(item) : onOpen(item))}
      aria-pressed={selecting ? selected : undefined}
      aria-label={`${entry ? item.name : 'Unsorted photo'}${selected ? ', selected' : ''}`}
      className={cn("relative aspect-square w-full overflow-hidden rounded-lg border bg-gray-900 text-left",
        selected ? "border-red-500 ring-2 ring-red-500" : "border-gray-800 hover:border-gray-600")}>
      {item.cover ? <PhotoThumb photo={item.cover} onBroken={onBroken} />
        : <div className="flex h-full items-center justify-center text-gray-600"><Package className="w-8 h-8" /></div>}
      {entry && item.photo_count > 1 && (
        <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold text-white">
          <Images className="w-3 h-3" />{item.photo_count}
        </span>
      )}
      {selecting ? (
        <span className={cn("absolute top-1 right-1 w-6 h-6 rounded-full border-2 flex items-center justify-center",
          selected ? "bg-red-600 border-red-600 text-white" : "bg-black/50 border-white/80")}>
          {selected && <Check className="w-4 h-4" />}
        </span>
      ) : item.identified && <BadgeCheck className="absolute top-1 right-1 w-5 h-5 text-blue-300 drop-shadow" aria-label="Identified" />}
      {selected && <span className="absolute inset-0 bg-red-600/15 pointer-events-none" />}
      {entry ? (
        <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-1.5 pt-4 pb-1 text-white">
          <span className="block text-[11px] font-semibold leading-tight truncate">{item.name}</span>
          <span className="block text-[10px] leading-tight text-gray-300 truncate">{itemMeta(item)}</span>
        </span>
      ) : (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] uppercase tracking-wide text-gray-300">Unsorted</span>
      )}
    </button>
  );
}

export default memo(ContentCard);