import React from "react";
import { money } from "./finFormat";

// Read-only: compares draft line amounts with the same allocated items at current prices.
export default function DraftReconciliationNote({ lines }) {
  const p = lines.parts.filter((r) => r.allocated_qty > 0);
  const s = lines.services.filter((r) => r.allocated);
  if (!p.length && !s.length) return null;
  const sum = (a, f) => a.reduce((t, r) => t + (f(r) || 0), 0);
  const onDraft = sum(p, (r) => r.draft_amount) + sum(s, (r) => r.draft_amount);
  const current = sum(p, (r) => r.allocated_current_value) + sum(s, (r) => r.billable);
  const diff = Math.round((current - onDraft) * 100) / 100;
  const changed = s.filter((r) => Math.abs(r.draft_amount - r.billable) > 0.01).length
    + p.filter((r) => Math.abs(r.draft_amount - r.allocated_current_value) > 0.01).length;
  return (
    <div className="rounded border border-blue-900/40 bg-blue-950/20 px-3 py-2 text-[11px] text-gray-300">
      <span className="text-blue-300">Draft allocations:</span> {p.length} part{p.length !== 1 && "s"}, {s.length} service{s.length !== 1 && "s"} ·
      draft lines {money(onDraft)} · same items at current prices {money(current)}
      {Math.abs(diff) > 0.01 && <span className="text-amber-400"> · {money(diff)} difference on {changed} item{changed !== 1 && "s"} priced differently on the draft (draft prices are not changed)</span>}
    </div>
  );
}