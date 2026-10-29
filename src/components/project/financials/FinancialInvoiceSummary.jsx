import React from "react";
import { money } from "./finFormat";

const LABELS = { draft: "Draft", sent: "Sent", paid: "Paid", cancelled: "Cancelled" };

export default function FinancialInvoiceSummary({ invoices, summary }) {
  const { by_status, line_split } = invoices;
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 text-sm">
      <div className="font-medium text-white mb-2">Invoices (historical)</div>
      <div className="space-y-1">
        {Object.entries(LABELS).map(([k, label]) => (
          <div key={k} className="flex justify-between text-gray-300">
            <span>{label} <span className="text-gray-500">({by_status[k].count})</span></span>
            <span className="tabular-nums">{money(by_status[k].total)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-800 mt-2 pt-2 space-y-1 text-gray-400">
        <div className="flex justify-between"><span>Finalized — parts / services</span><span className="tabular-nums">{money(line_split.final.part)} / {money(line_split.final.service)}</span></div>
        <div className="flex justify-between"><span>Draft — parts / services</span><span className="tabular-nums">{money(line_split.draft.part)} / {money(line_split.draft.service)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span className="tabular-nums">{money(summary.paid_amount)}</span></div>
        <div className="flex justify-between"><span>Credits applied</span><span className="tabular-nums">{money(summary.credits_applied)}</span></div>
        <div className="flex justify-between text-white"><span>Outstanding</span><span className="tabular-nums">{money(summary.outstanding_balance)}</span></div>
      </div>
    </div>
  );
}