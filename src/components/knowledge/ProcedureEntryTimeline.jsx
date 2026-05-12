import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, ExternalLink, AlertTriangle, Lightbulb, ListOrdered, FileText, StickyNote, Camera, Pin, AlertOctagon, Package } from "lucide-react";
import { format } from "date-fns";
import ImageLightbox from "./ImageLightbox";

export const ENTRY_TYPE_CONFIG = {
  step:      { label: "Step",    icon: ListOrdered,   rail: "bg-blue-600",    accent: "text-blue-400",    bg: "bg-blue-950/10" },
  note:      { label: "Note",    icon: StickyNote,    rail: "bg-emerald-600", accent: "text-emerald-400", bg: "bg-emerald-950/10" },
  issue:     { label: "Warning", icon: AlertTriangle, rail: "bg-amber-600",   accent: "text-amber-400",   bg: "bg-amber-950/10" },
  reference: { label: "Ref",     icon: FileText,      rail: "bg-gray-600",    accent: "text-gray-400",    bg: "bg-gray-950/10" },
  tip:       { label: "Note",    icon: Lightbulb,     rail: "bg-emerald-600", accent: "text-emerald-400", bg: "bg-emerald-950/10" },
  media:     { label: "Photos",  icon: Camera,        rail: "bg-gray-600",    accent: "text-gray-400",    bg: "bg-gray-950/10" },
};

const LIFECYCLE_BADGE = {
  pinned:   { label: "Pinned",   icon: Pin,          cls: "bg-amber-900/40 text-amber-300" },
  critical: { label: "Critical", icon: AlertOctagon, cls: "bg-red-900/40 text-red-300" },
  archived: { label: "Archived", icon: AlertOctagon,  cls: "bg-gray-700/40 text-gray-400" },
};

