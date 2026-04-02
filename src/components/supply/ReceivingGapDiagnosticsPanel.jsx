import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle, Package, Truck, Database, Filter, Loader2,
  ArrowRight, RefreshCw, CheckCircle2, SkipForward, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import BackfillConfirmModal from "./BackfillConfirmModal";

/**
 * ReceivingGapDiagnosticsPanel — Fully server-driven.
 *
 * ZERO supply-state math. All values come from getReceivingGapDiagnostics.
 * Actions are driven by server-returned recommended_action field.
 *
 * 5 issue types from backend:
 *   PO_NOT_RECEIVED, RECEIVED_NO_STOCK, RECEIVED_STOCK_CONSUMED,
 *   STOCK_NOT_ALLOCATED, STOCK_PARTIALLY_ALLOCATED
 */

// Display config keyed by issue_type — only colors, filter keys
// Labels come from server (issue_label field)
const ISSUE_STYLE = {
  PO_NOT_RECEIVED: {
    color: "bg-purple-900/40 text-purple-300 border-purple-700/50",
    chipColor: "purple",
  },
  RECEIVED_NO_STOCK: {
    color: "bg-red-900/40 text-red-300 border-red-700/50",
    chipColor: "red",
  },
  RECEIVED_STOCK_CONSUMED: {
    color: "bg-orange-900/40 text-orange-300 border-orange-700/50",
    chipColor: "orange",
  },
  STOCK_NOT_ALLOCATED: {
    color: "bg-amber-900/40 text-amber-300 border-amber-700/50",
    chipColor: "amber",
  },
  STOCK_PARTIALLY_ALLOCATED: {
    color: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
    chipColor: "yellow",
  },
};

const LIFECYCLE_COLORS = {
  PLANNED: "text-gray-400",
  NEEDS_ORDER: "text-amber-400",
  COVERED: "text-blue-400",
  INSTALL_READY: "text-emerald-400",
  INSTALLED: "text-gray-500",
};

// Filter groups — map filter key to which issue_types it includes
const FILTER_GROUPS = {
  po_not_received: ["PO_NOT_RECEIVED"],
  received_issues: ["RECEIVED_NO_STOCK", "RECEIVED_STOCK_CONSUMED"],
  allocation_issues: ["STOCK_NOT_ALLOCATED", "STOCK_PARTIALLY_ALLOCATED"],
};

