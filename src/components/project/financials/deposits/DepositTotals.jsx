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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Stat label="Deposit invoices issued" value={t.requested} sub={t.deposit_invoices_outstanding > 0 ? `${money(t.deposit_invoices_outstanding)} not yet paid` : null} />
        <Stat label="Payments received" value={t.received} tone="text-emerald-300" />
        <Stat label="Credit applied" value={t.applied} tone="text-blue-300" />
        <Stat label="Refunds" value={t.refunded} tone={t.refunded > 0 ? "text-red-300" : "text-white"} />
        <Stat label="Available balance" value={t.available_to_apply} tone="text-amber-300" sub={t.reserved_by_drafts > 0 ? `${money(t.reserved_by_drafts)} reserved by drafts` : null} />
        <Stat label="Outstanding project invoices" value={t.project_invoices_outstanding} />
      </div>
      {(t.general_credit_balance > 0 || t.reserved_legacy_drafts > 0) && (
        <p className="text-xs text-sky-300">
          {t.general_credit_balance > 0 && `General project credit (not a deposit): ${money(t.general_credit_balance)}, ${money(t.available_general_credit)} available${t.reserved_general_by_drafts > 0 ? `, ${money(t.reserved_general_by_drafts)} reserved by drafts` : ""}. `}
          {t.reserved_legacy_drafts > 0 && `${money(t.reserved_legacy_drafts)} is reserved by older drafts that draw from any credit.`}
        </p>
      )}
      {t.needs_qb_entry > 0 && <p className="text-xs text-amber-300">{t.needs_qb_entry} item{t.needs_qb_entry > 1 ? "s" : ""} recorded here still need a manual QuickBooks entry. Nothing is posted to QuickBooks automatically.</p>}
    </div>
  );
}