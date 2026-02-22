import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ExternalLink, CreditCard } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * BillingSummaryStrip - Compact billing summary for ProjectSupplyManager
 * 
 * Shows:
 * - Remaining to Bill ($)
 * - Credit Balance ($)
 * - Link to Project Invoices
 * 
 * READ-ONLY - No supply actions
 */
export default function BillingSummaryStrip({ projectId, commitments = [] }) {
  // Fetch credit balance for this project
  const { data: creditData } = useQuery({
    queryKey: ["projectCreditBalance", projectId],
    queryFn: async () => {
      const credits = await base44.entities.ProjectCreditLedger.filter({ project_id: projectId });
      const balance = credits.reduce((sum, c) => sum + (c.remaining_amount ?? 0), 0);
      return { balance, credits };
    },
    enabled: !!projectId,
    staleTime: 30000,
  });

  // Calculate remaining to bill from commitments
  const billingMetrics = React.useMemo(() => {
    let remainingToBillQty = 0;
    let remainingToBillAmount = 0;
    let totalPlannedRetail = 0;
    let totalInvoicedAmount = 0;

    for (const c of commitments) {
      const required = c.required_total ?? c._raw?.required_total ?? 0;
      const invoiced = c.invoiced_qty ?? c._raw?.invoiced_qty ?? 0;
      const unitRetail = c.unit_retail ?? c._raw?.unit_retail_snapshot ?? 0;
      const invoicedAmount = c.invoiced_amount ?? c._raw?.invoiced_amount ?? 0;

      const remainingQty = Math.max(0, required - invoiced);
      remainingToBillQty += remainingQty;
      remainingToBillAmount += remainingQty * unitRetail;
      totalPlannedRetail += required * unitRetail;
      totalInvoicedAmount += invoicedAmount;
    }

    return {
      remainingToBillQty,
      remainingToBillAmount,
      totalPlannedRetail,
      totalInvoicedAmount,
      invoicedPercent: totalPlannedRetail > 0 
        ? Math.round((totalInvoicedAmount / totalPlannedRetail) * 100) 
        : 0,
    };
  }, [commitments]);

  const creditBalance = creditData?.balance ?? 0;

  return (
    <Card className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 border-gray-700">
      <CardContent className="p-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Metrics */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Remaining to Bill */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-600/20 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Remaining to Bill</p>
                <p className="text-lg font-bold text-white font-mono">
                  {formatCurrencyUSD(billingMetrics.remainingToBillAmount)}
                </p>
              </div>
            </div>

            {/* Invoiced Progress */}
            <div className="hidden md:flex items-center gap-2">
              <div className="w-24 h-2 rounded-full bg-gray-700 overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${billingMetrics.invoicedPercent}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{billingMetrics.invoicedPercent}% invoiced</span>
            </div>

            {/* Credit Balance */}
            {creditBalance > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-600/20 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Credit Balance</p>
                  <p className="text-lg font-bold text-green-400 font-mono">
                    {formatCurrencyUSD(creditBalance)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action */}
          <Link to={`${createPageUrl("ProjectInvoices")}?project_id=${projectId}`}>
            <Button variant="outline" size="sm" className="gap-2 border-gray-600 hover:bg-gray-700">
              <ExternalLink className="w-4 h-4" />
              Open Project Invoices
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}