import React from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { base44 } from "@/api/base44Client";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

// Read-only list of payments recorded against one invoice.
export default function InvoicePaymentHistory({ invoiceId }) {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["invoicePayments", invoiceId],
    queryFn: () => base44.entities.ProjectInvoicePayment.filter({ invoice_id: invoiceId }, "payment_date", 200),
    enabled: !!invoiceId,
  });
  if (isLoading || payments.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-2">Payments received</h3>
      <div className="border border-gray-700 rounded-lg divide-y divide-gray-800">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="text-gray-300 w-24 shrink-0">{format(parseISO(p.payment_date), "MMM d, yyyy")}</span>
            <span className="flex-1 min-w-0 truncate text-gray-400">
              <span className="uppercase text-xs">{p.method}</span>{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}
            </span>
            <span className="font-mono text-green-400">{formatCurrencyUSD(p.amount_cents / 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}