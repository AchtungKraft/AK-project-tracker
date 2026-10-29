import React from "react";
import { money } from "./finFormat";
import { Stat } from "./FinancialSummaryCards";

export default function FinancialMoreMetrics({ s }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Stat label="Parts & services billable" value={money(s.current_billable)} />
      <Stat label="Labor billable to date" value={money(s.labor_billable_to_date)} sub="Billable hours × approved rate" />
      <Stat label="Projected remaining labor" value={money(s.labor_projected_remaining)} sub="Estimate, not actual" />
      <Stat label="Estimated cost" value={money(s.estimated_cost)} sub="P&S only" />
      <Stat label="Draft invoices" value={money(s.draft_invoice_amount)} sub="Not counted as invoiced" />
      <Stat label="Remaining uninvoiced" value={money(s.remaining_uninvoiced)} />
      <Stat label="Allocated to drafts" value={money(s.allocated_to_drafts)} />
    </div>
  );
}