import React from "react";
import { cn } from "@/lib/utils";

/**
 * One labeled component group (Hard Costs or AK Labor).
 * rows: [{ key, label?, description, value, sub?, tbd? }]
 */
export default function ScopeItemComponentSection({ title, accent, rows, subtotal }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <p className={cn("text-[10px] font-semibold uppercase tracking-widest", accent)}>{title}</p>
        {subtotal && <p className="text-[11px] text-gray-500 tabular-nums text-right">{subtotal}</p>}
      </div>
      <div className="divide-y divide-gray-700/30">
        {rows.map((r, i) => (
          <div key={r.key ?? i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-1.5">
            <div className="min-w-0">
              {r.label && <p className={cn("text-[10px] font-semibold uppercase tracking-wide", accent)}>{r.label}</p>}
              {r.description && <p className="text-[13px] text-gray-300 leading-snug break-words">{r.description}</p>}
            </div>
            <div className="text-right">
              <p className={cn("text-[13px] tabular-nums whitespace-nowrap", r.tbd ? "text-amber-400" : "text-gray-200")}>{r.value}</p>
              {r.sub && <p className="text-[10px] text-gray-500 tabular-nums whitespace-nowrap">{r.sub}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}