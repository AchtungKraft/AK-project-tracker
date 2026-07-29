import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import {
  X, AlertTriangle, Package, ExternalLink,
  ChevronLeft, ChevronRight, Crown, Info, Play
} from "lucide-react";
import ImageLightbox from "./ImageLightbox";
import KnowledgeHtmlContent from "./KnowledgeHtmlContent";

/**
 * ExecutionModeView — focused one-Step-at-a-time procedural workflow.
 *
 * Structure:
 *   - Preparation screen (if article-level notes/warnings exist before Step 1)
 *   - One active Step at a time
 *   - Previous / Next navigation
 *   - Step pill navigator for jumping
 *   - Full-screen overlay, isolated from app shell
 */
export default function ExecutionModeView({ item, onClose }) {
  const [lightboxState, setLightboxState] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1); // -1 = prep screen (if exists)
  const scrollRef = useRef(null);
  const scrollPositions = useRef({});

  // ── Data fetching ──
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

  // ── Sorted & filtered entries ──
  const visible = useMemo(() => {
    return [...entries]
      .sort((a, b) => {
        const od = (a.order_index || 0) - (b.order_index || 0);
        if (od !== 0) return od;
        return new Date(a.created_date || 0) - new Date(b.created_date || 0);
      })
      .filter(e => (e.lifecycle_state || 'active') !== 'archived');
  }, [entries]);

  // ── Separate steps from preparation content ──
  const { steps, prepEntries, hasPrepContent } = useMemo(() => {
    const stps = [];
    const prep = [];
    let foundFirstStep = false;

    for (const e of visible) {
      const type = e.entry_type || 'step';
      if (type === 'step') {
        foundFirstStep = true;
        stps.push(e);
      } else if (!foundFirstStep) {
        // Notes/warnings before the first step → preparation content
        prep.push(e);
      } else {
        // Non-step entries after first step: attach to previous step as context
        // For now, skip them in execution (they appear in the article view)
      }
    }

    return {
      steps: stps,
      prepEntries: prep,
      hasPrepContent: prep.length > 0 || (item?.warnings?.length > 0) || !!item?.summary,
    };
  }, [visible, item]);

  // ── Initialize active index ──
  useEffect(() => {
    if (!isLoading && steps.length > 0) {
      setActiveIndex(hasPrepContent ? -1 : 0);
    }
  }, [isLoading, steps.length, hasPrepContent]);

  // ── Keyboard navigation ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIndex, steps.length]);

  // ── Navigation helpers ──
  const saveScroll = useCallback(() => {
    if (scrollRef.current) {
      scrollPositions.current[activeIndex] = scrollRef.current.scrollTop;
    }
  }, [activeIndex]);

  const goTo = useCallback((idx) => {
    saveScroll();
    setActiveIndex(idx);
    // Restore scroll or go to top
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollPositions.current[idx] || 0;
      }
    });
  }, [saveScroll]);

  const goNext = useCallback(() => {
    if (activeIndex < steps.length - 1) goTo(activeIndex + 1);
  }, [activeIndex, steps.length, goTo]);

  const goPrev = useCallback(() => {
    const minIndex = hasPrepContent ? -1 : 0;
    if (activeIndex > minIndex) goTo(activeIndex - 1);
  }, [activeIndex, hasPrepContent, goTo]);

  if (!item) return null;

  const currentStep = activeIndex >= 0 ? steps[activeIndex] : null;
  const isPrepScreen = activeIndex === -1;
  const minIndex = hasPrepContent ? -1 : 0;

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col">
        {/* ── TOP BAR ── */}
        <div className="shrink-0 bg-gray-950 border-b border-gray-800/40">
          {/* Title row */}
          <div className="px-4 py-2.5 flex items-center gap-3">
            <button onClick={onClose}
              className="p-2 -m-1 rounded-lg text-gray-500 hover:text-white active:bg-gray-800 transition-colors shrink-0"
              aria-label="Exit execution mode">
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                {item.is_master_procedure && <Crown className="w-3 h-3 text-red-400 shrink-0" />}
                {item.title}
              </h1>
              <span className="text-[10px] text-gray-600">
                {isPrepScreen
                  ? 'Preparation'
                  : `Step ${activeIndex + 1} of ${steps.length}`
                }
              </span>
            </div>
          </div>

          {/* Step navigator pills */}
          {steps.length > 1 && (
            <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
              {hasPrepContent && (
                <button
                  onClick={() => goTo(-1)}
                  className={cn(
                    "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors",
                    isPrepScreen
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800/60 text-gray-500 hover:text-gray-300"
                  )}
                >
                  Prep
                </button>
              )}
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-full text-[11px] font-bold transition-colors",
                    i === activeIndex
                      ? "bg-blue-600 text-white"
                      : i < activeIndex
                        ? "bg-gray-800/60 text-gray-400"
                        : "bg-gray-800/60 text-gray-600"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── MAIN CONTENT ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-6">
            {isLoading ? (
              <div className="text-center py-16 text-gray-600 text-sm">Loading…</div>
            ) : steps.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <p className="text-sm">No steps in this procedure yet</p>
              </div>
            ) : isPrepScreen ? (
              <PreparationScreen
                item={item}
                prepEntries={prepEntries}
                procedureParts={procedureParts}
                parts={parts}
                stepCount={steps.length}
                onStart={() => goTo(0)}
                onImageClick={(imgs, idx) => setLightboxState({ images: imgs, index: idx })}
              />
            ) : currentStep ? (
              <ExecutionStepContent
                step={currentStep}
                stepNumber={activeIndex + 1}
                totalSteps={steps.length}
                parts={parts}
                onImageClick={(imgs, idx) => setLightboxState({ images: imgs, index: idx })}
              />
            ) : null}

            <div className="h-24" />
          </div>
        </div>

        {/* ── BOTTOM NAVIGATION ── */}
        {!isPrepScreen && steps.length > 0 && (
          <div className="shrink-0 bg-gray-950 border-t border-gray-800/40 px-4 py-3"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}>
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <button
                onClick={goPrev}
                disabled={activeIndex <= minIndex}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  activeIndex > minIndex
                    ? "text-gray-300 bg-gray-800 hover:bg-gray-700 active:bg-gray-600"
                    : "text-gray-700 bg-gray-900 cursor-not-allowed"
                )}
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <span className="text-xs text-gray-500 font-medium tabular-nums">
                Step {activeIndex + 1} of {steps.length}
              </span>

              <button
                onClick={goNext}
                disabled={activeIndex >= steps.length - 1}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  activeIndex < steps.length - 1
                    ? "text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                    : "text-gray-700 bg-gray-900 cursor-not-allowed"
                )}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
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


