import { photoDate, photoStatus } from "./photoStatus";

/** Compact caption strip under the image. */
export default function PhotoViewerInfo({ photo }) {
  const status = photoStatus(photo);
  const description = photo.group_description || photo.caption;
  return (
    <div className="shrink-0 max-h-[28vh] overflow-y-auto border-t border-white/10 bg-black/90 px-4 py-3 space-y-1"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${status.chip}`}>{status.label}</span>
        <span className="text-sm font-semibold text-white break-words">{photo.group_name || 'Unsorted photo'}</span>
        {photo.group_size > 1 && <span className="text-xs text-gray-400">Photo {photo.group_index} of {photo.group_size}</span>}
      </div>
      {photo.part_name && <p className="text-xs text-blue-300 break-words">Catalog: {photo.part_name}</p>}
      {photo.group_quantity != null && <p className="text-xs text-gray-400">Qty {photo.group_quantity}</p>}
      {description && <p className="text-xs text-gray-300 whitespace-pre-wrap break-words">{description}</p>}
      {photo.captured_at && <p className="text-[11px] text-gray-500">Captured {photoDate(photo.captured_at)}</p>}
    </div>
  );
}