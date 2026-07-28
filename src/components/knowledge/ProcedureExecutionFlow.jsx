import React, { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { ArrowLeft, AlertTriangle, Package, ExternalLink, ChevronUp, ChevronDown, Crown, Camera, Plus } from "lucide-react";
import ImageLightbox from "./ImageLightbox";
import KnowledgeHtmlContent from "./KnowledgeHtmlContent";

/**
 * Full-page execution flow — service manual experience.
 * Native browser scrolling, no modals, no drawers.
 * Immersive procedural reading optimized for shop-floor use.
 */

function ExecutionStep({ entry, stepNumber, parts, onImageClick }) {
  const entryType = entry.entry_type || 'step';
  const isStep = entryType === 'step';
  const isWarning = entryType === 'issue';
  const hasContent = entry.content_html && entry.content_html !== '<p><br></p>';
  const images = entry.image_urls || [];
  const entryParts = (entry.part_ids || []).map(id => parts.find(p => p.id === id)).filter(Boolean);
  const lifecycle = entry.lifecycle_state || 'active';

  return (
    <div id={`exec-step-${entry.id}`} className={cn(
      "scroll-mt-16",
      isWarning && "bg-amber-950/15 rounded-xl -mx-2 px-4 py-3",
      lifecycle === 'critical' && !isWarning && "bg-red-950/10 rounded-xl -mx-2 px-4 py-3"
    )}>
      {/* Step badge + headline */}
      <div className="flex items-start gap-3 mb-2">
        {isStep ? (
          <span className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white shrink-0 mt-0.5">
            {stepNumber}
          </span>
        ) : isWarning ? (
          <span className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-4.5 h-4.5 text-white" />
          </span>
        ) : (
          <span className="w-2 h-2 rounded-full bg-gray-500 shrink-0 mt-3 ml-3.5 mr-3" />
        )}
        <h3 className={cn(
          "font-semibold leading-snug pt-1.5",
          isStep ? "text-xl text-white" : isWarning ? "text-lg text-amber-200" : "text-lg text-gray-200"
        )}>
          {entry.headline}
        </h3>
      </div>

      {/* Content */}
      {hasContent && (
        <div className="ml-12 mb-3">
          <KnowledgeHtmlContent html={entry.content_html} size="base" />
        </div>
      )}

      {/* Images — large, prominent */}
      {images.length > 0 && (
        <div className="ml-12 mb-3">
          <div className={cn("grid gap-2", images.length === 1 ? "" : "grid-cols-2")}>
            {images.map((url, i) => (
              <button key={i} onClick={() => onImageClick(images, i)}
                className="block rounded-xl overflow-hidden bg-gray-900 active:opacity-90 transition-opacity">
                <img src={url} alt="" loading="lazy"
                  className={cn("w-full object-cover", images.length === 1 ? "max-h-[55vh]" : "h-44 md:h-52")} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Parts */}
      {entryParts.length > 0 && (
        <div className="ml-12 mb-2 flex flex-wrap gap-1.5">
          {entryParts.map(part => (
            <span key={part.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 bg-gray-800/40 rounded">
              <Package className="w-3 h-3" /> {part.part_name || part.name}
            </span>
          ))}
        </div>
      )}

      {/* Reference */}
      {entry.reference_url && (
        <div className="ml-12 mb-1">
          <a href={entry.reference_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
            <ExternalLink className="w-3.5 h-3.5" /> Reference
          </a>
        </div>
      )}
    </div>
  );
}

export default function ProcedureExecutionFlow({ item, entries, categories, onClose }) {
  const [lightboxState, setLightboxState] = useState(null);
  const [showJump, setShowJump] = useState(false);

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

  const visible = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const orderDiff = (a.order_index || 0) - (b.order_index || 0);
      if (orderDiff !== 0) return orderDiff;
      return new Date(a.created_date || 0) - new Date(b.created_date || 0);
    });
    return sorted.filter(e => (e.lifecycle_state || 'active') !== 'archived')
      .sort((a, b) => {
        const priority = { critical: 0, pinned: 1, active: 2 };
        return (priority[a.lifecycle_state || 'active'] ?? 2) - (priority[b.lifecycle_state || 'active'] ?? 2);
      });
  }, [entries]);

  const groups = useMemo(() => {
    const seen = [];
    visible.forEach(e => {
      if (e.group_label && !seen.find(g => g.label === e.group_label)) {
        seen.push({ label: e.group_label, id: e.id });
      }
    });
    return seen;
  }, [visible]);

  const stepTotal = visible.filter(e => (e.entry_type || 'step') === 'step').length;

  const scrollToGroup = (entryId) => {
    const el = document.getElementById(`exec-step-${entryId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setShowJump(false);
  };

  const cat = categories.find(c => c.id === item.category_id);

  let stepCount = 0;
  let lastGroup = null;

  return (
    <>
      {/* Full-page execution — native scroll */}
      <div className="min-h-screen bg-gray-950">
        {/* Sticky header */}
        <div className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/40">
          <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
            <button onClick={onClose}
              className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-white active:bg-gray-800 transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                {item.is_master_procedure && <Crown className="w-3 h-3 text-red-400 shrink-0" />}
                {item.title}
              </h1>
              <span className="text-[10px] text-gray-600">{stepTotal} steps{cat ? ` · ${cat.name}` : ''}</span>
            </div>

            {groups.length > 0 && (
              <button onClick={() => setShowJump(!showJump)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 bg-gray-800/60 active:bg-gray-700 transition-colors shrink-0">
                Jump {showJump ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>

          {showJump && groups.length > 0 && (
            <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
              {groups.map(g => (
                <button key={g.id} onClick={() => scrollToGroup(g.id)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs text-gray-300 bg-gray-800 active:bg-gray-700 transition-colors">
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Execution content */}
        <div className="max-w-2xl mx-auto px-5 py-6">
          {item.summary && (
            <p className="text-gray-400 text-base leading-relaxed mb-6">{item.summary}</p>
          )}

          {item.warnings?.length > 0 && (
            <div className="space-y-2 mb-6">
              {item.warnings.map(w => (
                <div key={w.id} className={cn(
                  "flex items-start gap-2.5 py-2",
                  w.severity === 'danger' ? "text-red-300" :
                  w.severity === 'warning' ? "text-amber-300" : "text-yellow-300"
                )}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-sm leading-relaxed">{w.text}</span>
                </div>
              ))}
            </div>
          )}

          {procedureParts.length > 0 && (
            <div className="mb-6 pb-4 border-b border-gray-800/40">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-2">Required Parts</p>
              <div className="flex flex-wrap gap-1.5">
                {procedureParts.map(part => (
                  <span key={part.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-300 bg-gray-800/40 rounded">
                    <Package className="w-3 h-3 text-gray-500" /> {part.part_name || part.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Steps — clean vertical flow */}
          {visible.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <p className="text-sm">No steps in this procedure yet</p>
            </div>
          ) : (
            <div className="space-y-8">
              {visible.map((entry) => {
                const isStep = (entry.entry_type || 'step') === 'step';
                if (isStep) stepCount++;
                const groupLabel = entry.group_label || null;
                let showGroupHeader = false;
                if (groupLabel && groupLabel !== lastGroup) showGroupHeader = true;
                if (groupLabel) lastGroup = groupLabel;
                return (
                  <React.Fragment key={entry.id}>
                    {showGroupHeader && (
                      <div className="pt-4 pb-1" id={`exec-step-${entry.id}`}>
                        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">{groupLabel}</h2>
                        <div className="h-px bg-gray-800/60 mt-2" />
                      </div>
                    )}
                    <ExecutionStep
                      entry={entry}
                      stepNumber={isStep ? stepCount : 0}
                      parts={parts}
                      onImageClick={(images, idx) => setLightboxState({ images, index: idx })}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Legacy content fallback */}
          {visible.length === 0 && item.content_html && item.content_html !== '<p><br></p>' && (
          <div className="mt-4">
            <KnowledgeHtmlContent html={item.content_html} size="base" />
          </div>
          )}

          {item.reference_url && (
            <div className="mt-8 pt-4 border-t border-gray-800/40">
              <a href={item.reference_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
                <ExternalLink className="w-3.5 h-3.5" /> Reference
              </a>
            </div>
          )}

          <div className="h-24" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>

      {lightboxState && (
        <ImageLightbox images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} />
      )}
    </>
  );
}