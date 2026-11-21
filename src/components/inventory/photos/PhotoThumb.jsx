import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { requestPreview } from "@/lib/totePhotoApi";

/**
 * Renders the small preview only, never the original. A missing preview is built on the
 * server once the tile scrolls into view; until then a placeholder is shown.
 */
export default function PhotoThumb({ photo, iconClass = "w-6 h-6", onBroken }) {
  const [url, setUrl] = useState(photo.thumb_url);
  const [pending, setPending] = useState(false);
  const [broken, setBroken] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (photo.thumb_url) { setUrl(photo.thumb_url); setBroken(false); } }, [photo.thumb_url]);

  useEffect(() => {
    if (url || !photo.needs_preview || !ref.current) return;
    let live = true;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setPending(true);
      requestPreview(photo.id).then((u) => { if (live) { setPending(false); if (u) setUrl(u); } });
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => { live = false; io.disconnect(); };
  }, [photo.id, photo.needs_preview, url]);

  if (url && !broken) {
    return <img src={url} alt={photo.group_name || 'Tote photo'} loading="lazy" decoding="async"
      onError={() => { setBroken(true); onBroken?.(); }} className="w-full h-full object-cover" />;
  }
  return (
    <div ref={ref} className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gray-800/70 text-gray-500">
      {pending ? <Loader2 className={`${iconClass} animate-spin`} /> : <ImageIcon className={iconClass} />}
      <span className="text-[9px] leading-none">{pending ? 'Preparing' : 'No preview'}</span>
    </div>
  );
}