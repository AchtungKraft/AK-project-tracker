import React from "react";
import { formatCents } from "@/lib/retainerMoney";

export const formatHours = (x100) => (Number.isSafeInteger(x100) ? `${Math.floor(x100 / 100)}${x100 % 100 ? "." + String(x100 % 100).padStart(2, "0") : ""}` : "—");

export default function RetainerEstimateTable({ lines = [] }) {
  return (
    <div className="divide-y divide-gray-800 rounded border border-gray-800 text-sm">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-4 gap-2 px-3 py-2">
          <span className="text-white">{l.labor_group_name}</span>
          <span className="text-gray-300">{formatHours(l.hours_x100)} hrs</span>
          <span className="text-gray-400">
            {l.standard_rate_cents > l.negotiated_rate_cents && <span className="line-through mr-1">{formatCents(l.standard_rate_cents)}</span>}
            {formatCents(l.negotiated_rate_cents)}/hr
          </span>
          <span className="text-right text-white">{formatCents(l.est_negotiated_cents)}</span>
        </div>
      ))}
    </div>
  );
}