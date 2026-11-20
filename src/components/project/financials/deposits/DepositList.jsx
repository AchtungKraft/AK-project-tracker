import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money } from "@/components/project/financials/finFormat";
import QbStatusBadge from "./QbStatusBadge";

const STATUS = { sent: "bg-blue-900/50 text-blue-200", partial: "bg-amber-900/50 text-amber-200", overdue: "bg-red-900/50 text-red-200", paid: "bg-emerald-900/50 text-emerald-200" };
const ORIGIN = { quickbooks_existing: "Recorded from QuickBooks", ak_projects: "Created in AK PROJECTS" };

// One row per deposit invoice (the original receipt). Cancelled deposits are history only.
export default function DepositList({ deposits, onRecordPayment, onRefund, onQb, onCorrect }) {
  if (!deposits.length) return <p className="text-sm text-gray-500">No deposits recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500">
          <th className="py-1 pr-3">Deposit invoice</th><th className="pr-3">Status</th><th className="pr-3 text-right">Invoiced</th>
          <th className="pr-3 text-right">Received</th><th className="pr-3 text-right">Applied</th><th className="pr-3 text-right">Remaining</th><th />
        </tr></thead>
        <tbody>{deposits.map((d) => (
          <tr key={d.invoice_id} className="border-t border-gray-800 align-top">
            <td className="py-2 pr-3">
              <div className="text-white">{d.qb_invoice_number || "No number"}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
                <span>{ORIGIN[d.origin]}{d.qb_export_status === "exported" ? " · exported" : d.qb_export_status === "linked" ? ` · linked${d.qb_link_reference ? ` (${d.qb_link_reference})` : ""}` : ""}</span>
                {d.status !== "cancelled" && <QbStatusBadge status={d.qb_status} reference={d.qb_reference} />}
              </div>
            </td>
            <td className="pr-3 pt-2"><Badge className={STATUS[d.status] || "bg-gray-800 text-gray-400"}>{d.status}</Badge></td>
            <td className="pr-3 pt-2 text-right tabular-nums text-gray-300">{money(d.invoiced)}</td>
            <td className="pr-3 pt-2 text-right tabular-nums text-emerald-300">{money(d.received)}{d.payment_count > 1 && <div className="text-[11px] text-gray-500">{d.payment_count} payments</div>}</td>
            <td className="pr-3 pt-2 text-right tabular-nums text-blue-300">{money(d.applied)}{d.refunded > 0 && <div className="text-[11px] text-red-300">{money(d.refunded)} refunded</div>}</td>
            <td className="pr-3 pt-2 text-right tabular-nums text-amber-300">{money(d.remaining)}</td>
            <td className="py-1 text-right">
              <div className="flex flex-wrap justify-end gap-1">
                {["sent", "partial", "overdue"].includes(d.status) && <Button size="sm" variant="outline" className="h-7" onClick={() => onRecordPayment(d)}>Record payment</Button>}
                {d.remaining > 0 && <Button size="sm" variant="ghost" className="h-7 text-red-300" onClick={() => onRefund(d)}>Refund</Button>}
                {d.export_eligible && <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => onQb({ mode: "link", invoice_id: d.invoice_id, title: `Deposit invoice ${d.qb_invoice_number || ""} · ${money(d.invoiced)}` })}>Already in QuickBooks</Button>}
                {d.origin !== "quickbooks_existing" && ["exported", "linked"].includes(d.qb_export_status) && <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => onCorrect({ status: d.qb_export_status, invoice_id: d.invoice_id, confirm_value: d.qb_invoice_number || d.invoice_id, title: `Deposit invoice ${d.qb_invoice_number || ""} · ${money(d.invoiced)}` })}>Correct {d.qb_export_status}</Button>}
                {d.qb_status === "reconciled" && <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => onCorrect({ status: "reconciled", ref: d.qb_ref, confirm_value: d.qb_reference, title: `Deposit invoice ${d.qb_invoice_number || ""} · ${money(d.invoiced)}` })}>Correct reconciliation</Button>}
                {d.status !== "cancelled" && d.qb_status !== "reconciled" && <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => onQb({ mode: "reconcile", ref: d.qb_ref, title: `Deposit invoice ${d.qb_invoice_number || ""} · ${money(d.invoiced)}` })}>Mark reconciled</Button>}
              </div>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}