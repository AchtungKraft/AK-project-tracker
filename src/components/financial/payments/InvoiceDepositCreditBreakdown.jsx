import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

// Deposit credit on an issued invoice, split by when it was applied.
// At send: the invoice's canonical credit_applied_deposit (set by markInvoiceSent).
// After send: net of the deposit journal's Apply Available Deposit entries for this invoice
// (apply minus apply_reversal; send:/cancel: entries are system entries and excluded).
const SYSTEM = /^(send|cancel):/;

export default function InvoiceDepositCreditBreakdown({ invoice }) {
  const { data: txs = [] } = useQuery({
    queryKey: ["invoiceDepositTxs", invoice.id, invoice.updated_date],
    queryFn: () => base44.entities.DepositTransaction.filter({ target_invoice_id: invoice.id }, "recorded_at", 200),
  });
  const atSendC = Math.round((invoice.credit_applied_deposit || 0) * 100);
  const afterC = txs.filter((t) => !SYSTEM.test(String(t.application_id))).reduce((s, t) =>
    s + (t.type === "apply" ? t.amount_cents : t.type === "apply_reversal" ? -t.amount_cents : 0), 0);
  const generalC = Math.round((invoice.credit_applied_general || 0) * 100);
  if (!atSendC && !afterC && !generalC) return null;
  const Row = ({ label, cents, strong }) => (
    <div className={`flex justify-between gap-3 text-xs ${strong ? "text-gray-300 font-medium" : "text-gray-500"}`}>
      <span>{label}</span><span className="font-mono shrink-0">{formatCurrencyUSD(cents / 100)}</span>
    </div>
  );
  return (
    <div className="space-y-0.5 pl-3 border-l border-gray-700">
      <Row label="Deposit credit applied at send" cents={atSendC} />
      <Row label="Deposit credit applied after send" cents={afterC} />
      <Row label="Total deposit credit applied" cents={atSendC + afterC} strong />
      {generalC > 0 && <Row label="General credit applied at send" cents={generalC} />}
    </div>
  );
}