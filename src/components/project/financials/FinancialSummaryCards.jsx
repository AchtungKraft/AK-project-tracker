import React from "react";
import { money, pct } from "./finFormat";

function Stat({ label, value, sub, tone = "text-white" }) {
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 truncate">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 truncate">{sub}</div>}
    </div>
  );
}

export default function FinancialSummaryCards({ summary: s }) {
  const est = `P&S only · ${s.cost_complete ? "estimated" : "incomplete cost"}`;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <Stat label="Parts & services billable" value={money(s.current_billable)} />
      <Stat label="Labor billable to date" value={money(s.labor_billable_to_date)} sub="Billable hours × approved rate" />
      <Stat label="Projected remaining labor" value={money(s.labor_projected_remaining)} sub="Estimate, not actual" />
      <Stat label="Total current billable" value={money(s.total_current_billable)} sub="P&S + labor to date" />
      <Stat label="Total projected billable" value={money(s.total_projected_billable)} sub="Incl. remaining labor" />
      <Stat label="Estimated cost" value={money(s.estimated_cost)} sub={est} />
      <Stat label="Est. gross profit" value={money(s.estimated_gross_profit)} sub={est}
        tone={s.estimated_gross_profit < 0 ? "text-red-400" : "text-green-400"} />
      <Stat label="Est. gross margin" value={pct(s.estimated_gross_margin_pct)} sub={est} />
      <Stat label="Finalized invoiced" value={money(s.finalized_invoiced)} sub="Sent + paid (historical)" />
      <Stat label="Draft invoices" value={money(s.draft_invoice_amount)} sub="Not counted as invoiced" />
      <Stat label="Outstanding balance" value={money(s.outstanding_balance)} sub={`Paid ${money(s.paid_amount)}`} />
      <Stat label="Remaining uninvoiced" value={money(s.remaining_uninvoiced)} sub="Current scope not yet invoiced" />
      <Stat label="Allocated to drafts" value={money(s.allocated_to_drafts)} sub="Unique items on drafts" />
      <Stat label="Available to invoice" value={money(s.available_to_invoice)} tone="text-green-400" />
    </div>
  );
}