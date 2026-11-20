import React from "react";
import { money } from "@/components/project/financials/finFormat";

const Stat = ({ label, value, tone = "text-white", sub }) => (
  <div className="min-w-[7rem]">
    <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
    <div className={`tabular-nums font-medium ${tone}`}>{money(value ?? 0)}</div>
    {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
  </div>
);

// Deposits are client funding, not earned revenue. Applied amounts are already inside invoice totals.
export default function DepositTotals({ t }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      <Stat label="Deposit invoiced" value={t.requested} sub={t.deposit_invoices_outstanding > 0 ? `${money(t.deposit_invoices_outstanding)} not yet paid` : null} />
      <Stat label="Received" value={t.received} tone="text-emerald-300" />
      <Stat label="Applied to invoices" value={t.applied} tone="text-blue-300" />
      {t.refunded > 0 && <Stat label="Refunded" value={t.refunded} tone="text-red-300" />}
      <Stat label="Remaining credit" value={t.remaining} tone="text-amber-300" sub={t.reserved_by_drafts > 0 ? `${money(t.available_to_apply)} free · rest reserved by drafts` : null} />
    </div>
  );
}