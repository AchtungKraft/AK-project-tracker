import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Wallet, Clock, CalendarRange } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const Line = ({ label, value, muted }) => (
  <div className="flex justify-between gap-3 text-xs">
    <span className={muted ? "text-gray-500" : "text-gray-400"}>{label}</span>
    <span className="font-mono text-gray-200">{formatCurrencyUSD(value || 0)}</span>
  </div>
);

// Portfolio money not yet collected. Future scope is shown apart and never added to the total.
export default function OpenDollarsSummary({ totals }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <Card className="bg-emerald-900/20 border-emerald-800/50">
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400" /><span className="text-xs text-gray-400 uppercase">Total Open Dollars</span></div>
          <p className="text-2xl font-bold text-emerald-300">{formatCurrencyUSD(totals.total_open)}</p>
          <p className="text-xs text-gray-500">Unbilled value + outstanding invoices</p>
        </CardContent>
      </Card>
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-4 space-y-1.5">
          <div className="flex items-center gap-2"><Wallet className="w-4 h-4 text-red-400" /><span className="text-xs text-gray-400 uppercase">Unbilled Project Value</span></div>
          <p className="text-xl font-bold text-white">{formatCurrencyUSD(totals.unbilled_total)}</p>
          <Line label="Parts" value={totals.unbilled_parts} />
          <Line label="Services" value={totals.unbilled_services} />
          <Line label="Earned labor" value={totals.unbilled_labor} />
          <Line label="Of which on drafts" value={totals.on_drafts} muted />
        </CardContent>
      </Card>
      <Card className="bg-purple-900/20 border-purple-800/50">
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-purple-400" /><span className="text-xs text-gray-400 uppercase">Outstanding Invoiced</span></div>
          <p className="text-xl font-bold text-purple-300">{formatCurrencyUSD(totals.outstanding)}</p>
          <p className="text-xs text-gray-500">Balance due on sent and partially paid invoices</p>
        </CardContent>
      </Card>
      <Card className="bg-gray-900/30 border-dashed border-gray-700">
        <CardContent className="p-4 space-y-1.5">
          <div className="flex items-center gap-2"><CalendarRange className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-400 uppercase">Future (not included)</span></div>
          <Line label="Confirmed scope budgets" value={totals.future_agreed_budget} />
          <Line label="Projected remaining labor" value={totals.future_projected_labor} />
          <p className="text-[11px] text-gray-500">Estimates only, not earned or open.</p>
        </CardContent>
      </Card>
    </div>
  );
}