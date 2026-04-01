import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PricingIntegrityMonitor - Detects and displays pricing issues
 * 
 * Checks:
 * - PO lines with unit_cost = 0
 * - Commitments with cost mismatch vs PO lines
 * - Commitments with missing cost/retail
 */
export default function PricingIntegrityMonitor({ 
  commitments = [], 
  poLines = [],
  onSyncAll,
  isSyncing = false,
  className 
}) {
  // Detect issues
  const zeroCostPOLines = poLines.filter(li => 
    (li.unit_cost ?? 0) <= 0 && li.status !== 'Cancelled'
  );

  const missingCostCommitments = commitments.filter(c => 
    (c.unit_cost_snapshot ?? 0) <= 0 && 
    !['cancelled', 'closed'].includes(c.commitment_status)
  );

  const missingRetailCommitments = commitments.filter(c =>
    (c.unit_retail_snapshot ?? 0) <= 0 &&
    (c.unit_cost_snapshot ?? 0) > 0 &&
    !['cancelled', 'closed'].includes(c.commitment_status)
  );

  // Cost mismatch: commitment cost doesn't match PO line cost
  const poLinesByCommitment = new Map();
  for (const li of poLines) {
    if (!li.commitment_id || li.status === 'Cancelled') continue;
    if (!poLinesByCommitment.has(li.commitment_id)) poLinesByCommitment.set(li.commitment_id, []);
    poLinesByCommitment.get(li.commitment_id).push(li);
  }

  const costMismatchCommitments = commitments.filter(c => {
    const lines = poLinesByCommitment.get(c.id) || [];
    if (lines.length === 0) return false;
    let totalCost = 0, totalQty = 0;
    for (const li of lines) {
      totalCost += (li.qty_ordered || 0) * (li.unit_cost || 0);
      totalQty += (li.qty_ordered || 0);
    }
    const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
    return avgCost > 0 && Math.abs(avgCost - (c.unit_cost_snapshot ?? 0)) > 0.01;
  });

  const totalIssues = zeroCostPOLines.length + missingCostCommitments.length + 
    missingRetailCommitments.length + costMismatchCommitments.length;

  if (totalIssues === 0) return null;

  return (
    <div className={cn(
      "p-3 bg-amber-900/15 border border-amber-700/30 rounded-lg space-y-2",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-300">
            Pricing Issue Detected ({totalIssues})
          </span>
        </div>
        {onSyncAll && costMismatchCommitments.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSyncAll(costMismatchCommitments.map(c => c.id))}
            disabled={isSyncing}
            className="h-7 text-xs border-amber-700 text-amber-300 hover:bg-amber-900/30"
          >
            <RefreshCw className={cn("w-3 h-3 mr-1", isSyncing && "animate-spin")} />
            Sync All
          </Button>
        )}
      </div>

      <div className="space-y-1 text-xs">
        {zeroCostPOLines.length > 0 && (
          <div className="text-amber-400/80">
            • {zeroCostPOLines.length} PO line(s) with $0 cost — not synced to project pricing
          </div>
        )}
        {costMismatchCommitments.length > 0 && (
          <div className="text-amber-400/80">
            • {costMismatchCommitments.length} commitment(s) with cost mismatch vs PO lines
          </div>
        )}
        {missingCostCommitments.length > 0 && (
          <div className="text-amber-400/80">
            • {missingCostCommitments.length} commitment(s) with missing cost
          </div>
        )}
        {missingRetailCommitments.length > 0 && (
          <div className="text-amber-400/80">
            • {missingRetailCommitments.length} commitment(s) with missing retail
          </div>
        )}
      </div>
    </div>
  );
}