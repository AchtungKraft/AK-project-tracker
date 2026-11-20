import React from "react";
import { money } from "./finFormat";
import { Stat } from "./FinancialSummaryCards";

// Six-figure summary. Every value comes from the canonical billing position (same as Create Invoice,
// Ready to Invoice and Open Dollars). Nothing is recalculated here.
export default function FinancialPositionStrip({ data }) {
  const p = data.position;
  const s = data.summary;
  const a = data.authorization;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
      <Stat label="Billing opportunity" value={money(p.opportunity)} tone="text-green-400"
        sub={p.non_billable ? `Non-Billable · ${money(p.excluded)} excluded` : `Not yet invoiced · ${money(p.on_drafts)} on drafts`} />
      <Stat label="Projected total" value={money(p.projected_total)} sub={`Incl. ${money((p.projected_labor_available || 0) + (p.projected_labor_on_drafts || 0))} projected labor`} />
      <Stat label="Earned labor" value={money(p.labor_earned_to_date)} sub={`${money(p.labor_projected_remaining)} remaining estimate`} />
      <Stat label="Invoiced (work)" value={money(s.work_invoiced ?? s.finalized_invoiced)}
        sub={s.deposit_invoiced > 0 ? `Excl. ${money(s.deposit_invoiced)} deposit invoices · paid ${money(s.paid_amount)}` : `Paid ${money(s.paid_amount)} · drafts ${money(s.draft_invoice_amount)}`} />
      <Stat label="Outstanding" value={money(s.outstanding_balance)} tone={s.overdue_count > 0 ? "text-red-400" : "text-amber-300"}
        sub={s.overdue_count > 0 ? `${s.overdue_count} overdue · ${money(s.overdue_total)}` : `Credit available ${money(s.credit_balance)}`} />
      <Stat label="Client budget" value={a.confirmed ? money(a.authorized) : "Not set"}
        sub={a.confirmed ? `${money(a.remaining_authorization)} remaining` : "No confirmed budget"} />
    </div>
  );
}