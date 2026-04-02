import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Package, Truck, Database, Filter, Loader2, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import BackfillConfirmModal from "./BackfillConfirmModal";

const ISSUE_CONFIG = {
  PO_NOT_RECEIVED: {
    label: "PO not received",
    color: "bg-purple-900/40 text-purple-300 border-purple-700/50",
    filterKey: "po_not_received",
    chipColor: "purple",
  },
  RECEIVED_NO_STOCK: {
    label: "Received, no inventory",
    color: "bg-red-900/40 text-red-300 border-red-700/50",
    filterKey: "received_no_stock",
    chipColor: "red",
  },
  STOCK_NOT_ALLOCATED: {
    label: "Stock not allocated",
    color: "bg-amber-900/40 text-amber-300 border-amber-700/50",
    filterKey: "stock_not_allocated",
    chipColor: "amber",
  },
};

const LIFECYCLE_COLORS = {
  PLANNED: "text-gray-400",
  NEEDS_ORDER: "text-amber-400",
  COVERED: "text-blue-400",
  INSTALL_READY: "text-emerald-400",
  INSTALLED: "text-gray-500",
};

export default function ReceivingGapDiagnosticsPanel({ projectId, onReceive, onManageQty }) {
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [backfillPreview, setBackfillPreview] = useState(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillTarget, setBackfillTarget] = useState(null); // single commitment_id or null for batch
  const [postRunResult, setPostRunResult] = useState(null);

  // Canonical server-driven data
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
  const counts = data?.counts || { po_not_received: 0, received_no_stock: 0, stock_not_allocated: 0 };
  const total = data?.total || 0;

  const filtered = useMemo(() => {
    if (!activeFilter) return rows;
    return rows.filter(r => ISSUE_CONFIG[r.issue_type]?.filterKey === activeFilter);
  }, [rows, activeFilter]);

  // --- Backfill flow ---
  const handleBackfillDryRun = async (commitmentIds) => {
    setBackfillLoading(true);
    setBackfillTarget(commitmentIds);
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
      const applied = result.summary?.applied || 0;

      // Post-run: refetch diagnostics + supply view
      queryClient.invalidateQueries({ queryKey: ['receivingGapDiagnostics', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectSupplyView', projectId] });

      // Show result
      const prevTotal = total;
      await refetch();
      const newTotal = rows.length; // approximate

      setPostRunResult({
        applied,
        before: prevTotal,
        after: Math.max(0, prevTotal - applied),
      });

      toast.success(`Backfill applied: ${applied} commitment(s) updated`);
      setBackfillPreview(null);
      setBackfillTarget(null);
    } catch (err) {
      toast.error('Backfill failed: ' + err.message);
    } finally {
      setBackfillLoading(false);
    }
  };

  // Loading state
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

  // No issues
  if (total === 0) {
    return (
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          No receiving gaps detected.
        </CardContent>
      </Card>
    );
  }

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
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-400"
                onClick={() => refetch()}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Collapse" : "Expand"}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Server-driven summary counts */}
        <CardContent className="px-3 pb-2 pt-0">
          <div className="flex flex-wrap gap-2">
            <SummaryChip
              label="Not Received"
              count={counts.po_not_received}
              color="purple"
              active={activeFilter === "po_not_received"}
              onClick={() => setActiveFilter(activeFilter === "po_not_received" ? null : "po_not_received")}
            />
            <SummaryChip
              label="Missing Inventory"
              count={counts.received_no_stock}
              color="red"
              active={activeFilter === "received_no_stock"}
              onClick={() => setActiveFilter(activeFilter === "received_no_stock" ? null : "received_no_stock")}
            />
            <SummaryChip
              label="Not Allocated"
              count={counts.stock_not_allocated}
              color="amber"
              active={activeFilter === "stock_not_allocated"}
              onClick={() => setActiveFilter(activeFilter === "stock_not_allocated" ? null : "stock_not_allocated")}
            />
            {activeFilter && (
              <button onClick={() => setActiveFilter(null)} className="text-xs text-gray-500 hover:text-gray-300 underline">
                Clear
              </button>
            )}
          </div>

          {/* Post-run result banner */}
          {postRunResult && (
            <div className="mt-2 bg-green-900/30 border border-green-700/50 rounded px-2 py-1.5 text-xs text-green-300 flex items-center justify-between">
              <span>Receiving gaps reduced from {postRunResult.before} → {postRunResult.after} ({postRunResult.applied} fixed)</span>
              <button onClick={() => setPostRunResult(null)} className="text-green-500 hover:text-green-300 text-[10px]">dismiss</button>
            </div>
          )}
        </CardContent>

        {/* Detail table */}
        {expanded && (
          <CardContent className="px-3 pb-3 pt-0">
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-1.5 pr-2">Part</th>
                    <th className="text-right py-1.5 px-1">PO Cov</th>
                    <th className="text-right py-1.5 px-1">Recv'd</th>
                    <th className="text-right py-1.5 px-1">Stock</th>
                    <th className="text-right py-1.5 px-1">Rsv'd</th>
                    <th className="text-left py-1.5 px-1">Lifecycle</th>
                    <th className="text-left py-1.5 px-1">Issue</th>
                    <th className="text-right py-1.5 pl-1">Actions</th>
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
                      backfillLoading={backfillLoading && backfillTarget?.[0] === row.commitment_id}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-gray-600 py-4">
                        No items match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Backfill confirmation modal */}
      {backfillPreview && (
        <BackfillConfirmModal
          preview={backfillPreview}
          onConfirm={handleBackfillConfirm}
          onClose={() => { setBackfillPreview(null); setBackfillTarget(null); }}
          isLoading={backfillLoading}
        />
      )}
    </>
  );
}

function SummaryChip({ label, count, color, active, onClick }) {
  if (count === 0) return null;
  const colorMap = {
    purple: "bg-purple-900/30 text-purple-300 border-purple-800",
    red: "bg-red-900/30 text-red-300 border-red-800",
    amber: "bg-amber-900/30 text-amber-300 border-amber-800",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-colors",
        colorMap[color],
        active && "ring-1 ring-white/30"
      )}
    >
      <Filter className="w-3 h-3" />
      {count} {label}
    </button>
  );
}

