import React from "react";
import { cn } from "@/lib/utils";

// Small phones: hard costs keep description | cost; labor stacks the numbers under the operation.
const GRID = {
  hard: "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_8.5rem]",
  labor: "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem]",
};

/**
 * One component group (Hard Costs or AK Labor) with aligned columns.
 * rows: [{ key, label?, description, hours?, value?, sub?, tbd? }]
 * emptyLabel: shown in place of rows when the component has no estimate yet.
 */
export default function ScopeItemComponentSection({ title, accent, kind = "hard", rows, subtotalHours, subtotal, emptyLabel }) {
  if (!rows.length && !emptyLabel) return null;
  if (!rows.length) {
    return (
      <div className="flex items-baseline justify-between gap-4">
        <p className={cn("text-[10px] font-semibold uppercase tracking-widest", accent)}>{title}</p>
        <p className="text-xs text-amber-400/90 italic">{emptyLabel}</p>
      </div>
    );
  }
  const isLabor = kind === "labor";
  const grid = cn("grid gap-x-4", GRID[kind]);
  const numAlign = isLabor ? "text-left sm:text-right" : "text-right";

  return (
    <div>
      <div className={cn(grid, "items-baseline pb-1 border-b border-slate-700/40")}>
        <p className={cn("text-[10px] font-semibold uppercase tracking-widest", accent)}>{title}</p>
        {isLabor && <p className="hidden sm:block text-[11px] text-gray-500 tabular-nums text-right">{subtotalHours}</p>}
        <p className={cn("text-[11px] text-gray-500 tabular-nums", numAlign)}>
          {isLabor && subtotalHours && <span className="sm:hidden">{subtotalHours}{subtotal ? ' · ' : ''}</span>}
          {subtotal}
        </p>
      </div>
      {(
        <div className="divide-y divide-gray-700/30">
          {rows.map((r, i) => (
            <div key={r.key ?? i} className={cn(grid, "items-baseline py-1.5")}>
              <p className="text-[13px] text-gray-300 leading-snug break-words min-w-0">
                {r.label && <span className={cn("font-semibold", accent)}>{r.label}</span>}
                {r.label && r.description && <span className="text-gray-600"> — </span>}
                {r.description}
              </p>
              {isLabor && (
                <p className="hidden sm:block text-[13px] text-gray-200 tabular-nums text-right whitespace-nowrap">{r.hours}</p>
              )}
              <div className={cn(numAlign, "whitespace-nowrap")}>
                {isLabor && <span className="sm:hidden text-[13px] text-gray-200 tabular-nums">{r.hours}{r.value ? ' · ' : ''}</span>}
                {r.value && <span className={cn("text-[13px] tabular-nums", r.tbd ? "text-amber-400" : "text-gray-200")}>{r.value}</span>}
                {r.sub && <span className="block text-[10px] text-gray-500 tabular-nums">{r.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}