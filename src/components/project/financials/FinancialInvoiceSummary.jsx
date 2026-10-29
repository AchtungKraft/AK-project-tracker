import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { money } from "./finFormat";

const LABELS = { draft: "Draft", sent: "Sent", paid: "Paid", cancelled: "Cancelled" };

// Compact historical invoice summary; line split behind a toggle.
export default function FinancialInvoiceSummary({ invoices, summary }) {
  const [open, setOpen] = useState(false);
  const { by_status, line_split } = invoices;
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium text-white">Invoices (historical)</span>
        {Object.entries(LABELS).map(([k, label]) => (
          <span key={k} className="text-gray-300 text-xs">{label} ({by_status[k].count}) <span className="tabular-nums text-white">{money(by_status[k].total)}</span></span>
        ))}
        <button onClick={() => setOpen((o) => !o)} className="ml-auto flex items-center text-xs text-gray-500 hover:text-gray-300">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Details
        </button>
      </div>
      {open && (
        <div className="border-t border-gray-800 mt-2 pt-2 grid md:grid-cols-2 gap-x-6 gap-y-1 text-gray-400">
          <div className="flex justify-between"><span>Finalized — parts / services</span><span className="tabular-nums">{money(line_split.final.part)} / {money(line_split.final.service)}</span></div>
          <div className="flex justify-between"><span>Draft — parts / services</span><span className="tabular-nums">{money(line_split.draft.part)} / {money(line_split.draft.service)}</span></div>
          <div className="flex justify-between"><span>Paid</span><span className="tabular-nums">{money(summary.paid_amount)}</span></div>
          <div className="flex justify-between"><span>Credits applied</span><span className="tabular-nums">{money(summary.credits_applied)}</span></div>
          <div className="flex justify-between text-white"><span>Outstanding</span><span className="tabular-nums">{money(summary.outstanding_balance)}</span></div>
        </div>
      )}
    </div>
  );
}