function EntryCard({ entry, stepNumber, parts, onImageClick, compact }) {
  const entryType = entry.entry_type || 'step';
  const config = ENTRY_TYPE_CONFIG[entryType] || ENTRY_TYPE_CONFIG.step;
  const Icon = config.icon;
  const hasContent = entry.content_html && entry.content_html !== '<p><br></p>';
  const images = entry.image_urls || [];
  const isStep = entryType === 'step';
  const isWarning = entryType === 'issue';
  const lifecycle = entry.lifecycle_state || 'active';
  const isArchived = lifecycle === 'archived';
  const isCritical = lifecycle === 'critical';
  const entryParts = (entry.part_ids || []).map(id => parts.find(p => p.id === id)).filter(Boolean);

  return (
    <div className={cn("relative flex gap-0", isArchived && "opacity-35")}>
      {/* Left rail — step number or icon */}
      <div className="flex flex-col items-center shrink-0 w-9 md:w-11">
        {isStep ? (
          <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0", config.rail)}>
            {stepNumber}
          </span>
        ) : isWarning ? (
          <span className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-3 h-3 text-white" />
          </span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0 mt-2.5 mx-auto" />
        )}
        <div className="flex-1 w-px bg-gray-800/30 min-h-[4px]" />
      </div>

      {/* Content — flat, no containers */}
      <div className={cn("flex-1 min-w-0", compact ? "pb-1.5" : "pb-4")}>
        {/* Headline */}
        <h4 className={cn(
          "leading-snug",
          isStep ? "text-[15px] font-medium text-white" :
          isWarning ? "text-sm font-medium text-amber-200" :
          "text-sm text-gray-300"
        )}>
          {entry.headline}
        </h4>

        {/* Subtle meta */}
        {(!isStep || isCritical) && (
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-600">
            {!isStep && <span className={cn("font-medium uppercase tracking-wide", config.accent)}>{config.label}</span>}
            {isCritical && <span className="text-red-400 font-semibold">CRITICAL</span>}
            {entry.created_date && <span>{format(new Date(entry.created_date), 'MMM d')}</span>}
          </div>
        )}

        {/* Content */}
        {hasContent && (
          <div className="mt-1">
            <div className="text-gray-400 text-sm leading-relaxed
                [&_a]:text-blue-400 [&_a]:underline [&_img]:rounded-lg [&_img]:my-2 [&_img]:max-w-full
                [&_ul]:ml-4 [&_ol]:ml-4 [&_li]:text-gray-400
                [&_p]:my-0.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              dangerouslySetInnerHTML={{ __html: entry.content_html }}
            />
          </div>
        )}

        {/* Images — full-width, prominent */}
        {images.length > 0 && (
          <div className="mt-2">
            <div className={cn("grid gap-1", images.length === 1 ? "" : "grid-cols-2")}>
              {images.map((url, i) => (
                <button key={i} onClick={() => onImageClick(images, i)} className="block rounded-lg overflow-hidden bg-gray-900 active:opacity-90 transition-opacity">
                  <img src={url} alt="" loading="lazy"
                    className={cn("w-full object-cover", images.length === 1 ? "max-h-[45vh]" : "h-28 md:h-36")} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Parts */}
        {entryParts.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {entryParts.map(part => (
              <span key={part.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-500 rounded">
                <Package className="w-2.5 h-2.5" /> {part.part_name || part.name}
              </span>
            ))}
          </div>
        )}

        {/* Reference */}
        {entry.reference_url && (
          <a href={entry.reference_url} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
            <ExternalLink className="w-3 h-3" /> Reference
          </a>
        )}
      </div>
    </div>
  );
}

export default function ProcedureEntryTimeline({ procedureId, compact = false, executionMode = false }) {
  const [lightboxState, setLightboxState] = useState(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['procedureEntries', procedureId],
    queryFn: () => base44.entities.ProcedureEntry.filter({ procedure_id: procedureId }, 'order_index'),
    enabled: !!procedureId,
  });

  // Collect all part IDs from entries for batch fetch
  const allPartIds = [...new Set(entries.flatMap(e => e.part_ids || []))];
  const { data: parts = [] } = useQuery({
    queryKey: ['entryParts', allPartIds.join(',')],
    queryFn: async () => {
      if (allPartIds.length === 0) return [];
      const all = await base44.entities.Part.list();
      return all.filter(p => allPartIds.includes(p.id));
    },
    enabled: allPartIds.length > 0,
    staleTime: 120000,
  });

  if (isLoading) {
    return <div className="text-xs text-gray-500 py-4 text-center">Loading entries...</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-6 text-gray-600">
        <ListOrdered className="w-5 h-5 mx-auto mb-1 opacity-25" />
        <p className="text-sm">No steps yet</p>
        <p className="text-xs text-gray-700 mt-0.5">Add your first step or note</p>
      </div>
    );
  }

  // Sort and filter
  const sorted = [...entries].sort((a, b) => {
    const orderDiff = (a.order_index || 0) - (b.order_index || 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_date || 0) - new Date(b.created_date || 0);
  });

  // In execution mode, show critical/pinned first, hide archived
  const visible = executionMode
    ? sorted.filter(e => (e.lifecycle_state || 'active') !== 'archived')
        .sort((a, b) => {
          const priority = { critical: 0, pinned: 1, active: 2 };
          const pa = priority[a.lifecycle_state || 'active'] ?? 2;
          const pb = priority[b.lifecycle_state || 'active'] ?? 2;
          if (pa !== pb) return pa - pb;
          return 0; // preserve original sort within same priority
        })
    : sorted;

  // Step counter
  let stepCount = 0;

  const handleImageClick = (images, index) => {
    setLightboxState({ images, index });
  };

  // Track group labels
  let lastGroupLabel = null;

  return (
    <>
      <div className="relative">
        {visible.map((entry) => {
          const isStep = (entry.entry_type || 'step') === 'step';
          if (isStep) stepCount++;
          
          // Group label separator
          const groupLabel = entry.group_label || null;
          let showGroupHeader = false;
          if (groupLabel && groupLabel !== lastGroupLabel) {
            showGroupHeader = true;
          }
          if (groupLabel) lastGroupLabel = groupLabel;

          return (
            <React.Fragment key={entry.id}>
              {showGroupHeader && (
                <div className="pt-4 pb-1 ml-9 md:ml-11">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
                    {groupLabel}
                  </h3>
                  <div className="h-px bg-gray-800/40 mt-1" />
                </div>
              )}
              <EntryCard
                entry={entry}
                stepNumber={isStep ? stepCount : 0}
                parts={parts}
                onImageClick={handleImageClick}
                compact={compact}
              />
            </React.Fragment>
          );
        })}
        {/* Terminal dot */}
        <div className="flex items-center w-9 md:w-11 justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-700" />
        </div>
      </div>

      {lightboxState && (
        <ImageLightbox
          images={lightboxState.images}
          initialIndex={lightboxState.index}
          onClose={() => setLightboxState(null)}
        />
      )}
    </>
  );
}