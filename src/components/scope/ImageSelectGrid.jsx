import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Toggleable thumbnails of the approved scope item's existing images.
export default function ImageSelectGrid({ images, selected, onToggle }) {
  if (!images.length) return <p className="text-xs text-gray-500">No images on this scope item.</p>;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {images.map((url, i) => {
        const on = selected.includes(url);
        return (
          <button key={url} type="button" onClick={() => onToggle(url)} aria-pressed={on}
            aria-label={`${on ? "Exclude" : "Include"} reference image ${i + 1}`}
            className={cn("relative aspect-square rounded-md overflow-hidden border-2 transition-opacity",
              on ? "border-emerald-500" : "border-gray-700 opacity-50")}>
            <img src={url} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
            {on && <span className="absolute top-1 right-1 bg-emerald-600 rounded-full p-0.5"><Check className="w-3 h-3 text-white" /></span>}
          </button>
        );
      })}
    </div>
  );
}