import React from "react";
import { money } from "@/components/project/financials/finFormat";
import { useProjectDeposits } from "./useProjectDeposits";

// Concise funding line for Budget & Planning. Planned deposit milestones are never counted as received,
// and deposits never raise the confirmed budget.
export default function DepositFundingSummary({ projectId, confirmedBudget }) {
  const { data } = useProjectDeposits(projectId);
  const t = data?.totals;
  if (!t) return null;
  const items = [
    ["Confirmed budget", confirmedBudget == null ? "Not set" : money(confirmedBudget)],
    ["Deposits issued", money(t.requested)], ["Received", money(t.received)], ["Applied", money(t.applied)],
    ["Refunded", money(t.refunded)], ["Available", money(t.available_to_apply)], ["Outstanding invoices", money(t.project_invoices_outstanding)],
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-gray-800 bg-black/30 px-3 py-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 self-center">Client deposits</span>
      {items.map(([l, v]) => <span key={l} className="text-gray-400">{l} <span className="tabular-nums text-white">{v}</span></span>)}
    </div>
  );
}