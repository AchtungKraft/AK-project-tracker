import React from "react";

/**
 * Print-optimized image grid.
 * - 1 image: centered, constrained width
 * - 2 images: side by side in a row (kept together)
 * - 3+ images: rows of 2, each row kept together, breaks allowed between rows
 */
export default function PrintImageGallery({ images, caption }) {
  if (!images || images.length === 0) return null;

  // Single image
  if (images.length === 1) {
    return (
      <div className="print-image-gallery print-img-single">
        <div className="print-img-cell">
          <img src={images[0]} alt="" className="print-img" />
        </div>
        {caption && <div className="print-img-caption">{caption}</div>}
      </div>
    );
  }

  // Two images — single row, kept together
  if (images.length === 2) {
    return (
      <div className="print-image-gallery">
        <div className="print-img-row">
          {images.map((url, i) => (
            <div key={i} className="print-img-cell">
              <img src={url} alt="" className="print-img" />
            </div>
          ))}
        </div>
        {caption && <div className="print-img-caption">{caption}</div>}
      </div>
    );
  }

  // 3+ images — chunk into rows of 2, each row kept together, breaks allowed between
  const rows = [];
  for (let i = 0; i < images.length; i += 2) {
    rows.push(images.slice(i, i + 2));
  }

  return (
    <div className="print-image-gallery">
      {rows.map((row, ri) => (
        <div key={ri} className="print-img-row" style={ri > 0 ? { marginTop: '6px' } : undefined}>
          {row.map((url, ci) => (
            <div key={ci} className="print-img-cell">
              <img src={url} alt="" className="print-img" />
            </div>
          ))}
        </div>
      ))}
      {caption && <div className="print-img-caption">{caption}</div>}
    </div>
  );
}