import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  X, AlertTriangle, Lightbulb, Package, ExternalLink,
  ListOrdered, StickyNote, Camera, FileText,
  AlertOctagon, Pin, Crown, Tag
} from "lucide-react";
import ImageLightbox from "./ImageLightbox";

const ENTRY_TYPE_CONFIG = {
  step:      { label: "Step",      icon: ListOrdered,   color: "bg-blue-600",    text: "text-blue-400" },
  note:      { label: "Note",      icon: StickyNote,    color: "bg-emerald-600", text: "text-emerald-400" },
  issue:     { label: "Issue",     icon: AlertTriangle, color: "bg-amber-600",   text: "text-amber-400" },
  reference: { label: "Reference", icon: FileText,      color: "bg-purple-600",  text: "text-purple-400" },
  tip:       { label: "Tip",       icon: Lightbulb,     color: "bg-yellow-600",  text: "text-yellow-400" },
  media:     { label: "Media",     icon: Camera,        color: "bg-pink-600",    text: "text-pink-400" },
};

function ExecutionStepCard({ entry, stepNumber, parts, onImageClick, isActive }) {
  const entryType = entry.entry_type || 'step';
  const config = ENTRY_TYPE_CONFIG[entryType] || ENTRY_TYPE_CONFIG.step;
  const Icon = config.icon;
  const isStep = entryType === 'step';
  const hasContent = entry.content_html && entry.content_html !== '<p><br></p>';
  const images = entry.image_urls || [];
  const entryParts = (entry.part_ids || []).map(id => parts.find(p => p.id === id)).filter(Boolean);
  const lifecycle = entry.lifecycle_state || 'active';

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      isActive ? "border-blue-600/60 bg-gray-800/80 ring-1 ring-blue-600/30" : "border-gray-700/40 bg-gray-800/40",
      lifecycle === 'critical' && "border-red-600/60 ring-1 ring-red-600/30"
    )}>
      {/* Step header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {isStep ? (
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0", config.color)}>
              {stepNumber}
            </div>
          ) : (
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", config.color)}>
              <Icon className="w-4 h-4 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className={cn("font-bold text-white leading-snug", isStep ? "text-lg" : "text-base")}>
              {entry.headline}
            </h3>
            {!isStep && (
              <span className={cn("text-xs font-medium uppercase tracking-wide mt-0.5 inline-block", config.text)}>
                {config.label}
              </span>
            )}
            {lifecycle === 'critical' && (
              <Badge className="bg-red-900/50 text-red-300 text-[10px] gap-0.5 border-0 ml-2">
                <AlertOctagon className="w-2.5 h-2.5" /> CRITICAL
              </Badge>
            )}
            {lifecycle === 'pinned' && (
              <Badge className="bg-amber-900/40 text-amber-300 text-[10px] gap-0.5 border-0 ml-2">
                <Pin className="w-2.5 h-2.5" /> PINNED
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Rich content — large text for shop floor */}
      {hasContent && (
        <div className="px-4 pb-3">
          <div
            className="prose prose-sm prose-invert max-w-none text-gray-200 text-base leading-relaxed
              [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-1
              [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white
              [&_a]:text-blue-400 [&_a]:underline
              [&_img]:rounded-lg [&_img]:my-3 [&_img]:max-w-full
              [&_blockquote]:border-l-red-600 [&_blockquote]:text-gray-400 [&_blockquote]:pl-3 [&_blockquote]:ml-0
              [&_code]:bg-gray-800 [&_code]:text-red-400 [&_code]:px-1 [&_code]:rounded
              [&_ul]:ml-4 [&_ol]:ml-4 [&_li]:text-gray-200 [&_li]:text-base
              [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: entry.content_html }}
          />
        </div>
      )}

      {/* Large inline images */}
      {images.length > 0 && (
        <div className="px-4 pb-3">
          <div className={cn("grid gap-2", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {images.map((url, i) => (
              <button key={i} onClick={() => onImageClick(images, i)}
                className="block rounded-lg overflow-hidden bg-gray-900 hover:ring-2 hover:ring-blue-500/50 transition-all active:scale-[0.98]">
                <img src={url} alt="" loading="lazy"
                  className={cn("w-full object-cover", images.length === 1 ? "max-h-80" : "h-44")} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Entry-level parts */}
      {entryParts.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-2">
            {entryParts.map(part => (
              <span key={part.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-700/60 text-sm text-gray-200">
                <Package className="w-3.5 h-3.5 text-gray-400" /> {part.part_name || part.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reference URL */}
      {entry.reference_url && (
        <div className="px-4 pb-3">
          <a href={entry.reference_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 rounded-lg bg-gray-700/40 hover:bg-gray-700/60 transition-colors">
            <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-blue-400 text-sm truncate">{entry.reference_url}</span>
          </a>
        </div>
      )}
    </div>
  );
}

export default function ExecutionModeView({ item, onClose }) {
  const [lightboxState, setLightboxState] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['procedureEntries', item?.id],
    queryFn: () => base44.entities.ProcedureEntry.filter({ procedure_id: item.id }, 'order_index'),
    enabled: !!item?.id,
  });

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

  // Procedure-level parts
  const { data: procedurePartLinks = [] } = useQuery({
    queryKey: ['knowledgePartLinks', item?.id],
    queryFn: () => base44.entities.BuildKnowledgePartLink.filter({ knowledge_item_id: item.id }),
    enabled: !!item?.id,
  });
  const { data: allParts = [] } = useQuery({
    queryKey: ['parts_for_knowledge'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 120000,
  });

  const procedureParts = procedurePartLinks.map(l => allParts.find(p => p.id === l.part_id)).filter(Boolean);

  // Filter and sort entries for execution
  const visible = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const orderDiff = (a.order_index || 0) - (b.order_index || 0);
      if (orderDiff !== 0) return orderDiff;
      return new Date(a.created_date || 0) - new Date(b.created_date || 0);
    });
    return sorted.filter(e => (e.lifecycle_state || 'active') !== 'archived')
      .sort((a, b) => {
        const priority = { critical: 0, pinned: 1, active: 2 };
        const pa = priority[a.lifecycle_state || 'active'] ?? 2;
        const pb = priority[b.lifecycle_state || 'active'] ?? 2;
        if (pa !== pb) return pa - pb;
        return 0;
      });
  }, [entries]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Step counter for numbering
  let stepCount = 0;

  if (!item) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        {/* Minimal header */}
        <div className="shrink-0 bg-gray-900/95 backdrop-blur-xl border-b border-gray-700/50 px-4 py-3 flex items-center gap-3">
          <button onClick={onClose}
            className="p-2 -m-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors active:scale-95">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {item.is_master_procedure && <Crown className="w-4 h-4 text-red-400 shrink-0" />}
              <h1 className="text-base font-bold text-white truncate">{item.title}</h1>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              EXECUTION MODE · {visible.length} entries
            </p>
          </div>
          {/* Step progress indicator */}
          {visible.length > 0 && (
            <div className="text-xs text-gray-500 shrink-0">
              {visible.filter(e => (e.entry_type || 'step') === 'step').length} steps
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {/* Procedure summary — minimal */}
            {item.summary && (
              <p className="text-gray-400 text-sm leading-relaxed border-l-2 border-gray-700 pl-3 mb-6">
                {item.summary}
              </p>
            )}

            {/* Procedure-level warnings (legacy) */}
            {item.warnings?.length > 0 && (
              <div className="space-y-2 mb-4">
                {item.warnings.map(w => (
                  <div key={w.id} className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border",
                    w.severity === 'danger' ? "bg-red-950/40 border-red-900/50 text-red-200" :
                    w.severity === 'warning' ? "bg-amber-950/40 border-amber-900/50 text-amber-200" :
                    "bg-yellow-950/30 border-yellow-900/40 text-yellow-200"
                  )}>
                    <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                    <span className="text-sm leading-relaxed">{w.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Vehicle tags */}
            {item.vehicle_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {item.vehicle_tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs border-gray-600 text-gray-300 gap-1">
                    <Tag className="w-3 h-3" /> {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Procedure-level parts — quick reference */}
            {procedureParts.length > 0 && (
              <div className="rounded-xl bg-gray-800/50 border border-gray-700/40 p-4 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Required Parts ({procedureParts.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {procedureParts.map(part => (
                    <span key={part.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-700/60 text-sm text-gray-200">
                      <Package className="w-3 h-3 text-gray-400" /> {part.part_name || part.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Entries — step flow */}
            {isLoading ? (
              <div className="text-center py-12 text-gray-500 text-sm">Loading procedure...</div>
            ) : visible.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <ListOrdered className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-base">No entries in this procedure</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  let lastGroup = null;
                  return visible.map((entry, i) => {
                    const isStep = (entry.entry_type || 'step') === 'step';
                    if (isStep) stepCount++;
                    const groupLabel = entry.group_label || null;
                    let showGroupHeader = false;
                    if (groupLabel && groupLabel !== lastGroup) showGroupHeader = true;
                    if (groupLabel) lastGroup = groupLabel;
                    return (
                      <React.Fragment key={entry.id}>
                        {showGroupHeader && (
                          <div className="flex items-center gap-3 pt-4 pb-1">
                            <div className="h-px flex-1 bg-gray-700/50" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 shrink-0 px-2">
                              {groupLabel}
                            </span>
                            <div className="h-px flex-1 bg-gray-700/50" />
                          </div>
                        )}
                        <ExecutionStepCard
                          entry={entry}
                          stepNumber={isStep ? stepCount : 0}
                          parts={parts}
                          onImageClick={(images, idx) => setLightboxState({ images, index: idx })}
                          isActive={i === activeIndex}
                        />
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
            )}

            {/* Legacy HTML content fallback */}
            {visible.length === 0 && item.content_html && item.content_html !== '<p><br></p>' && (
              <div className="rounded-xl bg-gray-800/50 border border-gray-700/40 p-4">
                <div
                  className="prose prose-sm prose-invert max-w-none text-gray-200 text-base leading-relaxed
                    [&_a]:text-blue-400 [&_a]:underline [&_img]:rounded-lg [&_img]:my-3 [&_img]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: item.content_html }}
                />
              </div>
            )}

            {/* Reference URL */}
            {item.reference_url && (
              <a href={item.reference_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800/70 border border-gray-700/40 transition-colors">
                <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-blue-400 text-sm truncate">{item.reference_url}</span>
              </a>
            )}

            {/* Bottom padding for safe area */}
            <div className="h-8" />
          </div>
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