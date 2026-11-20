import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Clock, DollarSign, CalendarRange, TrendingUp } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const Line = ({ label, value, muted }) => (
  <div className="flex justify-between gap-3 text-xs">
    <span className={muted ? "text-gray-500" : "text-gray-400"}>{label}</span>
    <span className="font-mono text-gray-200 shrink-0">{formatCurrencyUSD(value || 0)}</span>
  </div>
);

const Box = ({ icon: Icon, iconTone, title, value, valueTone = "text-white", className = "bg-gray-900/50 border-gray-700", children }) => (
  <Card className={className}>
    <CardContent className="p-4 space-y-1.5">
      <div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${iconTone}`} /><span className="text-xs text-gray-400 uppercase">{title}</span></div>
      <p className={`text-xl font-bold ${valueTone}`}>{formatCurrencyUSD(value)}</p>
      {children}
    </CardContent>
  </Card>
);

// Five figures, each dollar counted once: 1 + 2 = 3, 3 + 4 = 5. Client budgets are shown in their own section.
export default function OpenDollarsSummary({ totals: t }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      <Box icon={Wallet} iconTone="text-red-400" title="1. Current unbilled" value={t.unbilled_total}>
        <Line label="Received parts" value={t.unbilled_parts_received} />
        <Line label="Unreceived parts" value={t.unbilled_parts_unreceived} />
        <Line label="Services" value={t.unbilled_services} />
        <Line label="Earned labor" value={t.unbilled_labor} />
        <Line label="Of which on drafts" value={t.on_drafts} muted />
      </Box>
      <Box icon={Clock} iconTone="text-purple-400" title="2. Outstanding invoiced" value={t.outstanding} valueTone="text-purple-300" className="bg-purple-900/20 border-purple-800/50">
        <p className="text-xs text-gray-500">Balance due on sent, partially paid and overdue invoices</p>
        {t.overdue_count > 0 && <p className="text-xs text-red-400">{t.overdue_count} overdue · {formatCurrencyUSD(t.overdue)}</p>}
      </Box>
      <Box icon={DollarSign} iconTone="text-emerald-400" title="3. Total open dollars" value={t.total_open} valueTone="text-emerald-300" className="bg-emerald-900/20 border-emerald-800/50">
        <p className="text-xs text-gray-500">1 + 2</p>
      </Box>
      <Box icon={CalendarRange} iconTone="text-violet-400" title="4. Additional projected work" value={t.additional_projected} valueTone="text-violet-300" className="bg-gray-900/30 border-dashed border-gray-700">
        <Line label="Advance labor on drafts" value={t.projected_on_drafts} />
        <Line label="Projected labor within budget" value={t.projected_within_budget} />
        <Line label="Beyond confirmed budget" value={t.projected_beyond_budget} />
        <Line label="Awaiting client budget" value={t.projected_no_budget} />
        {t.projected_invoiced_unearned > 0 && <Line label="Billed in advance, not yet earned (in 2 or paid)" value={t.projected_invoiced_unearned} muted />}
        {t.unpriced_projected_hours > 0 && <p className="text-[11px] text-amber-400">{t.unpriced_projected_hours}h estimated without a rate (not counted)</p>}
      </Box>
      <Box icon={TrendingUp} iconTone="text-sky-400" title="5. Total expected billing" value={t.expected_total} valueTone="text-sky-300" className="bg-sky-900/20 border-sky-800/50">
        <p className="text-xs text-gray-500">3 + 4 · estimates, not earned</p>
      </Box>
    </div>
  );
}