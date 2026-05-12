import React, { useRef } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";

const ENTRY_TYPE_LABEL = {
  step: "Step",
  note: "Note",
  issue: "⚠ Warning",
  reference: "Reference",
  tip: "Tip",
  media: "Media",
};

/**
 * Full-page print-optimized procedure view.
 * Opens as an overlay, triggers window.print(), then closes.
 */
export default function ProcedurePrintView({ item, entries, categories, parts, partLinks, onClose }) {
  const printRef = useRef(null);

  const cat = categories?.find(c => c.id === item.category_id);
  const subcat = categories?.find(c => c.id === item.subcategory_id);
  const subsystemPath = [cat?.name, subcat?.name].filter(Boolean).join(' › ');

  // Sort entries by order_index
  const sortedEntries = [...entries].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  // Build part lookup from partLinks
  const partMap = {};
  (parts || []).forEach(p => { partMap[p.id] = p; });

  // Resolve parts for an entry
  const getEntryParts = (entry) => {
    if (!entry.part_ids?.length) return [];
    return entry.part_ids.map(id => partMap[id]).filter(Boolean);
  };

  // Resolve procedure-level parts
  const procedureParts = (partLinks || []).map(l => partMap[l.part_id]).filter(Boolean);

  // Step numbering
  let stepNum = 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white overflow-auto print:static print:overflow-visible">
      {/* Screen-only toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-medium flex-1">Print Preview</span>
        <button onClick={handlePrint}
          className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
          Print
        </button>
      </div>

      {/* Printable content */}
      <div ref={printRef} className="print-procedure max-w-[800px] mx-auto px-8 py-10 print:px-0 print:py-0 print:max-w-none">
        {/* Header */}
        <div className="procedure-header border-b-2 border-black pb-4 mb-6">
          <h1 className="text-2xl font-bold text-black leading-tight">{item.title}</h1>
          {subsystemPath && (
            <p className="text-sm text-gray-600 mt-1">{subsystemPath}</p>
          )}
          {item.summary && (
            <p className="text-sm text-gray-700 mt-2 leading-relaxed">{item.summary}</p>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
            {item.vehicle_tags?.map(tag => (
              <span key={tag} className="px-2 py-0.5 border border-gray-300 rounded text-gray-600">{tag}</span>
            ))}
            <span>Printed: {format(new Date(), 'MMM d, yyyy · h:mm a')}</span>
            {item.version && <span>v{item.version}</span>}
            {sortedEntries.length > 0 && <span>{sortedEntries.filter(e => (e.entry_type || 'step') === 'step').length} steps</span>}
          </div>
        </div>

        {/* Required parts summary */}
        {procedureParts.length > 0 && (
          <div className="mb-6 print-avoid-break">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-2 border-b border-gray-300 pb-1">
              Required Parts
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {procedureParts.map(part => (
                <div key={part.id} className="flex items-center gap-2 text-sm text-gray-700 py-0.5">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                  <span>{part.part_name || part.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Procedure entries */}
        <div className="space-y-0">
          {sortedEntries.map((entry) => {
            const entryType = entry.entry_type || 'step';
            const isStep = entryType === 'step';
            if (isStep) stepNum++;
            const entryParts = getEntryParts(entry);
            const images = entry.image_urls || [];
            const isWarning = entryType === 'issue';

            return (
              <div key={entry.id} className="print-avoid-break border-b border-gray-200 py-4">
                {/* Step header */}
                <div className="flex items-start gap-3">
                  {/* Checkbox + number */}
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <div className="w-5 h-5 border-2 border-gray-400 rounded" />
                    {isStep && (
                      <span className="text-lg font-bold text-black w-8 text-center">{stepNum}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Type badge for non-steps */}
                    {!isStep && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 inline-block ${isWarning ? 'text-red-700' : 'text-gray-500'}`}>
                        {ENTRY_TYPE_LABEL[entryType] || entryType}
                      </span>
                    )}

                    {/* Headline */}
                    <h3 className={`font-semibold leading-snug ${isWarning ? 'text-red-800' : 'text-black'} ${isStep ? 'text-base' : 'text-sm'}`}>
                      {entry.headline}
                    </h3>

                    {/* Content */}
                    {entry.content_html && (
                      <div
                        className="print-content text-sm text-gray-700 mt-1 leading-relaxed [&_a]:text-blue-700 [&_a]:underline [&_img]:hidden"
                        dangerouslySetInnerHTML={{ __html: entry.content_html }}
                      />
                    )}

                    {/* Warning box */}
                    {isWarning && (
                      <div className="mt-2 border-l-4 border-red-700 pl-3 py-1 text-sm text-red-800 bg-red-50">
                        ⚠ Review carefully before proceeding
                      </div>
                    )}

                    {/* Entry-level parts */}
                    {entryParts.length > 0 && (
                      <div className="mt-2 text-xs text-gray-600">
                        <span className="font-semibold">Parts: </span>
                        {entryParts.map(p => p.part_name || p.name).join(', ')}
                      </div>
                    )}

                    {/* Reference URL */}
                    {entry.reference_url && (
                      <div className="mt-1 text-xs text-gray-500">
                        Ref: {entry.reference_url}
                      </div>
                    )}
                  </div>
                </div>

                {/* Images — print-optimized */}
                {images.length > 0 && (
                  <div className="mt-3 ml-10 grid grid-cols-2 gap-2">
                    {images.map((url, i) => (
                      <div key={i} className="print-avoid-break">
                        <img
                          src={url}
                          alt=""
                          className="w-full max-h-[280px] object-contain border border-gray-200 rounded"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t-2 border-black flex items-center justify-between text-xs text-gray-500">
          <span>{item.title}</span>
          <span>Printed {format(new Date(), 'MMM d, yyyy')}</span>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          /* Reset everything */
          body * { visibility: hidden; }
          .print-procedure, .print-procedure * { visibility: visible; }
          .print-procedure {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0.5in 0.6in;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }

          /* Remove dark theme artifacts */
          .print-procedure, .print-procedure * {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Warning boxes keep tint */
          .print-procedure .border-red-700 {
            border-color: #b91c1c !important;
          }
          .print-procedure .bg-red-50 {
            background: #fef2f2 !important;
          }
          .print-procedure .text-red-800,
          .print-procedure .text-red-700 {
            color: #991b1b !important;
          }

          /* Images */
          .print-procedure img {
            max-height: 260px;
            object-fit: contain;
            break-inside: avoid;
          }

          /* Page break avoidance */
          .print-avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Step blocks */
          .print-procedure .border-b {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Checkbox styling */
          .print-procedure .border-gray-400 {
            border-color: #666 !important;
          }

          /* Type badges */
          .print-procedure .text-gray-500 {
            color: #666 !important;
          }
          .print-procedure .text-gray-600 {
            color: #555 !important;
          }
          .print-procedure .text-gray-700 {
            color: #333 !important;
          }

          /* No screen toolbar */
          .print\\:hidden { display: none !important; }

          /* Link refs */
          .print-content a::after {
            content: " (" attr(href) ")";
            font-size: 0.7em;
            color: #666;
          }

          /* Hide inline images from content_html (shown separately) */
          .print-content img { display: none !important; }
        }
      `}</style>
    </div>
  );
}