function GapRow({ row, onReceive, onManageQty, onBackfill, backfillLoading }) {
  const issue = ISSUE_CONFIG[row.issue_type];
  if (!issue) return null;

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
      <td className="py-1.5 pr-2">
        <span className="text-white font-medium truncate block max-w-[180px]">
          {row.part_name}
        </span>
        {row.vendor_part_number && (
          <span className="text-gray-500 font-mono text-[10px]">{row.vendor_part_number}</span>
        )}
        {row.last_backfill_at && (
          <span className="text-[9px] text-cyan-600 ml-1">● Backfilled</span>
        )}
      </td>
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
        <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", issue.color)}>
          {issue.label}
        </span>
      </td>
      <td className="text-right py-1.5 pl-1">
        <div className="flex items-center justify-end gap-1">
          {row.issue_type === "PO_NOT_RECEIVED" && onReceive && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-blue-400 hover:text-blue-300"
              onClick={() => onReceive({ commitment_id: row.commitment_id, part_id: row.part_id, part: { id: row.part_id, part_name: row.part_name } })}
            >
              <Truck className="w-3 h-3 mr-1" />
              Receive
            </Button>
          )}
          {row.issue_type === "RECEIVED_NO_STOCK" && onManageQty && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300"
              onClick={() => onManageQty({ id: row.commitment_id, commitment_id: row.commitment_id, part_id: row.part_id, part: { id: row.part_id, part_name: row.part_name } })}
            >
              <Database className="w-3 h-3 mr-1" />
              Fix Stock
            </Button>
          )}
          {row.issue_type === "STOCK_NOT_ALLOCATED" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-amber-400 hover:text-amber-300"
                      onClick={onBackfill}
                      disabled={!row.is_backfill_eligible || backfillLoading}
                    >
                      {backfillLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Package className="w-3 h-3 mr-1" />}
                      Backfill{row.convertible_qty > 0 ? ` (${row.convertible_qty})` : ''}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!row.is_backfill_eligible && (
                  <TooltipContent className="bg-gray-800 text-gray-300 text-xs border-gray-700">
                    No convertible quantity
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </td>
    </tr>
  );
}