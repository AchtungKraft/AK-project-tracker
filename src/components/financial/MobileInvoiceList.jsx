import React from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import InvoiceRowActions from "@/components/financial/InvoiceRowActions";

// Mobile card list for the Project Invoices page, with the same row actions as the desktop table.
export default function MobileInvoiceList({ invoices, onOpen, onChanged }) {
  if (!invoices.length) return <p className="text-center py-8 text-gray-500">No invoices in this tab</p>;
  return (
    <div className="space-y-2">
      {invoices.map((inv) => (
        <div key={inv.id} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{inv.project_name}</p>
              {inv.client_name && <p className="text-xs text-gray-500 truncate">{inv.client_name}</p>}
            </div>
            <Badge className="bg-gray-700 text-gray-200 capitalize shrink-0">{inv.status}</Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400 capitalize">{inv.invoice_type}{inv.qb_invoice_number ? ` · ${inv.qb_invoice_number}` : ""}</span>
            <span className="font-mono text-white">{formatCurrencyUSD(inv.balance_due ?? inv.subtotal ?? 0)}</span>
          </div>
          <InvoiceRowActions invoice={inv} onOpen={() => onOpen(inv.id)} onDeleted={onChanged} />
        </div>
      ))}
    </div>
  );
}