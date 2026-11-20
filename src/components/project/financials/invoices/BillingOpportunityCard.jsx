import React from "react";
import { money } from "../finFormat";

const Row = ({ label, value, sub, strong, muted }) => (
  <div className={`flex justify-between gap-3 ${strong ? "text-white font-medium border-t border-gray-800 pt-1.5" : muted ? "text-gray-500" : "text-gray-300"}`}>
    <span className="min-w-0">{label}{sub && <span className="block text-[11px] text-gray-500">{sub}</span>}</span>
    <span className="tabular-nums shrink-0">{value}</span>
  </div>
);

// Breakdown of the canonical billing position. Received / unreceived is purchasing status only;
// both are inside the billing opportunity and each dollar appears once.
export default function BillingOpportunityCard({ p }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-black/40 p-3 text-sm space-y-3">
      <h3 className="text-sm font-semibold text-white">Billing opportunity</h3>
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
        <div className="space-y-1.5">
          <Row label="Received parts" sub="In stock or installed" value={money(p.parts_received)} />
          <Row label="Unreceived parts" sub="Ordered or not yet purchased; can be advance-billed" value={money(p.parts_unreceived)} />
          <Row label="Services" value={money(p.services)} />
          <Row label="Earned labor" sub="Logged billable hours" value={money(p.labor_earned)} />
          <Row label="On draft invoices" value={money(p.on_drafts)} />
          <Row strong label="Not yet invoiced" value={money(p.opportunity)} />
        </div>
        <div className="space-y-1.5">
          <Row label="Already invoiced work" value={money(p.billed_work)} />
          <Row label="Not yet invoiced" value={money(p.opportunity)} />
          <Row label="Projected labor available" sub="Advance billing against task estimates" value={money(p.projected_labor_available)} />
          <Row strong label="Projected total" value={money(p.projected_total)} />
          {p.excluded > 0 && <Row muted label={p.non_billable ? "Excluded: project is Non-Billable" : "Excluded from billing"} value={money(p.excluded)} />}
        </div>
      </div>
    </section>
  );
}