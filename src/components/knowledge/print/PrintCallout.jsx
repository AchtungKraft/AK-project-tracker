import React from "react";
import normalizeKnowledgeHtml from "../normalizeKnowledgeHtml";
import PrintImageGallery from "./PrintImageGallery";
import PrintReference from "./PrintReference";

const CALLOUT_CONFIG = {
  note:      { label: "NOTE",      borderClass: "print-callout-note" },
  issue:     { label: "WARNING",   borderClass: "print-callout-warning" },
  tip:       { label: "TIP",       borderClass: "print-callout-tip" },
  reference: { label: "REFERENCE", borderClass: "print-callout-reference" },
};

/**
 * Non-step entry: note, warning, tip, or reference callout.
 * Header (label + title) is kept together and attached to first body content.
 * Body and gallery may break across pages for large entries.
 */
export default function PrintCallout({ entry, entryParts }) {
  const config = CALLOUT_CONFIG[entry.entry_type] || CALLOUT_CONFIG.note;
  const images = entry.image_urls || [];

  return (
    <div className={`print-callout ${config.borderClass}`}>
      {/* Header: label + title — kept together, attached to first body content */}
      <div className="print-callout-header">
        <div className="print-callout-label">{config.label}</div>
        {entry.headline && (
          <h4 className="print-callout-title">{entry.headline}</h4>
        )}
      </div>

      {/* Body: may break across pages */}
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

      {/* Gallery: may break between image rows */}
      {images.length > 0 && (
        <PrintImageGallery images={images} caption={null} />
      )}
    </div>
  );
}