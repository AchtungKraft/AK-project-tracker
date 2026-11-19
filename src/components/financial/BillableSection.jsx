import React from "react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

// One clearly labelled section of the Create Invoice builder. Renders nothing when the section is empty.
export default function BillableSection({ title, hint, total, count, empty, children }) {
  if (!count && !empty) return null;
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-300">{title}</h4>
        {count > 0 && <span className="text-xs text-gray-400 shrink-0">{count} · {formatCurrencyUSD(total || 0)}</span>}
      </div>
      {hint && <p className="px-1 text-[11px] text-gray-500">{hint}</p>}
      {count > 0 ? children : <p className="px-1 text-xs text-gray-600">{empty}</p>}
    </section>
  );
}