import React from "react";
import normalizeKnowledgeHtml from "../normalizeKnowledgeHtml";
import PrintImageGallery from "./PrintImageGallery";
import PrintReference from "./PrintReference";

/**
 * A numbered procedure step — the primary visual unit of the print layout.
 */
export default function PrintStep({ stepNumber, entry, entryParts }) {
  const images = entry.image_urls || [];

  return (
    <div className="print-step">
      <div className="print-step-header">
        <span className="print-step-number">{stepNumber}</span>
        <div className="print-step-title-block">
          <h3 className="print-step-title">{entry.headline}</h3>
        </div>
      </div>

      {entry.content_html && (
        <div
          className="print-body-content"
          dangerouslySetInnerHTML={{ __html: normalizeKnowledgeHtml(entry.content_html) }}
        />
      )}

      {entryParts.length > 0 && (
        <div className="print-entry-parts">
          <strong>Parts:</strong> {entryParts.map(p => p.part_name || p.name).join(', ')}
        </div>
      )}

      {entry.reference_url && <PrintReference url={entry.reference_url} />}

      {images.length > 0 && (
        <PrintImageGallery images={images} caption={null} />
      )}
    </div>
  );
}