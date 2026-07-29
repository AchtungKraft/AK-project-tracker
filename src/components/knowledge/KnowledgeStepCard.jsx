import React from "react";
import { cn } from "@/lib/utils";
import { ExternalLink, Package } from "lucide-react";
import KnowledgeHtmlContent from "./KnowledgeHtmlContent";

/**
 * KnowledgeStepCard — shared Step container for article view, drawer, and execution.
 * Renders a visually bounded card with numbered header, body content, images, parts, and references.
 */
export default function KnowledgeStepCard({
  stepNumber,
  entry,
  parts = [],
  onImageClick,
  actions,        // React node — action menu, rendered in header right
  dragHandle,     // React node — drag grip, rendered before the card
  editMode = false,
  compact = false,
}) {
  const hasContent = entry.content_html && entry.content_html !== '<p><br></p>';
  const images = entry.image_urls || [];
  const entryParts = (entry.part_ids || []).map(id => parts.find(p => p.id === id)).filter(Boolean);
  const lifecycle = entry.lifecycle_state || 'active';
  const isArchived = lifecycle === 'archived';
  const isCritical = lifecycle === 'critical';

  return (
    <div className={cn(
      "group/step rounded-lg border border-gray-800/60 bg-gray-900/40 overflow-hidden",
      editMode && "border-gray-700/70",
      isArchived && "opacity-35",
      isCritical && "border-red-900/50",
    )}>
      {/* ── HEADER ── */}
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5 md:px-4 md:py-3 bg-gray-800/30 border-b border-gray-800/40",
        isCritical && "bg-red-950/20",
      )}>
        {/* Drag handle */}
        {dragHandle}

        {/* Number badge */}
        <span className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
          {stepNumber}
        </span>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] md:text-base font-semibold text-white leading-snug truncate">
            {entry.headline}
          </h4>
          {isCritical && (
            <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wide">Critical</span>
          )}
        </div>

        {/* Actions */}
        {actions}
      </div>

      {/* ── BODY ── */}
      <div className={cn("px-3 py-3 md:px-4 md:py-4", compact && "py-2 md:py-2.5")}>
        {/* Rich text content */}
        {hasContent && (
          <div className="step-body-content">
            <KnowledgeHtmlContent html={entry.content_html} className="text-gray-400" />
          </div>
        )}

        {/* Parts */}
        {entryParts.length > 0 && (
          <div className={cn("flex flex-wrap gap-1", hasContent && "mt-2.5")}>
            {entryParts.map(part => (
              <span key={part.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-800/40 rounded">
                <Package className="w-2.5 h-2.5" /> {part.part_name || part.name}
              </span>
            ))}
          </div>
        )}

        {/* Reference URL */}
        {entry.reference_url && (
          <div className={cn((hasContent || entryParts.length > 0) && "mt-2")}>
            <a href={entry.reference_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
              <ExternalLink className="w-3 h-3" /> Reference
            </a>
          </div>
        )}

        {/* Image gallery */}
        {images.length > 0 && (
          <div className={cn(
            (hasContent || entryParts.length > 0 || entry.reference_url) && "mt-3",
          )}>
            <div className={cn(
              "grid gap-1.5",
              images.length === 1 ? "max-w-[85%]" : "grid-cols-2",
            )}>
              {images.map((url, i) => (
                <button key={i} onClick={() => onImageClick?.(images, i)}
                  className="block rounded-lg overflow-hidden bg-gray-950 active:opacity-90 transition-opacity">
                  <img src={url} alt="" loading="lazy"
                    className={cn(
                      "w-full object-cover",
                      images.length === 1 ? "max-h-[40vh]" : "h-28 md:h-36",
                    )} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}