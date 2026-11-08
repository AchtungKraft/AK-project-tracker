import React from "react";
import { money } from "../finFormat";
import { cents } from "./fundingFormat";

const Card = ({ label, value, sub, tone = "text-white" }) => (
  <div className="rounded-md bg-gray-900/60 border border-gray-800 px-3 py-2 min-w-0">
    <div className="text-[11px] text-gray-400">{label}</div>
    <div className={`text-sm font-semibold ${tone} truncate`}>{value}</div>
    {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
  </div>
);

// Planned (draft) funding and canonical invoice/payment figures — always separate, never summed.
export default function FundingMetrics({ plan, actuals }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <Card label="Planned funding (draft)" value={cents(plan?.total_planned_cents ?? 0)} sub="Plan only · not cash" tone="text-violet-300" />
      <Card label="Funding requested" value={money(0)} sub="None · billing not enabled" tone="text-gray-300" />
      <Card label="Invoiced (project)" value={money(actuals.invoiced_total)} sub={`${actuals.live_invoices} sent/paid invoice(s)`} />
      <Card label="Received (project)" value={money(actuals.received_total)} sub="Payments recorded" tone="text-emerald-300" />
      <Card label="Draft invoices" value={money(actuals.draft_total)} sub={`${actuals.draft_invoices} draft(s) · not sent`} tone="text-gray-300" />
    </div>
  );
}