import { memo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import PhotoThumb from "./PhotoThumb";
import { groupColor, photoDate, photoStatus } from "./photoStatus";

/** Compact list row; stacks cleanly on phones, no table. */
function PhotoListRow({ photo, index, selecting, selected, onOpen, onToggle }) {
  const status = photoStatus(photo);
  const details = [
    photo.group_quantity != null ? `Qty ${photo.group_quantity}` : null,
    photo.group_size > 1 ? `Photo ${photo.group_index} of ${photo.group_size}` : null,
    photoDate(photo.captured_at),
  ].filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={() => (selecting ? onToggle(photo.id) : onOpen(index))}
      aria-pressed={selecting ? selected : undefined}
      className={cn("w-full flex items-center gap-3 rounded-md border p-2 text-left min-h-[64px]",
        selected ? "border-red-500 bg-red-950/20" : "border-gray-800 bg-gray-900/40 hover:border-gray-700")}>
      {selecting && (
        <span className={cn("w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center",
          selected ? "bg-red-600 border-red-600 text-white" : "border-gray-500")}>
          {selected && <Check className="w-4 h-4" />}
        </span>
      )}
      <span className="relative w-14 h-14 shrink-0 overflow-hidden rounded bg-gray-900">
        <PhotoThumb photo={photo} iconClass="w-4 h-4" />
        {photo.group_size > 1 && <span className={cn("absolute bottom-0 inset-x-0 h-1", groupColor(photo.group_id))} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-100 truncate">{photo.group_name || 'Unsorted photo'}</span>
        {photo.part_name && <span className="block text-xs text-blue-300 truncate">{photo.part_name}</span>}
        {details && <span className="block text-xs text-gray-500 truncate">{details}</span>}
      </span>
      <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium", status.chip)}>{status.label}</span>
    </button>
  );
}

export default memo(PhotoListRow);