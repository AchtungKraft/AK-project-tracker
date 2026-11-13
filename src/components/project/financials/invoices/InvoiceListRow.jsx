import React from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { money } from "../finFormat";

const STATUS_STYLE = {
  draft: "bg-gray-700 text-gray-200",
  sent: "bg-blue-900/60 text-blue-200",
  partial: "bg-amber-900/60 text-amber-200",
  overdue: "bg-red-900/60 text-red-200",
  paid: "bg-emerald-900/60 text-emerald-200",
  cancelled: "bg-gray-800 text-gray-400",
  void: "bg-gray-800 text-gray-400",
};

// One invoice row; opens the existing invoice detail panel.
export default function InvoiceListRow({ invoice, onOpen }) {
  const isOpen = ["sent", "partial", "overdue"].includes(invoice.status);
  const balance = Math.max(0, (invoice.total ?? invoice.subtotal ?? 0) - (invoice.paid_amount ?? 0));
  return (
    <button
      onClick={() => onOpen(invoice.id)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-800/60 border-b border-gray-800 last:border-0"
    >
      <Badge className={`${STATUS_STYLE[invoice.status] || STATUS_STYLE.draft} capitalize shrink-0`}>{invoice.status}</Badge>
      <div className="min-w-0 flex-1">
        <div className="text-white truncate capitalize">
          {invoice.invoice_type} invoice{invoice.qb_invoice_number ? ` · QB #${invoice.qb_invoice_number}` : ""}
        </div>
        <div className="text-xs text-gray-500">
          {invoice.line_count} line(s){invoice.issue_date ? ` · issued ${invoice.issue_date}` : ""}{invoice.due_date ? ` · due ${invoice.due_date}` : ""}
          {invoice.flags?.overdue && <span className="text-red-400"> · overdue</span>}
          {invoice.flags?.missing_qb_fields && <span className="text-amber-400"> · missing QB info</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="tabular-nums text-white">{money(invoice.total ?? invoice.subtotal ?? 0)}</div>
        {isOpen && <div className="text-xs tabular-nums text-amber-300">{money(balance)} due</div>}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
    </button>
  );
}