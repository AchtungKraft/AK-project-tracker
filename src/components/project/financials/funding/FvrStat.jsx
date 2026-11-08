import React from "react";

// One labelled figure. `value` is already formatted; `na` shows a clear "Not available" instead of a number.
export default function FvrStat({ label, value, sub, tone = "text-white", na }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-t border-gray-800/70 first:border-t-0">
      <div className="min-w-0">
        <div className="text-xs text-gray-300">{label}</div>
        {sub && <div className="text-[10px] text-gray-500 leading-snug">{sub}</div>}
      </div>
      <div className={`text-sm font-semibold text-right shrink-0 ${na ? "text-gray-500 italic font-normal text-xs" : tone}`}>{na ? "Not available" : value}</div>
    </div>
  );
}