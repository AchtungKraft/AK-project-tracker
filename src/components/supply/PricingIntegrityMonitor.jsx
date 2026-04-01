import React, { useState } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PricingIntegrityMonitor - Detects and displays pricing issues
 * 
 * ENHANCED with:
 * - Expanded sync options (missing only vs all mismatches)
 * - Counts per category (missing, mismatch, override skipped)
 * - Collapsible detail section
 */
export default function PricingIntegrityMonitor({ 
  commitments = [], 
  poLines = [],
  onSyncMissing,
  onSyncAll,
  isSyncing = false,
  className 
}) {
  const [expanded, setExpanded] = useState(false);

  // Detect issues
  const zeroCostPOLines = poLines.filter(li => 
    (li.unit_cost ?? 0) <= 0 && li.status !== 'Cancelled'
  );

  const missingCostCommitments = commitments.filter(c => 
    (c.unit_cost_snapshot ?? c.unit_cost ?? 0) <= 0 && 
    !['cancelled', 'closed'].includes(c.commitment_status || c._raw?.commitment_status)
  );

  const missingRetailCommitments = commitments.filter(c =>
    (c.unit_retail_snapshot ?? c.unit_retail ?? 0) <= 0 &&
    (c.unit_cost_snapshot ?? c.unit_cost ?? 0) > 0 &&
    !['cancelled', 'closed'].includes(c.commitment_status || c._raw?.commitment_status)
  );

  const overrideSkipped = commitments.filter(c =>
    (c.cost_override === true || c._raw?.cost_override === true) &&
    !['cancelled', 'closed'].includes(c.commitment_status || c._raw?.commitment_status)
  );

  // Cost mismatch: commitment cost doesn't match PO line cost
  const poLinesByCommitment = new Map();
  for (const li of poLines) {
    if (!li.commitment_id || li.status === 'Cancelled') continue;
    if (!poLinesByCommitment.has(li.commitment_id)) poLinesByCommitment.set(li.commitment_id, []);
    poLinesByCommitment.get(li.commitment_id).push(li);
  }

  const costMismatchCommitments = commitments.filter(c => {
    const cid = c.id || c.commitment_id;
    const lines = poLinesByCommitment.get(cid) || [];
    if (lines.length === 0) return false;
    let totalCost = 0, totalQty = 0;
    for (const li of lines) {
      totalCost += (li.qty_ordered || 0) * (li.unit_cost || 0);
      totalQty += (li.qty_ordered || 0);
    }
    const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
    const commitmentCost = c.unit_cost_snapshot ?? c.unit_cost ?? 0;
    return avgCost > 0 && Math.abs(avgCost - commitmentCost) > 0.01;
  });

  // Syncable: commitments with PO lines that have missing or mismatched cost (excluding overrides)
  const syncableMissing = missingCostCommitments.filter(c => {
    const cid = c.id || c.commitment_id;
    return (poLinesByCommitment.get(cid) || []).length > 0 &&
      c.cost_override !== true && c._raw?.cost_override !== true;
  });

  const syncableAll = [...new Set([
    ...syncableMissing.map(c => c.id || c.commitment_id),
    ...costMismatchCommitments.filter(c => 
      c.cost_override !== true && c._raw?.cost_override !== true
    ).map(c => c.id || c.commitment_id)
  ])];

  const totalIssues = zeroCostPOLines.length + missingCostCommitments.length + 
    missingRetailCommitments.length + costMismatchCommitments.length;

  if (totalIssues === 0) return null;

  return (
    <div className={cn(
      "p-3 bg-amber-900/15 border border-amber-700/30 rounded-lg space-y-2",
      className
    )}>
      <div className="flex items-center justify-between">
        <button 
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left"
        >
          {expanded ? <ChevronDown className="w-3 h-3 text-amber-400" /> : <ChevronRight className="w-3 h-3 text-amber-400" />}
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-300">
            Pricing Issue Detected ({totalIssues})
          </span>
        </button>
        <div className="flex items-center gap-2">
          {onSyncMissing && syncableMissing.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSyncMissing(syncableMissing.map(c => c.id || c.commitment_id))}
              disabled={isSyncing}
              className="h-7 text-xs border-amber-700 text-amber-300 hover:bg-amber-900/30"
            >
              <RefreshCw className={cn("w-3 h-3 mr-1", isSyncing && "animate-spin")} />
              Sync Missing ({syncableMissing.length})
            </Button>
          )}
          {onSyncAll && syncableAll.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSyncAll(syncableAll)}
              disabled={isSyncing}
              className="h-7 text-xs border-blue-700 text-blue-300 hover:bg-blue-900/30"
            >
              <RefreshCw className={cn("w-3 h-3 mr-1", isSyncing && "animate-spin")} />
              Sync All ({syncableAll.length})
            </Button>
          )}
        </div>
      </div>

      {/* Summary counts row */}
      <div className="flex flex-wrap gap-3 text-xs">
        {missingCostCommitments.length > 0 && (
          <span className="text-red-400">
            <span className="font-mono font-bold">{missingCostCommitments.length}</span> missing cost
          </span>
        )}
        {costMismatchCommitments.length > 0 && (
          <span className="text-amber-400">
            <span className="font-mono font-bold">{costMismatchCommitments.length}</span> mismatched
          </span>
        )}
        {overrideSkipped.length > 0 && (
          <span className="text-gray-400">
            <span className="font-mono font-bold">{overrideSkipped.length}</span> override (skipped)
          </span>
        )}
        {zeroCostPOLines.length > 0 && (
          <span className="text-red-400">
            <span className="font-mono font-bold">{zeroCostPOLines.length}</span> $0 PO lines
          </span>
        )}
        {missingRetailCommitments.length > 0 && (
          <span className="text-amber-400/70">
            <span className="font-mono font-bold">{missingRetailCommitments.length}</span> missing retail
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-1 text-xs border-t border-amber-800/30 pt-2">
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
          {overrideSkipped.length > 0 && (
            <div className="text-gray-500">
              • {overrideSkipped.length} commitment(s) with manual cost override — excluded from sync
            </div>
          )}
        </div>
      )}
    </div>
  );
}