import React from "react";
import { mRange, hRange } from "./scopeBudgetFormat";

const Stat = ({ label, value, sub }) => (
  <div className="rounded-md border border-gray-800 bg-gray-950/40 p-3 min-w-0">
    <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
    <div className="text-sm font-semibold text-white mt-0.5 break-words">{value}</div>
    {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

export default function ScopeBudgetTotals({ t }) {
  const unknown = (n, what) => (n ? `${n} ${what}` : null);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <Stat label="Hard-cost allowance (cost basis)" value={mRange(t.hard_cost)}
        sub={[`${t.hard_cost.known_count} estimated`, unknown(t.hard_cost_tbd, "TBD"), unknown(t.hard_cost_not_estimated, "not estimated")].filter(Boolean).join(" · ")} />
      <Stat label="Approved labor hours" value={hRange(t.labor_hours)} sub={unknown(t.labor_not_estimated, "items without labor estimate")} />
      <Stat label="Labor at rate snapshot" value={mRange(t.labor_dollars)} sub="Estimate of labor value, not logged or invoiced" />
      <Stat label="Items" value={`${t.items} approved`} sub={`${t.converted} converted · ${t.not_converted} not yet converted`} />
      <Stat label="Converted — hard cost / labor" value={mRange(t.converted_hard_cost)} sub={mRange(t.converted_labor_dollars) + " labor"} />
      <Stat label="Not converted — hard cost / labor" value={mRange(t.not_converted_hard_cost)} sub={mRange(t.not_converted_labor_dollars) + " labor"} />
      <Stat label="Allowance not yet linked to parts" value={mRange(t.unlinked_hard_cost)} sub="Services can't be attributed per item" />
      {t.legacy_items > 0 && <Stat label="Legacy unclassified budget" value={mRange(t.legacy_budget)} sub={`${t.legacy_items} items · not split cost vs labor`} />}
    </div>
  );
}