/**
 * PreparationScreen — shown before Step 1 when article-level notes/warnings exist.
 */
function PreparationScreen({ item, prepEntries, procedureParts, parts, stepCount, onStart, onImageClick }) {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-white">{item.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{stepCount} Steps</p>
      </div>

      {/* Summary */}
      {item.summary && (
        <p className="text-gray-400 text-sm leading-relaxed">{item.summary}</p>
      )}

      {/* Article-level warnings */}
      {item.warnings?.length > 0 && (
        <div className="space-y-2">
          {item.warnings.map(w => (
            <div key={w.id} className={cn(
              "flex items-start gap-2.5 py-2 px-3 rounded-lg",
              w.severity === 'danger' ? "text-red-300 bg-red-950/20" :
              w.severity === 'warning' ? "text-amber-300 bg-amber-950/20" : "text-yellow-300 bg-yellow-950/20"
            )}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-sm leading-relaxed">{w.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Preparation entries (notes/warnings before first step) */}
      {prepEntries.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Before You Begin
          </h3>
          {prepEntries.map(entry => (
            <PrepEntryCard
              key={entry.id}
              entry={entry}
              parts={parts}
              onImageClick={onImageClick}
            />
          ))}
        </div>
      )}

      {/* Required parts */}
      {procedureParts.length > 0 && (
        <div className="pb-4 border-b border-gray-800/40">
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

      {/* Start button */}
      <button
        onClick={onStart}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-base transition-colors"
      >
        <Play className="w-4 h-4" />
        Start Step 1
      </button>
    </div>
  );
}


/**
 * PrepEntryCard — compact rendering of a note/warning for the preparation screen.
 */
function PrepEntryCard({ entry, parts, onImageClick }) {
  const isWarning = entry.entry_type === 'issue';
  const hasContent = entry.content_html && entry.content_html !== '<p><br></p>';
  const images = entry.image_urls || [];
  const entryParts = (entry.part_ids || []).map(id => parts.find(p => p.id === id)).filter(Boolean);

  return (
    <div className={cn(
      "rounded-lg py-3 px-3.5",
      isWarning ? "bg-amber-950/15 border border-amber-800/30" : "bg-gray-800/30 border border-gray-800/40"
    )}>
      <div className="flex items-start gap-2.5 mb-1.5">
        {isWarning ? (
          <span className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-3 h-3 text-white" />
          </span>
        ) : (
          <span className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-3 h-3 text-gray-300" />
          </span>
        )}
        <h4 className={cn(
          "font-semibold leading-snug text-sm pt-0.5",
          isWarning ? "text-amber-200" : "text-gray-200"
        )}>
          {entry.headline}
        </h4>
      </div>

      {hasContent && (
        <div className="ml-8">
          <KnowledgeHtmlContent html={entry.content_html} size="sm" />
        </div>
      )}

      {images.length > 0 && (
        <div className="ml-8 mt-2">
          <div className={cn("grid gap-1.5", images.length === 1 ? "" : "grid-cols-2")}>
            {images.map((url, i) => (
              <button key={i} onClick={() => onImageClick(images, i)}
                className="block rounded-lg overflow-hidden bg-gray-900 active:opacity-90 transition-opacity">
                <img src={url} alt="" loading="lazy"
                  className={cn("w-full object-cover", images.length === 1 ? "max-h-[40vh]" : "h-32")} />
              </button>
            ))}
          </div>
        </div>
      )}

      {entryParts.length > 0 && (
        <div className="ml-8 mt-2 flex flex-wrap gap-1.5">
          {entryParts.map(part => (
            <span key={part.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 bg-gray-800/40 rounded">
              <Package className="w-3 h-3" /> {part.part_name || part.name}
            </span>
          ))}
        </div>
      )}

      {entry.reference_url && (
        <div className="ml-8 mt-1.5">
          <a href={entry.reference_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            <ExternalLink className="w-3 h-3" /> Reference
          </a>
        </div>
      )}
    </div>
  );
}


/**
 * ExecutionStepContent — renders the body of a single active Step.
 */
function ExecutionStepContent({ step, stepNumber, totalSteps, parts, onImageClick }) {
  const hasContent = step.content_html && step.content_html !== '<p><br></p>';
  const images = step.image_urls || [];
  const entryParts = (step.part_ids || []).map(id => parts.find(p => p.id === id)).filter(Boolean);

  return (
    <div className="space-y-5">
      {/* Step header */}
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold text-white shrink-0">
          {stepNumber}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg md:text-xl font-bold text-white leading-snug">
            {step.headline}
          </h2>
        </div>
      </div>

      {/* Instructions */}
      {hasContent && (
        <div className="text-[15px]">
          <KnowledgeHtmlContent html={step.content_html} className="text-gray-300" size="base" />
        </div>
      )}

      {/* Parts */}
      {entryParts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entryParts.map(part => (
            <span key={part.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 bg-gray-800/40 rounded">
              <Package className="w-3 h-3" /> {part.part_name || part.name}
            </span>
          ))}
        </div>
      )}

      {/* Reference */}
      {step.reference_url && (
        <div>
          <a href={step.reference_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
            <ExternalLink className="w-3.5 h-3.5" /> Reference
          </a>
        </div>
      )}

      {/* Images */}
      {images.length > 0 && (
        <ExecutionImageGallery images={images} onImageClick={onImageClick} />
      )}
    </div>
  );
}


/**
 * ExecutionImageGallery — optimized image layout for active procedural use.
 */
function ExecutionImageGallery({ images, onImageClick }) {
  if (images.length === 1) {
    return (
      <div className="flex justify-center">
        <button onClick={() => onImageClick(images, 0)}
          className="block rounded-lg overflow-hidden bg-gray-900 active:opacity-90 transition-opacity max-w-[90%]">
          <img src={images[0]} alt="" loading="lazy"
            className="w-full max-h-[50vh] object-contain" />
        </button>
      </div>
    );
  }

  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {images.map((url, i) => (
          <button key={i} onClick={() => onImageClick(images, i)}
            className="block rounded-lg overflow-hidden bg-gray-900 active:opacity-90 transition-opacity">
            <img src={url} alt="" loading="lazy"
              className="w-full h-40 md:h-48 object-cover" />
          </button>
        ))}
      </div>
    );
  }

  // 3+ images — two-column gallery
  return (
    <div className="grid grid-cols-2 gap-2">
      {images.map((url, i) => (
        <button key={i} onClick={() => onImageClick(images, i)}
          className="block rounded-lg overflow-hidden bg-gray-900 active:opacity-90 transition-opacity">
          <img src={url} alt="" loading="lazy"
            className="w-full h-36 md:h-44 object-cover" />
        </button>
      ))}
    </div>
  );
}