import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, ExternalLink, AlertTriangle, Lightbulb, ListOrdered, FileText, StickyNote, Camera, Pin, AlertOctagon, Package } from "lucide-react";
import { format } from "date-fns";
import ImageLightbox from "./ImageLightbox";

export const ENTRY_TYPE_CONFIG = {
  step:      { label: "Step",      icon: ListOrdered,   rail: "bg-blue-500",    accent: "text-blue-400",  bg: "bg-blue-950/15" },
  note:      { label: "Note",      icon: StickyNote,    rail: "bg-emerald-500", accent: "text-emerald-400", bg: "bg-emerald-950/15" },
  issue:     { label: "Issue",     icon: AlertTriangle, rail: "bg-amber-500",   accent: "text-amber-400", bg: "bg-amber-950/15" },
  reference: { label: "Reference", icon: FileText,      rail: "bg-purple-500",  accent: "text-purple-400", bg: "bg-purple-950/15" },
  tip:       { label: "Tip",       icon: Lightbulb,     rail: "bg-yellow-500",  accent: "text-yellow-400", bg: "bg-yellow-950/15" },
  media:     { label: "Media",     icon: Camera,        rail: "bg-pink-500",    accent: "text-pink-400",  bg: "bg-pink-950/15" },
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
  const lifecycle = entry.lifecycle_state || 'active';
  const isArchived = lifecycle === 'archived';
  const lifecycleBadge = LIFECYCLE_BADGE[lifecycle];
  const entryParts = (entry.part_ids || []).map(id => parts.find(p => p.id === id)).filter(Boolean);

  return (
    <div className={cn("relative flex gap-0", isArchived && "opacity-50")}>
      {/* Left rail — timeline connector */}
      <div className="flex flex-col items-center shrink-0 w-10 md:w-12">
        {/* Dot / Step Number */}
        {isStep ? (
          <div className={cn("w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0", config.rail)}>
            {stepNumber}
          </div>
        ) : (
          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1", config.rail)}>
            <Icon className="w-3 h-3 text-white" />
          </div>
        )}
        {/* Connector line — extends down */}
        <div className="flex-1 w-0.5 bg-gray-700/40 min-h-[8px]" />
      </div>

      {/* Content */}
      <div className={cn("flex-1 min-w-0 pb-4", compact ? "pb-2" : "pb-4")}>
        <div className={cn("rounded-lg overflow-hidden", config.bg)}>
          {/* Header */}
          <div className={cn("px-3 pt-2.5", compact ? "pb-1.5" : "pb-2")}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h4 className={cn("font-semibold text-white leading-snug", isStep ? "text-base" : "text-sm")}>
                  {entry.headline}
                </h4>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {!isStep && (
                    <span className={cn("text-[10px] font-medium uppercase tracking-wide", config.accent)}>
                      {config.label}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {entry.created_date ? format(new Date(entry.created_date), 'MMM d · h:mm a') : '—'}
                  </span>
                  {entry.created_by && (
                    <span className="text-[10px] text-gray-600">{entry.created_by.split('@')[0]}</span>
                  )}
                  {lifecycleBadge && (
                    <Badge className={cn("text-[9px] gap-0.5 border-0 h-4", lifecycleBadge.cls)}>
                      <lifecycleBadge.icon className="w-2 h-2" /> {lifecycleBadge.label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Rich content */}
          {hasContent && (
            <div className="px-3 pb-2">
              <div
                className="prose prose-sm prose-invert max-w-none text-gray-300 text-sm leading-relaxed
                  [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-2 [&_h2]:mb-1
                  [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-white
                  [&_a]:text-blue-400 [&_a]:underline
                  [&_img]:rounded-lg [&_img]:my-2 [&_img]:max-w-full
                  [&_blockquote]:border-l-red-600 [&_blockquote]:text-gray-400 [&_blockquote]:pl-3 [&_blockquote]:ml-0
                  [&_code]:bg-gray-800 [&_code]:text-red-400 [&_code]:px-1 [&_code]:rounded
                  [&_ul]:ml-4 [&_ol]:ml-4 [&_li]:text-gray-300
                  [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                dangerouslySetInnerHTML={{ __html: entry.content_html }}
              />
            </div>
          )}

          {/* Inline images — first-class */}
          {images.length > 0 && (
            <div className="px-3 pb-2.5">
              <div className={cn("grid gap-1.5", images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                {images.map((url, i) => (
                  <button key={i} onClick={() => onImageClick(images, i)} className="block rounded-lg overflow-hidden bg-gray-800 hover:ring-2 hover:ring-blue-500/50 transition-all">
                    <img src={url} alt="" loading="lazy"
                      className={cn("w-full object-cover",
                        images.length === 1 ? "h-48 md:h-64" : "h-28 md:h-36"
                      )} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Entry-level parts */}
          {entryParts.length > 0 && (
            <div className="px-3 pb-2.5">
              <div className="flex flex-wrap gap-1.5">
                {entryParts.map(part => (
                  <span key={part.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800/60 text-[11px] text-gray-300">
                    <Package className="w-3 h-3 text-gray-500" /> {part.part_name || part.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reference URL */}
          {entry.reference_url && (
            <div className="px-3 pb-2.5">
              <a href={entry.reference_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 rounded-md bg-gray-800/40 hover:bg-gray-800 transition-colors text-xs">
                <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-blue-400 truncate">{entry.reference_url}</span>
              </a>
            </div>
          )}
        </div>
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
      <div className="text-center py-6 text-gray-500">
        <ListOrdered className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
        <p className="text-sm">No entries yet</p>
        <p className="text-xs text-gray-600 mt-0.5">Add your first step, observation, or reference</p>
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

  return (
    <>
      <div className="relative">
        {visible.map((entry) => {
          const isStep = (entry.entry_type || 'step') === 'step';
          if (isStep) stepCount++;
          return (
            <EntryCard
              key={entry.id}
              entry={entry}
              stepNumber={isStep ? stepCount : 0}
              parts={parts}
              onImageClick={handleImageClick}
              compact={compact}
            />
          );
        })}
        {/* Terminal dot */}
        <div className="flex items-center w-10 md:w-12 justify-center">
          <div className="w-2 h-2 rounded-full bg-gray-600" />
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