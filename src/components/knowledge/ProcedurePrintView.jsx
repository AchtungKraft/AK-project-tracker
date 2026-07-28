import React, { useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { normalizeKnowledgeEntry, getKnowledgeEntryCounts } from "./knowledgeHelpers";
import PrintArticleHeader from "./print/PrintArticleHeader";
import PrintStep from "./print/PrintStep";
import PrintCallout from "./print/PrintCallout";
import PrintMediaGallery from "./print/PrintMediaGallery";
import PrintPhaseHeading from "./print/PrintPhaseHeading";
import PrintFooter from "./print/PrintFooter";
import "@/styles/knowledge-print.css";

/**
 * Full-page print-optimized procedure view.
 * Renders via React portal on document.body for complete shell isolation.
 * Locks body scroll, traps focus, restores state on close.
 */
export default function ProcedurePrintView({ item, entries, categories, parts, partLinks, onClose }) {
  const scrollRef = useRef(null);
  const closeRef = useRef(null);
  const savedScrollY = useRef(window.scrollY);
  const savedOverflow = useRef(document.body.style.overflow);

  // Lock body scroll on mount, restore on unmount
  useEffect(() => {
    savedScrollY.current = window.scrollY;
    savedOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('knowledge-print-active');

    return () => {
      document.body.style.overflow = savedOverflow.current;
      document.body.classList.remove('knowledge-print-active');
      window.scrollTo(0, savedScrollY.current);
    };
  }, []);

  // Focus the close button on mount for keyboard accessibility
  useEffect(() => {
    const timer = setTimeout(() => closeRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Escape key closes preview
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Build category path
  const cat = categories?.find(c => c.id === item.category_id);
  const subcat = categories?.find(c => c.id === item.subcategory_id);
  const subsystemPath = [cat?.name, subcat?.name].filter(Boolean).join(' › ');

  // Part lookup
  const partMap = useMemo(() => {
    const m = {};
    (parts || []).forEach(p => { m[p.id] = p; });
    return m;
  }, [parts]);

  // Normalize, filter, and sort entries
  const activeEntries = useMemo(() => {
    return entries
      .map(e => normalizeKnowledgeEntry(e))
      .filter(e => e && !e.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [entries]);

  // Shared entry counts
  const entryCounts = useMemo(() => getKnowledgeEntryCounts(entries), [entries]);

  // Resolve parts for an entry
  const getEntryParts = (entry) => {
    if (!entry.partIds?.length) return [];
    return entry.partIds.map(id => partMap[id]).filter(Boolean);
  };

  // Resolve procedure-level parts
  const procedureParts = useMemo(() => {
    return (partLinks || []).map(l => partMap[l.part_id]).filter(Boolean);
  }, [partLinks, partMap]);

  const coverImage = item.cover_image_url || null;

  let currentPhase = null;
  let stepNum = 0;

  const handlePrint = () => {
    window.print();
  };

  const content = (
    <div
      className="knowledge-print-root"
      role="dialog"
      aria-modal="true"
      aria-label="Print Preview"
    >
      {/* Screen-only toolbar */}
      <div className="print-preview-toolbar print-hide">
        <div className="print-preview-toolbar-inner">
          <button ref={closeRef} onClick={onClose} className="print-toolbar-close" aria-label="Close print preview">
            <X className="w-5 h-5" />
          </button>
          <span className="print-toolbar-title">Print Preview</span>
          <span className="print-toolbar-article-name">{item.title}</span>
          <div className="print-toolbar-spacer" />
          <button onClick={handlePrint} className="print-toolbar-print-btn">
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Paper preview area */}
      <div className="print-preview-scroll" ref={scrollRef}>
        <div className="print-preview-paper">
          <div className="print-procedure">
            <PrintArticleHeader
              article={item}
              subsystemPath={subsystemPath}
              entryCounts={entryCounts}
              coverImage={coverImage}
            />

            {procedureParts.length > 0 && (
              <div className="print-parts-summary">
                <h2 className="print-parts-heading">REQUIRED PARTS</h2>
                <div className="print-parts-grid">
                  {procedureParts.map(part => (
                    <div key={part.id} className="print-parts-item">
                      • {part.part_name || part.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="print-entries">
              {activeEntries.map((entry) => {
                const entryParts = getEntryParts(entry);
                const rawEntry = entry._raw;

                let phaseHeading = null;
                const groupLabel = entry._raw.group_label || null;
                if (groupLabel && groupLabel !== currentPhase) {
                  currentPhase = groupLabel;
                  phaseHeading = <PrintPhaseHeading label={groupLabel} />;
                }

                if (entry.isStep) {
                  stepNum++;
                  return (
                    <React.Fragment key={entry.id}>
                      {phaseHeading}
                      <PrintStep stepNumber={stepNum} entry={rawEntry} entryParts={entryParts} />
                    </React.Fragment>
                  );
                }

                if (entry.entryType === 'media') {
                  return (
                    <React.Fragment key={entry.id}>
                      {phaseHeading}
                      <PrintMediaGallery entry={rawEntry} />
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={entry.id}>
                    {phaseHeading}
                    <PrintCallout entry={rawEntry} entryParts={entryParts} />
                  </React.Fragment>
                );
              })}
            </div>

            <PrintFooter article={item} />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}