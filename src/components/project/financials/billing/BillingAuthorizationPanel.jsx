import React from "react";
import { Button } from "@/components/ui/button";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const Stat = ({ label, value, tone = "text-white", sub }) => (
  <div className="rounded border border-gray-800 bg-gray-900/50 p-2">
    <p className="text-[11px] text-gray-500">{label}</p>
    <p className={`text-sm font-semibold ${tone}`}>{value}</p>
    {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
  </div>
);
const money = (v) => (v == null ? "Not set" : formatCurrencyUSD(v));

// Read-only view of the confirmed client-agreed billing budget and what has been billed against it.
// The budget itself is entered and confirmed in the funding plan (Budget & Planning); originals are never overwritten.
export default function BillingAuthorizationPanel({ a, earned, projected, onGoToFunding }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-black/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Billing authorization</h3>
          <p className="text-xs text-gray-500">Ceiling = client-agreed budget confirmed by an admin. Internal estimates never count as approved.</p>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={onGoToFunding}>{a.confirmed ? "Review or revise budget" : "Set and confirm budget"}</Button>
      </div>
      {!a.confirmed && <p className="text-xs text-amber-400">No confirmed client-agreed budget. Projected labor can't be billed; other billing is not limited.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <Stat label="Original authorized" value={money(a.original_authorized)} />
        <Stat label="Current authorized" value={money(a.authorized)} sub={a.revisions.length > 1 ? `${a.revisions.length - 1} approved revision(s)` : null} />
        <Stat label="Invoiced against authorization" value={formatCurrencyUSD(a.invoiced_net)} sub={`${formatCurrencyUSD(a.invoiced_gross)} issued − ${formatCurrencyUSD(a.credits_applied)} credits applied`} />
        <Stat label="On drafts" value={formatCurrencyUSD(a.drafts_net)} sub="Net of proposed credit" />
        <Stat label="Remaining authorization" value={money(a.remaining_authorization)} tone={a.remaining_authorization < 0 ? "text-red-400" : "text-emerald-400"} />
        <Stat label="Deposits invoiced" value={formatCurrencyUSD(a.deposits.invoiced)} sub="Received, applied and available: see Project Deposits" />
        <Stat label="All credits available" value={formatCurrencyUSD(a.credit_balance)} />
        <Stat label="Outstanding receivables" value={formatCurrencyUSD(a.receivables_outstanding)} />
        {earned && <Stat label="Earned work value" value={formatCurrencyUSD(earned.total)} sub={`Labor ${formatCurrencyUSD(earned.labor)} · received parts ${formatCurrencyUSD(earned.parts_received)} · services ${formatCurrencyUSD(earned.services)}`} />}
        {projected && <Stat label="Projected labor available" value={formatCurrencyUSD(projected.labor)} tone="text-violet-300" sub="Advance billing, optional" />}
        {projected && <Stat label="Unreceived parts" value={formatCurrencyUSD(projected.parts)} tone="text-violet-300" sub="In billing opportunity; advance-billable" />}
      </div>
      {a.revisions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Confirmed amounts</p>
          <ul className="space-y-1">
            {a.revisions.map((r, i) => (
              <li key={r.version} className="text-xs text-gray-400">
                <span className="text-gray-200">{i === 0 ? "Original" : `Revision ${i}`}: {formatCurrencyUSD(r.amount)}</span> · plan v{r.version} · {r.confirmed_by} · {r.saved_at ? new Date(r.saved_at).toLocaleDateString() : ""}{r.note ? ` · ${r.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}