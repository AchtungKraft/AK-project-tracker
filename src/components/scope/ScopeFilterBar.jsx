import React from "react";
import { cn } from "@/lib/utils";
import { FILTER_OPTIONS } from "./scopeHelpers";

export default function ScopeFilterBar({ value, onChange, stats, isMobile = false }) {
  return (
    <div className={cn("flex gap-1.5 flex-wrap", isMobile ? "gap-1" : "gap-1.5")}>
      {FILTER_OPTIONS.map(opt => {
        const count = opt.value === 'all' ? stats?.total : stats?.[opt.value];
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
              isActive
                ? "bg-cyan-600/30 border-cyan-500/50 text-cyan-300"
                : "bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-800",
              count === 0 && !isActive && "opacity-50"
            )}
          >
            {opt.label}
            {count > 0 && <span className="ml-1 text-[10px] opacity-70">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}