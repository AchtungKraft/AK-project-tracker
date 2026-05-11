import React, { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ImageLightbox({ images, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);

  const handlePrev = useCallback(() => setIndex(i => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
  const handleNext = useCallback(() => setIndex(i => (i < images.length - 1 ? i + 1 : 0)), [images.length]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, handlePrev, handleNext]);

  const [touchStart, setTouchStart] = useState(null);
  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? handleNext() : handlePrev(); }
    setTouchStart(null);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
      onClick={onClose} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
        <X className="w-6 h-6" />
      </button>

      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10">
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <img src={images[index]} alt="" onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[95vw] object-contain rounded-lg select-none" />

      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span className="text-xs text-white/70 font-medium">{index + 1} / {images.length}</span>
          <div className="flex gap-1.5">
            {images.map((_, i) => (
              <button key={i} onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                className={cn("w-2.5 h-2.5 rounded-full transition-colors", i === index ? "bg-white" : "bg-white/30")} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}