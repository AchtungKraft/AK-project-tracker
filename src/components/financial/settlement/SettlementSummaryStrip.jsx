import React from "react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

function Stat({ label, value, note, className }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className={`text-base font-bold ${className}`}>{formatCurrencyUSD(value || 0)}</p>
      {note && <p className="text-[10px] text-gray-500">{note}</p>}
    </div>
  );
}

export default function SettlementSummaryStrip({ summary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
      <Stat label="General credit available" value={summary.credit_available} className="text-green-400"
        note={(summary.credit_reserved_by_drafts || 0) > 0 ? `${formatCurrencyUSD(summary.credit_reserved_by_drafts)} held for drafts` : "Deposit credit excluded"} />
      <Stat label="Parts on drafts" value={summary.total_on_drafts} className="text-amber-300" note={`Invoiced ${formatCurrencyUSD(summary.total_invoiced || 0)}`} />
      <Stat label="Eligible to settle" value={summary.total_eligible} className="text-blue-300" />
      <Stat label="Will apply" value={summary.credit_to_apply} className="text-emerald-400" />
    </div>
  );
}