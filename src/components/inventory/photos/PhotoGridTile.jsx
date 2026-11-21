import { memo } from "react";
import { BadgeCheck, Check, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import PhotoThumb from "./PhotoThumb";
import { groupColor, photoStatus } from "./photoStatus";

/** Square image tile: image first, status as small markers only. */
function PhotoGridTile({ photo, index, selecting, selected, onOpen, onToggle }) {
  const status = photoStatus(photo);
  const grouped = photo.group_size > 1;
  return (
    <button type="button" onClick={() => (selecting ? onToggle(photo.id) : onOpen(index))}
      aria-pressed={selecting ? selected : undefined}
      aria-label={`${photo.group_name || 'Unsorted photo'}${selected ? ', selected' : ''}`}
      className={cn("relative aspect-square w-full overflow-hidden rounded-md border bg-gray-900 text-left",
        selected ? "border-red-500 ring-2 ring-red-500" : "border-gray-800 hover:border-gray-600")}>
      <PhotoThumb photo={photo} />
      {grouped && (
        <span className={cn("absolute top-1 left-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold text-white", groupColor(photo.group_id))}>
          <Layers className="w-3 h-3" />{photo.group_index}/{photo.group_size}
        </span>
      )}
      {selecting ? (
        <span className={cn("absolute top-1 right-1 w-6 h-6 rounded-full border-2 flex items-center justify-center",
          selected ? "bg-red-600 border-red-600 text-white" : "bg-black/50 border-white/80")}>
          {selected && <Check className="w-4 h-4" />}
        </span>
      ) : photo.identified ? (
        <BadgeCheck className="absolute top-1 right-1 w-5 h-5 text-blue-300 drop-shadow" aria-label="Identified" />
      ) : (
        <span className={cn("absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/60", status.dot)} title={status.label} />
      )}
      {selected && <span className="absolute inset-0 bg-red-600/15 pointer-events-none" />}
      {photo.group_name && (
        <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pt-3 pb-1 text-[10px] leading-tight text-white truncate">
          {photo.group_name}
        </span>
      )}
    </button>
  );
}

export default memo(PhotoGridTile);