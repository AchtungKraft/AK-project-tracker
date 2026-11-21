import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { fetchPhotoOriginal } from "@/lib/totePhotoApi";
import { useZoomPan } from "./useZoomPan";
import PhotoViewerInfo from "./PhotoViewerInfo";

const originalQuery = (id) => ({
  queryKey: ['storagePhotoOriginal', id], queryFn: () => fetchPhotoOriginal(id), staleTime: 10 * 60_000, retry: 1,
});

/** Full-screen, image-first viewer. Originals load only here, one at a time. */
export default function PhotoViewer({ photos, index, total, hasMore, loadMore, onIndex, onClose }) {
  const qc = useQueryClient();
  const photo = photos[index];
  const [waitingNext, setWaitingNext] = useState(false);
  const { data: original, isLoading, isError } = useQuery({ ...originalQuery(photo?.id), enabled: !!photo });
  const atEnd = index >= photos.length - 1;
  const go = useCallback((dir) => {
    if (dir < 0 && index > 0) onIndex(index - 1);
    else if (dir > 0 && !atEnd) onIndex(index + 1);
    else if (dir > 0 && hasMore && !waitingNext) { setWaitingNext(true); loadMore(); }
  }, [index, atEnd, hasMore, waitingNext, loadMore, onIndex]);
  const zoom = useZoomPan(photo?.id, go);

  useEffect(() => {
    if (!waitingNext) return;
    if (!atEnd) { setWaitingNext(false); onIndex(index + 1); } else if (!hasMore) setWaitingNext(false);
  }, [waitingNext, atEnd, hasMore, index, onIndex]);
  useEffect(() => { // prefetch the neighbours' originals
    [photos[index + 1], photos[index - 1]].filter(Boolean).forEach((p) => qc.prefetchQuery(originalQuery(p.id)));
  }, [index, photos, qc]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [go, onClose]);

  if (!photo) return null;
  const stop = { onTouchStart: (e) => e.stopPropagation(), onTouchEnd: (e) => e.stopPropagation() };
  const navBtn = "absolute top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-0";
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className="shrink-0 flex items-center gap-2 px-2 py-2 border-b border-white/10" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
        <button type="button" onClick={onClose} aria-label="Close viewer" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10">
          <X className="w-6 h-6" />
        </button>
        <span className="text-sm text-gray-300">{index + 1} of {total ?? photos.length}</span>
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-right pr-2">{photo.group_name || 'Unsorted photo'}</span>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden touch-none select-none" {...zoom.handlers}>
        <div className="w-full h-full flex items-center justify-center" style={zoom.style}>
          {original || photo.thumb_url ? (
            <img src={original || photo.thumb_url} alt={photo.group_name || 'Tote photo'} draggable={false}
              className="max-w-full max-h-full object-contain" />
          ) : null}
        </div>
        {(isLoading || waitingNext) && <Loader2 className="absolute top-3 right-3 w-5 h-5 animate-spin text-gray-300" />}
        {isError && <p className="absolute inset-x-0 bottom-3 text-center text-xs text-red-300">Full-size photo unavailable. Showing preview.</p>}
        {!zoom.zoomed && <>
          <button type="button" {...stop} aria-label="Previous photo" onClick={() => go(-1)} disabled={index === 0} className={`${navBtn} left-2`}>
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button type="button" {...stop} aria-label="Next photo" onClick={() => go(1)} disabled={atEnd && !hasMore} className={`${navBtn} right-2`}>
            <ChevronRight className="w-6 h-6" />
          </button>
        </>}
      </div>
      <PhotoViewerInfo photo={photo} />
    </div>,
    document.body,
  );
}