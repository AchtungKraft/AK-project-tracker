import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { money, pct } from "./finFormat";
import FinancialMoreMetrics from "./FinancialMoreMetrics";

export function Stat({ label, value, sub, tone = "text-white" }) {
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 leading-tight">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 truncate">{sub}</div>}
    </div>
  );
}

export default function FinancialSummaryCards({ summary: s }) {
  const [more, setMore] = useState(false);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <Stat label="Total current billable" value={money(s.total_current_billable)} sub={`P&S ${money(s.current_billable)} + labor ${money(s.labor_billable_to_date)}`} />
        <Stat label="Total projected billable" value={money(s.total_projected_billable)} sub={`Incl. ${money(s.labor_projected_remaining)} remaining labor`} />
        <Stat label="Finalized invoiced" value={money(s.finalized_invoiced)} sub={`Drafts ${money(s.draft_invoice_amount)} not counted`} />
        <Stat label="Outstanding balance" value={money(s.outstanding_balance)} sub={`Paid ${money(s.paid_amount)}`} />
        <Stat label="Parts & Services available to invoice" value={money(s.available_to_invoice)} tone="text-green-400" sub={`Uninvoiced ${money(s.remaining_uninvoiced)}`} />
        <Stat label="Est. gross profit (P&S)" value={money(s.estimated_gross_profit)} sub={`${pct(s.estimated_gross_margin_pct)} margin${s.cost_complete ? "" : " · incomplete cost"}`}
          tone={s.estimated_gross_profit < 0 ? "text-red-400" : "text-green-400"} />
      </div>
      <p className="text-[11px] text-gray-500">Labor billing is included in project financial estimates but is not yet available through the invoice workflow.</p>
      <button onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
        {more ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} All metrics
      </button>
      {more && <FinancialMoreMetrics s={s} />}
    </div>
  );
}