import React from "react";
import { Button } from "@/components/ui/button";
import { money } from "@/components/project/financials/finFormat";
import QbStatusBadge from "./QbStatusBadge";

const KIND = {
  received: "Payment received", received_reversed: "Payment reversed", register_existing: "Recorded from QuickBooks",
  apply: "Applied to invoice", apply_reversal: "Application reversed", applied_at_send: "Applied when invoice was sent",
  restored_on_cancel: "Returned to deposit (invoice cancelled)", refund: "Refunded to client", refund_reversal: "Refund reversed",
};

// Complete, append-only trail: receipts, applications, refunds and their corrective entries, with QuickBooks status.
export default function DepositHistory({ history, onReverse, onQb, onCorrect }) {
  if (!history.length) return <p className="text-sm text-gray-500">No deposit activity yet.</p>;
  return (
    <div className="max-h-96 overflow-y-auto divide-y divide-gray-800 text-sm">
      {history.map((h) => (
        <div key={h.key} className="flex items-start gap-3 py-2">
          <div className="w-24 shrink-0 text-xs text-gray-500">{h.date || "—"}</div>
          <div className="min-w-0 flex-1">
            <div className="text-white">{KIND[h.kind] || h.kind}{h.invoice && <span className="text-gray-400"> · invoice {h.invoice}</span>}{h.invoice_status === "cancelled" && h.kind !== "restored_on_cancel" && <span className="text-gray-500"> (cancelled)</span>}</div>
            <div className="truncate text-xs text-gray-500">{[h.deposit && `Deposit ${h.deposit}`, h.detail, h.actor].filter(Boolean).join(" · ")}</div>
            <div className="mt-1"><QbStatusBadge status={h.qb_status} reference={h.qb_reference} /></div>
          </div>
          <div className={`tabular-nums ${h.amount < 0 ? "text-blue-300" : "text-emerald-300"}`}>{money(h.amount)}</div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {h.reversible && <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => onReverse(h)}>Reverse</Button>}
            {h.qb_status === "reconciled" && h.qb_ref && <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => onCorrect({ status: "reconciled", ref: h.qb_ref, confirm_value: h.qb_reference, title: `${KIND[h.kind] || h.kind} · ${money(h.amount)}${h.invoice ? ` · invoice ${h.invoice}` : ""}` })}>Correct</Button>}
            {h.qb_status === "needs_manual_entry" && <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => onQb({ mode: "reconcile", ref: h.qb_ref, title: `${KIND[h.kind] || h.kind} · ${money(h.amount)}${h.invoice ? ` · invoice ${h.invoice}` : ""}` })}>Mark reconciled</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}