import React from "react";
import { money } from "./finFormat";

// Project Financial Overview: canonical deposit position (same figures as Project Deposits). Funding, not revenue.
export default function DepositPositionLine({ deposits }) {
  const t = deposits?.totals;
  if (!t || !(t.requested || t.received || t.remaining)) return null;
  const items = [
    ["Deposits issued", t.requested], ["Received", t.received], ["Applied", t.applied], ["Refunded", t.refunded],
    ["Available", t.available_to_apply], ["Outstanding project invoices", t.project_invoices_outstanding],
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-emerald-900/30 bg-black/30 px-3 py-2 text-xs">
      <span className="font-semibold uppercase tracking-wide text-gray-500">Client deposits</span>
      {items.map(([l, v]) => <span key={l} className="text-gray-400">{l} <span className="tabular-nums text-white">{money(v)}</span></span>)}
      {t.needs_qb_entry > 0 && <span className="text-amber-300">{t.needs_qb_entry} need QuickBooks entry</span>}
    </div>
  );
}