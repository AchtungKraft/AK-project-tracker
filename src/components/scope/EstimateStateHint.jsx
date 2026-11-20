import React from "react";

/** Shows how a Low/High/TBD entry will read on the Scope Review. No value = description only. */
export default function EstimateStateHint({ label, sub }) {
  if (!label) return <span className="text-[10px] text-gray-500 italic">Description only</span>;
  return (
    <span className={label === 'TBD' ? "text-[10px] text-amber-400 font-medium" : "text-[10px] text-emerald-400 font-medium"}>
      {label}{sub && sub !== 'TBD' ? ` · ${sub}` : ''}
    </span>
  );
}