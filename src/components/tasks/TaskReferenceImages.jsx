import React, { useState } from "react";
import ImageModal from "@/components/ui/ImageModal";

// Thumbnail gallery for Task.reference_images (existing stored URLs).
export default function TaskReferenceImages({ images }) {
  const [index, setIndex] = useState(null);
  const urls = (images || []).map(i => i?.url).filter(Boolean);
  if (!urls.length) return null;
  return (
    <div className="mt-3">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Reference Images</h3>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {urls.map((url, i) => (
          <button key={url + i} type="button" onClick={() => setIndex(i)} aria-label={`Open reference image ${i + 1}`}
            className="aspect-square rounded-md overflow-hidden border border-gray-700 hover:border-gray-500">
            <img src={url} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <ImageModal isOpen={index !== null} onClose={() => setIndex(null)} images={urls} currentIndex={index ?? 0} onNavigate={setIndex} />
    </div>
  );
}