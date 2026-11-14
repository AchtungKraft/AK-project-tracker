import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

// Client credits tied to this invoice: credit applied when sent, and credits it created.
export default function InvoiceCreditsList({ invoice }) {
  const { data: credits = [] } = useQuery({
    queryKey: ["invoiceCredits", invoice.id],
    queryFn: () => base44.entities.ProjectCreditLedger.filter({ source_invoice_id: invoice.id }, "-created_date", 50),
  });
  const applied = invoice.credit_applied || 0;
  if (!applied && credits.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="text-xs font-medium text-gray-400 mb-1">Client credits</h4>
      <div className="space-y-1 text-xs">
        {applied > 0 && (
          <div className="flex justify-between text-gray-400"><span>Credit applied to this invoice when sent</span><span className="font-mono text-green-400">-{formatCurrencyUSD(applied)}</span></div>
        )}
        {credits.map((c) => (
          <div key={c.id} className="flex justify-between gap-3 text-gray-400">
            <span className="min-w-0 truncate" title={c.notes}>
              {c.reversed_from_invoice_id ? "Returned when invoice was cancelled" : "Created by this invoice's payments"}
            </span>
            <span className="font-mono shrink-0">
              {formatCurrencyUSD(c.credit_amount || 0)} <span className="text-gray-500">({formatCurrencyUSD(c.remaining_amount || 0)} unused)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}