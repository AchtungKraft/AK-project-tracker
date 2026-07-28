import React from "react";

/**
 * Print-optimized image grid.
 * - 1 image: centered, constrained width
 * - 2 images: side by side
 * - 3+ images: two-column grid
 */
export default function PrintImageGallery({ images, caption }) {
  if (!images || images.length === 0) return null;

  const layoutClass =
    images.length === 1 ? "print-img-single" :
    images.length === 2 ? "print-img-pair" :
    "print-img-grid";

  return (
    <div className={`print-image-gallery ${layoutClass}`}>
      {images.map((url, i) => (
        <div key={i} className="print-img-cell">
          <img src={url} alt="" className="print-img" />
        </div>
      ))}
      {caption && <div className="print-img-caption">{caption}</div>}
    </div>
  );
}