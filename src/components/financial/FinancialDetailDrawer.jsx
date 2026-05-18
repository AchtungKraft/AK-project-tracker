import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * Progressive disclosure drawer for advanced financial details.
 * Level 1: Cost waterfalls
 * Level 2: Truth tables + reconciliation
 * Level 3: Revenue reconciliation + diagnostics
 */
function WaterfallBar({ segments, total }) {
  if (total <= 0) return <p className="text-xs text-gray-600 italic">No cost data</p>;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className={cn(seg.color, "transition-all")} style={{ width: `${Math.max(1, (seg.value / total) * 100)}%` }} title={`${seg.label}: ${formatCurrencyUSD(seg.value)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-1.5">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", seg.color)} />
            <span className="text-[10px] text-gray-500">{seg.label}</span>
            <span className="text-[10px] text-gray-400 font-mono">{formatCurrencyUSD(seg.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReconRow({ label, value, color = "text-gray-300", bold = false, border = false, indent = false }) {
  return (
    <>
      <span className={cn(
        "text-gray-500",
        bold && "font-semibold",
        border && "border-t border-gray-800 pt-1 mt-1",
        indent && "pl-2"
      )}>{label}</span>
      <span className={cn(
        "text-right font-mono",
        color,
        bold && "font-semibold",
        border && "border-t border-gray-800 pt-1 mt-1"
      )}>{formatCurrencyUSD(value)}</span>
    </>
  );
}

export default function FinancialDetailDrawer({ fin, warnings }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const hasServices = fin.services.plannedCost > 0;
  const projColor = fin.totals.projectedMargin >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDetails(!showDetails)}
        className="text-gray-500 hover:text-gray-300 text-xs gap-1.5 h-7"
      >
        {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showDetails ? "Hide" : "Show"} Financial Details
      </Button>

      {showDetails && (
        <Card className="bg-black/30 border-gray-800">
          <CardContent className="p-4 space-y-4">
            {/* Cost Waterfalls */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Parts Cost Breakdown</p>
              <WaterfallBar
                segments={[
                  { label: "Installed", value: fin.parts.costInstalled, color: "bg-emerald-600" },
                  { label: "Received", value: fin.parts.costReceived, color: "bg-blue-600" },
                  { label: "On PO", value: fin.parts.costOnPO, color: "bg-yellow-600" },
                  { label: "Unordered", value: fin.parts.costUnordered, color: "bg-gray-600" },
                ]}
                total={fin.parts.plannedCost}
              />
            </div>

            {hasServices && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Services Cost Breakdown</p>
                <WaterfallBar
                  segments={[
                    { label: "Billed", value: fin.services.costBilled, color: "bg-emerald-600" },
                    { label: "Completed", value: fin.services.costCompleted, color: "bg-blue-600" },
                    { label: "Ordered", value: fin.services.costOrdered, color: "bg-yellow-600" },
                    { label: "Planned", value: fin.services.costPlannedOnly, color: "bg-gray-600" },
                  ]}
                  total={fin.services.plannedCost}
                />
              </div>
            )}

            {/* Cost Truth Table */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Cost Summary</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-1 pr-4">Category</th>
                      <th className="text-right py-1 px-2">Planned</th>
                      <th className="text-right py-1 px-2">On Order</th>
                      <th className="text-right py-1 px-2">Spent</th>
                      <th className="text-right py-1 pl-2">Unordered</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr className="border-b border-gray-800/50">
                      <td className="py-1 pr-4">Parts</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.parts.plannedCost)}</td>
                      <td className="text-right py-1 px-2 text-yellow-400">{formatCurrencyUSD(fin.parts.costOnPO)}</td>
                      <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.parts.actualSpend)}</td>
                      <td className="text-right py-1 pl-2 text-amber-400">{formatCurrencyUSD(fin.parts.costUnordered)}</td>
                    </tr>
                    {hasServices && (
                      <tr className="border-b border-gray-800/50">
                        <td className="py-1 pr-4">Services</td>
                        <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.services.plannedCost)}</td>
                        <td className="text-right py-1 px-2 text-yellow-400">{formatCurrencyUSD(fin.services.costOrdered)}</td>
                        <td className="text-right py-1 px-2">{formatCurrencyUSD(fin.services.actualCost)}</td>
                        <td className="text-right py-1 pl-2 text-amber-400">{formatCurrencyUSD(fin.services.costPlannedOnly)}</td>
                      </tr>
                    )}
                    <tr className="font-semibold text-white">
                      <td className="py-1 pr-4 border-t border-gray-700">Total</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700">{formatCurrencyUSD(fin.totals.plannedCost)}</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700 text-yellow-400">{formatCurrencyUSD(fin.exposure.ordered)}</td>
                      <td className="text-right py-1 px-2 border-t border-gray-700">{formatCurrencyUSD(fin.totals.actualSpend)}</td>
                      <td className="text-right py-1 pl-2 border-t border-gray-700 text-amber-400">{formatCurrencyUSD(fin.exposure.planned)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Diagnostics Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-gray-600 hover:text-gray-400 text-[10px] gap-1 h-6"
            >
              {showDiagnostics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Diagnostics
            </Button>

            {showDiagnostics && (
              <div className="space-y-4 border-t border-gray-800 pt-3">
                {/* Cost Reconciliation */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Cost Reconciliation</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                    <ReconRow label="Actual Spend" value={fin.totals.actualSpend} />
                    <ReconRow label="+ Pending Orders" value={fin.exposure.ordered} color="text-yellow-400" indent />
                    <ReconRow label="+ Unordered" value={fin.exposure.planned} color="text-amber-400" indent />
                    <ReconRow label="= Total Planned Cost" value={fin.totals.plannedCost} color="text-white" bold border />
                    {fin._reconciliation.totalBucketCheck > 0.01 && (
                      <ReconRow label="⚠ Drift" value={fin._reconciliation.totalBucketCheck} color="text-red-400" />
                    )}
                  </div>
                </div>

                {/* Revenue Reconciliation */}
                {fin._reconciliation?.revenue && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Revenue Reconciliation</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                      <ReconRow label="Parts Revenue (rows)" value={fin._reconciliation.revenue.partsRevenueLocal} />
                      <ReconRow label="+ Services Revenue" value={fin._reconciliation.revenue.servicesRevenueLocal} color="text-blue-400" indent />
                      <ReconRow label="= Total Revenue" value={fin._reconciliation.revenue.totalRevenueLocal} color="text-white" bold border />
                      <ReconRow label="Backend Total" value={fin._reconciliation.revenue.backendTotalPlannedRetail} color="text-gray-500" />
                      {fin._reconciliation.revenue.totalRevenueDrift > 1 ? (
                        <ReconRow
                          label={fin._reconciliation.revenue.doubleCountDetected ? "🚨 Double-Count" : "⚠ Drift"}
                          value={fin._reconciliation.revenue.totalRevenueDrift}
                          color={fin._reconciliation.revenue.doubleCountDetected ? "text-red-400" : "text-amber-400"}
                        />
                      ) : (
                        <>
                          <span className="text-emerald-600">✓ Reconciled</span>
                          <span className="text-emerald-600 text-right">Match</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Margin Reconciliation */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Margin Reconciliation</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                    <ReconRow label="Planned Revenue" value={fin.revenue.planned} color="text-blue-400" />
                    <ReconRow label="− Planned Cost" value={fin.totals.plannedCost} />
                    <ReconRow label="= Projected Margin" value={fin.totals.projectedMargin} color={projColor} bold border />
                  </div>
                </div>

                {/* Validation Warnings */}
                {warnings.length > 0 && (
                  <div>
                    <p className="text-[10px] text-red-400 uppercase tracking-widest font-semibold mb-2">Validation Warnings</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {warnings.map((w, i) => (
                        <p key={i} className={cn("text-[10px]",
                          w.level === "error" ? "text-red-400" : w.level === "warn" ? "text-amber-400" : "text-gray-500"
                        )}>• {w.msg}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}