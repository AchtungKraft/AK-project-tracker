import React, { useState } from "react";
import ImageModal from "@/components/ui/ImageModal";

/** Scope of work: description, extra notes and reference images. */
export default function ScopeItemWorkSection({ item, notes = [] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const images = item.images || [];
  if (!item.description && !notes.length && !images.length) return null;

  return (
    <section className="space-y-2" aria-label="Scope of work">
      <h5 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Scope of Work</h5>
      {item.description && (
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line break-words max-w-[72ch]">{item.description}</p>
      )}
      {notes.map((n, i) => (
        <p key={i} className="text-xs text-gray-500 italic leading-relaxed max-w-[72ch] break-words">{n}</p>
      ))}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.slice(0, 6).map((url, idx) => (
            <button key={idx} type="button" onClick={() => { setIndex(idx); setOpen(true); }}
              className="relative w-16 h-16 rounded-md overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors">
              <img src={url} alt={`${item.title} reference ${idx + 1}`} className="w-full h-full object-cover" />
              {idx === 5 && images.length > 6 && (
                <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-semibold text-xs">+{images.length - 6}</span>
              )}
            </button>
          ))}
          <ImageModal isOpen={open} onClose={() => setOpen(false)} images={images} currentIndex={index} onNavigate={setIndex} />
        </div>
      )}
    </section>
  );
}