export default function ReceivingGapDiagnosticsPanel({ projectId, onReceive, onManageQty }) {
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [backfillPreview, setBackfillPreview] = useState(null);
  const [backfillResult, setBackfillResult] = useState(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillTarget, setBackfillTarget] = useState(null);

  // Canonical server-driven data — ONLY source of truth
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['receivingGapDiagnostics', projectId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getReceivingGapDiagnostics', {
        project_id: projectId,
      });
      return res.data;
    },
    staleTime: 30_000,
    enabled: !!projectId,
  });

  const rows = data?.rows || [];
  const counts = data?.counts || {};
  const total = data?.total || 0;

  // Derived counts for filter chips
  const receivedIssuesCount = (counts.received_no_stock || 0) + (counts.received_stock_consumed || 0);
  const allocationIssuesCount = (counts.stock_not_allocated || 0) + (counts.stock_partially_allocated || 0);

  // Filter rows by active filter group
  const filtered = useMemo(() => {
    if (!activeFilter) return rows;
    const types = FILTER_GROUPS[activeFilter];
    if (!types) return rows;
    return rows.filter(r => types.includes(r.issue_type));
  }, [rows, activeFilter]);

  // --- Backfill flow ---
  const handleBackfillDryRun = async (commitmentIds) => {
    setBackfillLoading(true);
    setBackfillTarget(commitmentIds);
    setBackfillResult(null);
    try {
      const res = await base44.functions.invoke('backfillLegacyReceiving', {
        dry_run: true,
        project_id: projectId,
        commitment_ids: commitmentIds,
      });
      setBackfillPreview(res.data);
    } catch (err) {
      toast.error('Dry run failed: ' + err.message);
      setBackfillPreview(null);
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleBackfillConfirm = async () => {
    setBackfillLoading(true);
    try {
      const res = await base44.functions.invoke('backfillLegacyReceiving', {
        dry_run: false,
        project_id: projectId,
        commitment_ids: backfillTarget,
      });
      const result = res.data;

      queryClient.invalidateQueries({ queryKey: ['receivingGapDiagnostics', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectSupplyView', projectId] });
      queryClient.invalidateQueries({ queryKey: ['portfolioSupplyState'] });
      queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] });
      queryClient.invalidateQueries({ queryKey: ['opsSupplyView'] });

      await refetch();
      setBackfillPreview(null);
      setBackfillResult(result);

      const applied = result.summary?.applied || 0;
      const skippedCount = result.summary?.skipped || 0;
      const remaining = (data?.total || 0) - applied;
      toast.success(`Updated ${applied} commitments. Skipped ${skippedCount}. Remaining gaps: ~${Math.max(0, remaining)}.`);
    } catch (err) {
      toast.error('Backfill failed: ' + err.message);
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleCloseModal = () => {
    setBackfillPreview(null);
    setBackfillResult(null);
    setBackfillTarget(null);
  };

  // Bulk backfill for eligible allocation rows in current filter
  const handleBulkBackfill = () => {
    const eligible = filtered
      .filter(r => r.recommended_action === 'RUN_BACKFILL' && r.is_backfill_eligible)
      .map(r => r.commitment_id);
    if (eligible.length === 0) {
      toast.info('No eligible rows for backfill in current filter.');
      return;
    }
    handleBackfillDryRun(eligible);
  };

  if (isLoading) {
    return (
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading receiving gap diagnostics...
        </CardContent>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          No receiving gaps found.
        </CardContent>
      </Card>
    );
  }

  const bulkEligibleCount = filtered
    .filter(r => r.recommended_action === 'RUN_BACKFILL' && r.is_backfill_eligible).length;

  const toggleFilter = (key) => setActiveFilter(activeFilter === key ? null : key);

  return (
    <>
      <Card className="bg-black/40 border-gray-800">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Receiving Gap Diagnostics
              <Badge variant="outline" className="text-amber-400 border-amber-700 text-xs ml-1">
                {total} issue{total !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400" onClick={() => refetch()}>
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-gray-400" onClick={() => setExpanded(!expanded)}>
                {expanded ? "Collapse" : "Expand"}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Filter chips — counts from server */}
        <CardContent className="px-3 pb-2 pt-0">
          <div className="flex flex-wrap gap-2 items-center">
            <SummaryChip label="All" count={total} color="gray"
              active={activeFilter === null} onClick={() => setActiveFilter(null)} />
            <SummaryChip label="Not Received" count={counts.po_not_received || 0} color="purple"
              active={activeFilter === "po_not_received"} onClick={() => toggleFilter("po_not_received")} />
            <SummaryChip label="Received Issues" count={receivedIssuesCount} color="red"
              active={activeFilter === "received_issues"} onClick={() => toggleFilter("received_issues")} />
            <SummaryChip label="Allocation Issues" count={allocationIssuesCount} color="amber"
              active={activeFilter === "allocation_issues"} onClick={() => toggleFilter("allocation_issues")} />

            {bulkEligibleCount > 0 && (
              <Button variant="outline" size="sm"
                className="h-6 text-[10px] border-amber-700 text-amber-400 hover:bg-amber-900/30 ml-auto"
                onClick={handleBulkBackfill} disabled={backfillLoading}
              >
                {backfillLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Package className="w-3 h-3 mr-1" />}
                Bulk Backfill ({bulkEligibleCount})
              </Button>
            )}
          </div>
        </CardContent>

        {/* Detail table */}
        {expanded && (
          <CardContent className="px-3 pb-3 pt-0">
            <div className="overflow-x-auto mt-2">
              {filtered.length === 0 ? (
                <div className="text-center text-gray-600 py-6 text-sm">No rows in this filter.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-1.5 pr-2">Part</th>
                      <th className="text-right py-1.5 px-1">Req</th>
                      <th className="text-right py-1.5 px-1">PO Cov</th>
                      <th className="text-right py-1.5 px-1">Recv'd</th>
                      <th className="text-right py-1.5 px-1">Stock</th>
                      <th className="text-right py-1.5 px-1">Rsv'd</th>
                      <th className="text-left py-1.5 px-1">Lifecycle</th>
                      <th className="text-left py-1.5 px-1">Issue</th>
                      <th className="text-right py-1.5 pl-1">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(row => (
                      <GapRow
                        key={row.commitment_id}
                        row={row}
                        onReceive={onReceive}
                        onManageQty={onManageQty}
                        onBackfill={() => handleBackfillDryRun([row.commitment_id])}
                        backfillLoading={backfillLoading && backfillTarget?.includes(row.commitment_id)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {backfillPreview && !backfillResult && (
        <BackfillConfirmModal preview={backfillPreview} onConfirm={handleBackfillConfirm}
          onClose={handleCloseModal} isLoading={backfillLoading} />
      )}
      {backfillResult && (
        <BackfillConfirmModal result={backfillResult} onClose={handleCloseModal} />
      )}
    </>
  );
}

function SummaryChip({ label, count, color, active, onClick }) {
  if (count === 0 && color !== 'gray') return null;
  const colorMap = {
    gray: "bg-gray-800/50 text-gray-300 border-gray-700",
    purple: "bg-purple-900/30 text-purple-300 border-purple-800",
    red: "bg-red-900/30 text-red-300 border-red-800",
    orange: "bg-orange-900/30 text-orange-300 border-orange-800",
    amber: "bg-amber-900/30 text-amber-300 border-amber-800",
    yellow: "bg-yellow-900/30 text-yellow-300 border-yellow-800",
  };
  return (
    <button onClick={onClick} className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-colors",
      colorMap[color] || colorMap.gray,
      active && "ring-1 ring-white/30"
    )}>
      {color !== 'gray' && <Filter className="w-3 h-3" />}
      {count} {label}
    </button>
  );
}

/**
 * GapRow — renders one diagnostic row.
 * Uses server-provided issue_label for display and recommended_action for action gating.
 */
function GapRow({ row, onReceive, onManageQty, onBackfill, backfillLoading }) {
  const style = ISSUE_STYLE[row.issue_type];
  if (!style) return null;

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
      <td className="py-1.5 pr-2">
        <span className="text-white font-medium truncate block max-w-[180px]">{row.part_name}</span>
        {row.vendor_part_number && (
          <span className="text-gray-500 font-mono text-[10px]">{row.vendor_part_number}</span>
        )}
      </td>
      <td className="text-right py-1.5 px-1 text-white font-mono">{row.required_total}</td>
      <td className="text-right py-1.5 px-1 text-purple-400 font-mono">{row.covered_from_po}</td>
      <td className="text-right py-1.5 px-1 text-blue-400 font-mono">{row.qty_received}</td>
      <td className="text-right py-1.5 px-1 text-cyan-400 font-mono">{row.physical_stock}</td>
      <td className="text-right py-1.5 px-1 text-emerald-400 font-mono">{row.reserved_from_stock}</td>
      <td className="py-1.5 px-1">
        <div className="flex items-center gap-1">
          <span className={cn("text-[10px] font-mono", LIFECYCLE_COLORS[row.lifecycle_state] || "text-gray-400")}>
            {row.lifecycle_state}
          </span>
          {row.is_backfill_eligible && row.projected_lifecycle_state !== row.lifecycle_state && (
            <>
              <ArrowRight className="w-2.5 h-2.5 text-gray-600" />
              <span className={cn("text-[10px] font-mono", LIFECYCLE_COLORS[row.projected_lifecycle_state] || "text-gray-400")}>
                {row.projected_lifecycle_state}
              </span>
            </>
          )}
        </div>
      </td>
      <td className="py-1.5 px-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border cursor-help", style.color)}>
                {row.issue_label}
              </span>
            </TooltipTrigger>
            <TooltipContent className="bg-gray-800 text-gray-300 text-xs border-gray-700 max-w-[250px]">
              {row.action_reason}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="text-right py-1.5 pl-1">
        <RowAction row={row} onReceive={onReceive} onManageQty={onManageQty}
          onBackfill={onBackfill} backfillLoading={backfillLoading} />
      </td>
    </tr>
  );
}

/**
 * RowAction — Driven entirely by server-returned recommended_action.
 * No UI-side interpretation beyond display mapping.
 */
function RowAction({ row, onReceive, onManageQty, onBackfill, backfillLoading }) {
  switch (row.recommended_action) {
    case 'RECEIVE_NOW':
      if (!onReceive) return null;
      return (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-blue-400 hover:text-blue-300"
          onClick={() => onReceive({
            commitment_id: row.commitment_id, part_id: row.part_id,
            part: { id: row.part_id, part_name: row.part_name }
          })}>
          <Truck className="w-3 h-3 mr-1" />Receive Now
        </Button>
      );

    case 'FIX_INVENTORY':
      if (!onManageQty) return null;
      return (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300"
          onClick={() => onManageQty({
            id: row.commitment_id, commitment_id: row.commitment_id,
            part_id: row.part_id, part: { id: row.part_id, part_name: row.part_name }
          })}>
          <Database className="w-3 h-3 mr-1" />Fix Inventory
        </Button>
      );

    case 'RUN_BACKFILL':
      if (!row.is_backfill_eligible) {
        // Safety: server should not return RUN_BACKFILL without eligibility, but guard anyway
        return <ReviewManuallyBadge reason={row.action_reason} />;
      }
      return (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-amber-400 hover:text-amber-300"
          onClick={onBackfill} disabled={backfillLoading}>
          {backfillLoading
            ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
            : <Package className="w-3 h-3 mr-1" />}
          Backfill ({row.convertible_qty})
        </Button>
      );

    case 'REVIEW_MANUALLY':
      return <ReviewManuallyBadge reason={row.action_reason} />;

    default:
      return null;
  }
}

function ReviewManuallyBadge({ reason }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="ghost" size="sm" disabled className="h-6 px-2 text-[10px] text-gray-500">
              <Eye className="w-3 h-3 mr-1" />Review
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-gray-800 text-gray-300 text-xs border-gray-700 max-w-[250px]">
          {reason || 'Requires manual review'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}