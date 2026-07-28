import React from "react";
import PrintImageGallery from "./PrintImageGallery";

/**
 * Media-only entry — compact gallery with optional caption.
 * Header (label + heading) is kept together and attached to first image.
 * Gallery may break between image rows.
 */
export default function PrintMediaGallery({ entry }) {
  const images = entry.image_urls || [];
  if (images.length === 0) return null;

  return (
    <div className="print-media-entry">
      {/* Header: label + heading — kept with first gallery content */}
      <div className="print-media-header">
        <div className="print-media-label">REFERENCE IMAGES</div>
        {entry.headline && (
          <div className="print-media-heading">{entry.headline}</div>
        )}
      </div>

      {/* Gallery: may break between image rows */}
      <PrintImageGallery images={images} caption={null} />

      {entry.content_html && entry.content_html !== '<p><br></p>' && (
        <div className="print-media-caption"
          dangerouslySetInnerHTML={{ __html: entry.content_html.replace(/<[^>]*>/g, '') }} />
      )}
    </div>
  );
}