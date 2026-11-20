import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const Line = ({ label, value, tone = "text-gray-300" }) => (
  <div className="flex justify-between text-sm"><span className="text-gray-400">{label}</span><span className={`font-mono ${tone}`}>{value}</span></div>
);

// Shown before sending a draft: the credit it will deduct, by kind, and the balance the client will owe.
// Older drafts (created before credit kinds were separated) keep their original behavior and say so.
export default function SendCreditSummary({ invoice }) {
  const [avail, setAvail] = useState(null);
  const split = invoice?.credit_selection_mode === "split";
  const dep = split ? invoice.credit_proposed_deposit || 0 : 0;
  const gen = split ? invoice.credit_proposed_general || 0 : 0;
  const total = invoice?.credit_proposed || 0;

  useEffect(() => {
    if (!invoice?.project_id) return;
    base44.functions.invoke("projectDepositAction", { action: "credit_availability", project_id: invoice.project_id, exclude_invoice_id: invoice.id })
      .then((r) => setAvail(r.data?.success ? r.data : null)).catch(() => setAvail(null));
  }, [invoice?.id, invoice?.project_id]);

  const short = split && avail && (dep > avail.deposit_balance + 0.005 || gen > avail.general_balance + 0.005);
  return (
    <div className="space-y-1.5 rounded-lg bg-gray-800/50 p-3">
      <Line label="Invoice subtotal" value={formatCurrencyUSD(invoice?.subtotal || 0)} tone="text-white" />
      {avail && <Line label="Available deposit credit" value={formatCurrencyUSD(avail.deposit_balance)} />}
      {avail && <Line label="Available general project credit" value={formatCurrencyUSD(avail.general_balance)} />}
      {split ? (<>
        <Line label="Deposit credit to apply" value={`-${formatCurrencyUSD(dep)}`} tone="text-amber-300" />
        <Line label="General credit to apply" value={`-${formatCurrencyUSD(gen)}`} tone="text-sky-300" />
      </>) : total > 0 ? (
        <Line label="Credit to apply (older draft: any credit, oldest first)" value={`-${formatCurrencyUSD(total)}`} tone="text-green-400" />
      ) : <Line label="Credit to apply" value="None" />}
      <div className="border-t border-gray-700 pt-1.5"><Line label="Remaining balance" value={formatCurrencyUSD(Math.max(0, (invoice?.subtotal || 0) - total))} tone="text-white font-semibold" /></div>
      {short && <p className="flex items-center gap-1 text-xs text-amber-300"><AlertTriangle className="h-3 w-3" />Less credit of the selected kind remains than this draft reserved. Only what exists will be applied; the client owes the rest.</p>}
    </div>
  );
}