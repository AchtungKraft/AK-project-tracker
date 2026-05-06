import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, ExternalLink, Image, AlertTriangle, Lightbulb, ListOrdered, FileText, StickyNote, Camera } from "lucide-react";
import { format } from "date-fns";

const ENTRY_TYPE_CONFIG = {
  step:      { label: "Step",      icon: ListOrdered,   color: "border-blue-600",  dot: "bg-blue-500",    bg: "bg-blue-950/20" },
  note:      { label: "Note",      icon: StickyNote,    color: "border-emerald-600", dot: "bg-emerald-500", bg: "bg-emerald-950/20" },
  issue:     { label: "Issue",     icon: AlertTriangle, color: "border-amber-600",  dot: "bg-amber-500",   bg: "bg-amber-950/20" },
  reference: { label: "Reference", icon: FileText,      color: "border-purple-600", dot: "bg-purple-500",  bg: "bg-purple-950/20" },
  tip:       { label: "Tip",       icon: Lightbulb,     color: "border-yellow-600", dot: "bg-yellow-500",  bg: "bg-yellow-950/20" },
  media:     { label: "Media",     icon: Camera,        color: "border-pink-600",   dot: "bg-pink-500",    bg: "bg-pink-950/20" },
};

function EntryCard({ entry, index }) {
  const entryType = entry.entry_type || 'step';
  const config = ENTRY_TYPE_CONFIG[entryType] || ENTRY_TYPE_CONFIG.step;
  const Icon = config.icon;
  const hasContent = entry.content_html && entry.content_html !== '<p><br></p>';
  const images = entry.image_urls || [];

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className={cn("absolute -left-[19px] top-3 w-3 h-3 rounded-full border-2 border-gray-900", config.dot)} />

      <div className={cn("rounded-lg border overflow-hidden", config.color, config.bg)}>
        {/* Entry header */}
        <div className="p-3 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={cn("text-[10px] gap-1 border-0 bg-gray-800/60 text-gray-300")}>
              <Icon className="w-2.5 h-2.5" />
              {entryType === 'step' ? `Step ${index + 1}` : config.label}
            </Badge>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 ml-auto">
              <Clock className="w-2.5 h-2.5" />
              {entry.created_date ? format(new Date(entry.created_date), 'MMM d, yyyy · h:mm a') : '—'}
            </div>
          </div>
          <h4 className="text-sm font-semibold text-white leading-snug">{entry.headline}</h4>
          {entry.created_by && (
            <p className="text-[10px] text-gray-500 mt-0.5">by {entry.created_by.split('@')[0]}</p>
          )}
        </div>

        {/* Content */}
        {hasContent && (
          <div className="px-3 pb-2">
            <div
              className="prose prose-sm prose-invert max-w-none text-gray-300 text-sm
                [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-white
                [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-white
                [&_a]:text-blue-400 [&_a]:underline
                [&_img]:rounded-lg [&_img]:my-2 [&_img]:max-w-full
                [&_blockquote]:border-l-red-600 [&_blockquote]:text-gray-400
                [&_code]:bg-gray-800 [&_code]:text-red-400 [&_code]:px-1 [&_code]:rounded"
              dangerouslySetInnerHTML={{ __html: entry.content_html }}
            />
          </div>
        )}

        {/* Photo gallery */}
        {images.length > 0 && (
          <div className={cn("px-3 pb-3", hasContent ? "" : "pt-0")}>
            <div className={cn("grid gap-1.5", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {images.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="" loading="lazy"
                    className={cn("rounded-lg w-full object-cover bg-gray-800 hover:opacity-90 transition-opacity",
                      images.length === 1 ? "h-44 md:h-56" : "h-28 md:h-36"
                    )} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Reference URL */}
        {entry.reference_url && (
          <div className="px-3 pb-3">
            <a href={entry.reference_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded bg-gray-800/40 border border-gray-700/50 hover:bg-gray-800 transition-colors text-xs">
              <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-blue-400 truncate">{entry.reference_url}</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProcedureEntryTimeline({ procedureId }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['procedureEntries', procedureId],
    queryFn: () => base44.entities.ProcedureEntry.filter({ procedure_id: procedureId }, 'order_index'),
    enabled: !!procedureId,
  });

  if (isLoading) {
    return <div className="text-xs text-gray-500 py-4 text-center">Loading entries...</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No entries yet</p>
        <p className="text-xs text-gray-600 mt-1">Add your first procedure step, observation, or reference</p>
      </div>
    );
  }

  // Sort by order_index, then by created_date
  const sorted = [...entries].sort((a, b) => {
    const orderDiff = (a.order_index || 0) - (b.order_index || 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_date || 0) - new Date(b.created_date || 0);
  });

  // Count steps for numbering
  let stepIndex = 0;

  return (
    <div className="border-l-2 border-gray-700/60 ml-2 pl-4 space-y-4">
      {sorted.map((entry) => {
        const isStep = (entry.entry_type || 'step') === 'step';
        const currentStepIndex = isStep ? stepIndex++ : -1;
        return (
          <EntryCard
            key={entry.id}
            entry={entry}
            index={isStep ? currentStepIndex : 0}
          />
        );
      })}
    </div>
  );
}