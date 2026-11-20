import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money } from "@/components/project/financials/finFormat";

const STATUS = { sent: "bg-blue-900/50 text-blue-200", partial: "bg-amber-900/50 text-amber-200", overdue: "bg-red-900/50 text-red-200", paid: "bg-emerald-900/50 text-emerald-200" };

// One row per deposit invoice (the original receipt). Cancelled deposits are history only.
export default function DepositList({ deposits, onRecordPayment, onRefund }) {
  if (!deposits.length) return <p className="text-sm text-gray-500">No deposits recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500">
          <th className="py-1 pr-3">QuickBooks invoice</th><th className="pr-3">Status</th><th className="pr-3 text-right">Invoiced</th>
          <th className="pr-3 text-right">Received</th><th className="pr-3 text-right">Applied</th><th className="pr-3 text-right">Remaining</th><th />
        </tr></thead>
        <tbody>{deposits.map((d) => (
          <tr key={d.invoice_id} className="border-t border-gray-800">
            <td className="py-2 pr-3 text-white">{d.qb_invoice_number || "No number"}{d.recorded_from_quickbooks && <span className="ml-2 text-[11px] text-gray-500">recorded from QuickBooks</span>}</td>
            <td className="pr-3"><Badge className={STATUS[d.status] || "bg-gray-800 text-gray-400"}>{d.status}</Badge></td>
            <td className="pr-3 text-right tabular-nums text-gray-300">{money(d.invoiced)}</td>
            <td className="pr-3 text-right tabular-nums text-emerald-300">{money(d.received)}</td>
            <td className="pr-3 text-right tabular-nums text-blue-300">{money(d.applied)}{d.refunded > 0 && <div className="text-[11px] text-red-300">{money(d.refunded)} refunded</div>}</td>
            <td className="pr-3 text-right tabular-nums text-amber-300">{money(d.remaining)}</td>
            <td className="py-1 text-right whitespace-nowrap">
              {["sent", "partial", "overdue"].includes(d.status) && <Button size="sm" variant="outline" className="h-7 mr-1" onClick={() => onRecordPayment(d)}>Record payment</Button>}
              {d.remaining > 0 && <Button size="sm" variant="ghost" className="h-7 text-red-300" onClick={() => onRefund(d)}>Refund</Button>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}