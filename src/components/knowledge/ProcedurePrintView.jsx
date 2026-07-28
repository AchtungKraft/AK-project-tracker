import React, { useMemo } from "react";
import { X } from "lucide-react";
import { normalizeKnowledgeEntry } from "./knowledgeHelpers";
import PrintArticleHeader from "./print/PrintArticleHeader";
import PrintStep from "./print/PrintStep";
import PrintCallout from "./print/PrintCallout";
import PrintMediaGallery from "./print/PrintMediaGallery";
import PrintPhaseHeading from "./print/PrintPhaseHeading";
import PrintFooter from "./print/PrintFooter";
import "@/styles/knowledge-print.css";

/**
 * Full-page print-optimized procedure view.
 * Opens as an overlay, triggers window.print(), then closes.
 *
 * Consumes the normalized content model — no separate data interpretation.
 */
export default function ProcedurePrintView({ item, entries, categories, parts, partLinks, onClose }) {
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

  // Entry counts
  const entryCounts = useMemo(() => {
    const counts = { steps: 0, notes: 0, warnings: 0, images: 0 };
    activeEntries.forEach(e => {
      if (e.entryType === 'step') counts.steps++;
      else if (e.entryType === 'note' || e.entryType === 'tip') counts.notes++;
      else if (e.entryType === 'issue') counts.warnings++;
      if (e.images.length > 0) counts.images += e.images.length;
    });
    return counts;
  }, [activeEntries]);

  // Resolve parts for an entry
  const getEntryParts = (entry) => {
    if (!entry.partIds?.length) return [];
    return entry.partIds.map(id => partMap[id]).filter(Boolean);
  };

  // Resolve procedure-level parts
  const procedureParts = useMemo(() => {
    return (partLinks || []).map(l => partMap[l.part_id]).filter(Boolean);
  }, [partLinks, partMap]);

  // Cover image — small thumbnail or omit
  const coverImage = item.cover_image_url || null;

  // Track phase headings to avoid duplication
  let currentPhase = null;
  let stepNum = 0;

  return (
    <div className="fixed inset-0 z-[100] bg-white overflow-auto print:static print:overflow-visible">
      {/* Screen-only toolbar */}
      <div className="print-hide sticky top-0 z-10 bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-medium flex-1">Print Preview</span>
        <button onClick={() => window.print()}
          className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
          Print
        </button>
      </div>

      {/* Printable content */}
      <div className="print-procedure">
        <PrintArticleHeader
          article={item}
          subsystemPath={subsystemPath}
          entryCounts={entryCounts}
          coverImage={coverImage}
        />

        {/* Required parts summary */}
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

        {/* Procedure entries */}
        <div className="print-entries">
          {activeEntries.map((entry) => {
            const entryParts = getEntryParts(entry);
            const rawEntry = entry._raw;

            // Phase heading — once per group
            let phaseHeading = null;
            const groupLabel = entry._raw.group_label || null;
            if (groupLabel && groupLabel !== currentPhase) {
              currentPhase = groupLabel;
              phaseHeading = <PrintPhaseHeading label={groupLabel} />;
            }

            // Render based on entry type
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

            // note, issue, reference, tip
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
  );
}