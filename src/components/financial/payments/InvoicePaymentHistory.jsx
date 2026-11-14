import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import PaymentHistoryRow from "./PaymentHistoryRow";
import ReversePaymentDialog from "./ReversePaymentDialog";
import InvoiceCreditsList from "./InvoiceCreditsList";

// Payments (active + reversed) recorded against one invoice, with totals and reversal.
export default function InvoicePaymentHistory({ invoice, onChanged }) {
  const [reversing, setReversing] = useState(null);
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["invoicePayments", invoice?.id],
    queryFn: () => base44.entities.ProjectInvoicePayment.filter({ invoice_id: invoice.id }, "payment_date", 200),
    enabled: !!invoice?.id,
  });
  if (!invoice || invoice.status === "draft" || isLoading) return null;

  const activeC = payments.filter((p) => !p.reversed_at).reduce((s, p) => s + (p.amount_cents || 0), 0);
  const canReverse = ["sent", "partial", "paid"].includes(invoice.status);
  const legacyPaid = invoice.status === "paid" && payments.length === 0;

  const handleReversed = (r) => {
    toast({ title: r.already_reversed ? `This payment was already reversed by ${r.reversed_by_email}.` : `Payment reversed. ${formatCurrencyUSD(r.balance_due)} now due.` });
    onChanged?.();
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-2">Payments</h3>
      <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
        <div className="rounded-lg bg-gray-800/50 p-2"><p className="text-gray-500">Invoice total</p><p className="font-mono text-white">{formatCurrencyUSD(invoice.subtotal ?? invoice.total ?? 0)}</p></div>
        <div className="rounded-lg bg-gray-800/50 p-2"><p className="text-gray-500">Active payments</p><p className="font-mono text-green-400">{formatCurrencyUSD(legacyPaid ? invoice.paid_amount ?? 0 : activeC / 100)}</p></div>
        <div className="rounded-lg bg-gray-800/50 p-2"><p className="text-gray-500">Outstanding</p><p className="font-mono text-amber-300">{formatCurrencyUSD(invoice.status === "cancelled" ? 0 : invoice.balance_due ?? 0)}</p></div>
      </div>
      {legacyPaid ? (
        <p className="text-xs text-gray-500">Marked paid before itemized payments were tracked. No individual payment records exist for this invoice.</p>
      ) : payments.length === 0 ? (
        <p className="text-xs text-gray-500">No payments recorded yet.</p>
      ) : (
        <div className="border border-gray-700 rounded-lg divide-y divide-gray-800">
          {payments.map((p) => <PaymentHistoryRow key={p.id} payment={p} canReverse={canReverse} onReverse={setReversing} />)}
        </div>
      )}
      <InvoiceCreditsList invoice={invoice} />
      <ReversePaymentDialog payment={reversing} onOpenChange={(o) => !o && setReversing(null)} onReversed={handleReversed} />
    </div>
  );
}