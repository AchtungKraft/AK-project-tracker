import React from "react";
import { sanitizeHtml } from "../KnowledgeHtmlContent";
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
 * No checkbox. No step numbering.
 */
export default function PrintCallout({ entry, entryParts }) {
  const config = CALLOUT_CONFIG[entry.entry_type] || CALLOUT_CONFIG.note;
  const images = entry.image_urls || [];

  return (
    <div className={`print-callout ${config.borderClass}`}>
      <div className="print-callout-label">{config.label}</div>
      {entry.headline && (
        <h4 className="print-callout-title">{entry.headline}</h4>
      )}
      {entry.content_html && (
        <div
          className="print-body-content"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(entry.content_html) }}
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