import React from "react";
import { money } from "@/components/project/financials/finFormat";
import { useProjectDeposits } from "./useProjectDeposits";

// Concise funding line for Budget & Planning. Planned deposit milestones are never counted as received.
export default function DepositFundingSummary({ projectId, confirmedBudget }) {
  const { data } = useProjectDeposits(projectId);
  const t = data?.totals;
  if (!t) return null;
  const items = [
    ["Confirmed budget", confirmedBudget == null ? "Not set" : money(confirmedBudget)],
    ["Deposit invoiced", money(t.requested)], ["Deposit received", money(t.received)],
    ["Applied", money(t.applied)], ["Remaining", money(t.remaining)],
  ];
  if (t.refunded > 0) items.splice(4, 0, ["Refunded", money(t.refunded)]);
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-gray-800 bg-black/30 px-3 py-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 self-center">Client deposits</span>
      {items.map(([l, v]) => <span key={l} className="text-gray-400">{l} <span className="tabular-nums text-white">{v}</span></span>)}
    </div>
  );
}