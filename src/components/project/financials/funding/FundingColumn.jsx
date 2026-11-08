import React from "react";
import { money } from "../finFormat";
import { cents } from "./fundingFormat";
import FvrStat from "./FvrStat";

// Client money: plan (draft) vs canonical invoices and credit ledger. Never summed together.
export default function FundingColumn({ plan, fa }) {
  const dep = fa.by_type.deposit, prog = fa.by_type.progress, cr = fa.credits;
  const budget = plan?.agreed_client_budget_cents;
  const ms = plan?.milestones || [];
  return (
    <div className="rounded-md bg-gray-900/50 border border-gray-800 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-300 mb-1">Funding · client money</h4>
      <FvrStat label="Agreed client billing budget" na={budget == null} value={cents(budget)} tone={plan?.agreed_budget_confirmed ? "text-white" : "text-amber-300"} sub={budget == null ? "Not entered" : plan.agreed_budget_confirmed ? "Confirmed" : "Entered, NOT confirmed"} />
      <FvrStat label="Planned deposit milestones (draft)" value={cents(plan?.total_planned_cents ?? 0)} tone="text-violet-300" sub={`${ms.length} milestone(s) · plan only, not invoiced`} />
      <FvrStat label="Funding requested" value={money(0)} tone="text-gray-400" sub="Billing from milestones not enabled" />
      <FvrStat label="Deposit invoiced / received" value={`${money(dep.invoiced)} / ${money(dep.received)}`} tone="text-emerald-300" sub={`${dep.live_count} sent · ${dep.paid_count} paid · ${dep.draft_count} draft`} />
      <FvrStat label="Progress invoiced / received" value={`${money(prog.invoiced)} / ${money(prog.received)}`} sub={`${prog.live_count} sent · ${prog.paid_count} paid · ${prog.draft_count} draft`} />
      <FvrStat label="Client advance credit remaining" value={money(cr.remaining)} tone="text-sky-300" sub={`Unapplied credit balance, NOT cash · ${cr.rows} ledger row(s)${cr.rounding_residue_rows ? ` · ${cr.rounding_residue_rows} rounding residue ignored` : ""}`} />
      <FvrStat label="Credit applied to sent invoices" value={money(fa.credit_applied_on_invoices)} sub={fa.credit_proposed_on_drafts ? `${money(fa.credit_proposed_on_drafts)} proposed on drafts (not deducted)` : "From canonical invoices"} />
    </div>
  );
}