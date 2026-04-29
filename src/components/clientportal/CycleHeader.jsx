import React from "react";
import { format } from "date-fns";

/**
 * Visual divider marking the start of a review cycle.
 * UI-only — does not affect state or data.
 */
export function CycleHeader({ label, date }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-700" />
      <div className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
        {label}
        {date && (
          <span className="text-gray-500 font-normal">
            · {format(new Date(date), "MMM d")}
          </span>
        )}
      </div>
      <div className="flex-1 h-px bg-gray-700" />
    </div>
  );
}

/**
 * Subtle divider between review cycles.
 */
export function CycleDivider() {
  return (
    <div className="my-6 border-t border-dashed border-gray-700/40" />
  );
}