import React from "react";
import { format } from "date-fns";
import { RotateCw, History } from "lucide-react";

/**
 * Visual divider marking the start of a review cycle.
 * UI-only — does not affect state or data.
 */
export function CycleHeader({ label, date }) {
  const isCurrent = label.toLowerCase().includes('current');

  return (
    <div className="flex items-center gap-3 my-5">
      <div className={`flex-1 h-px ${isCurrent ? 'bg-green-700/50' : 'bg-gray-700/50'}`} />
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] uppercase tracking-widest font-semibold ${
        isCurrent
          ? 'bg-green-500/10 border-green-500/30 text-green-400'
          : 'bg-gray-800/50 border-gray-700/50 text-gray-500'
      }`}>
        {isCurrent ? <RotateCw className="w-3 h-3" /> : <History className="w-3 h-3" />}
        {label}
        {date && (
          <span className={isCurrent ? 'text-green-500/70 font-normal' : 'text-gray-600 font-normal'}>
            · {format(new Date(date), "MMM d")}
          </span>
        )}
      </div>
      <div className={`flex-1 h-px ${isCurrent ? 'bg-green-700/50' : 'bg-gray-700/50'}`} />
    </div>
  );
}

/**
 * Subtle divider between review cycles.
 */
export function CycleDivider() {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="flex-1 border-t border-dashed border-gray-700/40" />
      <span className="text-[10px] text-gray-600 uppercase tracking-widest">Previous Activity</span>
      <div className="flex-1 border-t border-dashed border-gray-700/40" />
    </div>
  );
}