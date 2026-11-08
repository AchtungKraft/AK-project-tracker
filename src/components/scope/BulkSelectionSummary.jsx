import React from "react";

// Compact "selected by group" summary shown above the Create button.
export default function BulkSelectionSummary({ tree, selected }) {
  const rows = tree.flatMap(c => c.groups.map(g => ({
    key: `${c.id}:${g.id}`, label: `${c.name} / ${g.name}`,
    n: g.items.filter(i => selected.has(i.id)).length,
  }))).filter(r => r.n > 0);
  if (!rows.length) return null;
  return (
    <div className="text-[11px] text-gray-400 flex flex-wrap gap-x-3 gap-y-1 max-h-16 overflow-y-auto" aria-live="polite">
      {rows.map(r => <span key={r.key}><span className="text-gray-300">{r.label}</span> · {r.n}</span>)}
    </div>
  );
}