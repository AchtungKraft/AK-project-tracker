import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Package, Truck, Database, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const ISSUE_TYPES = {
  PO_NOT_RECEIVED: {
    label: "PO not received",
    color: "bg-purple-900/40 text-purple-300 border-purple-700/50",
    filterKey: "not_received",
  },
  RECEIVED_NO_INVENTORY: {
    label: "Received but not in inventory",
    color: "bg-red-900/40 text-red-300 border-red-700/50",
    filterKey: "missing_inventory",
  },
  STOCK_NOT_ALLOCATED: {
    label: "Stock not allocated",
    color: "bg-amber-900/40 text-amber-300 border-amber-700/50",
    filterKey: "not_allocated",
  },
};

function diagnoseReceivingGaps(items) {
  const gaps = [];

  for (const item of items) {
    const coveredPO = item.covered_from_po ?? 0;
    const qtyReceived = item.received_qty ?? item._raw?.qty_received ?? 0;
    const physicalStock = item.inventory_snapshot?.physical ?? 0;
    const reserved = item.reserved_from_stock ?? 0;

    // A: PO exists but no receiving
    if (coveredPO > 0 && qtyReceived === 0) {
      gaps.push({ ...item, issue: "PO_NOT_RECEIVED", physicalStock, qtyReceived });
    }
    // B: PO received but no inventory
    else if (qtyReceived > 0 && physicalStock === 0) {
      gaps.push({ ...item, issue: "RECEIVED_NO_INVENTORY", physicalStock, qtyReceived });
    }
    // C: Inventory exists but not allocated
    else if (physicalStock > 0 && coveredPO > 0 && reserved === 0) {
      gaps.push({ ...item, issue: "STOCK_NOT_ALLOCATED", physicalStock, qtyReceived });
    }
  }

  return gaps;
}

export default function ReceivingGapDiagnosticsPanel({
  enrichedCommitments,
  onReceive,
  onManageQty,
  onRunBackfill,
}) {
  const [activeFilter, setActiveFilter] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const gaps = useMemo(
    () => diagnoseReceivingGaps(enrichedCommitments),
    [enrichedCommitments]
  );

  const counts = useMemo(() => {
    const c = { not_received: 0, missing_inventory: 0, not_allocated: 0 };
    for (const g of gaps) {
      c[ISSUE_TYPES[g.issue].filterKey]++;
    }
    return c;
  }, [gaps]);

  const filtered = useMemo(() => {
    if (!activeFilter) return gaps;
    return gaps.filter((g) => ISSUE_TYPES[g.issue].filterKey === activeFilter);
  }, [gaps, activeFilter]);

  if (gaps.length === 0) {
    return (
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 flex items-center gap-2 text-green-400 text-sm">
          <Package className="w-4 h-4" />
          No receiving gaps detected for this project.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-gray-800">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Receiving Gap Diagnostics
            <Badge variant="outline" className="text-amber-400 border-amber-700 text-xs ml-1">
              {gaps.length} issue{gaps.length !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-gray-400"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </CardHeader>

      {/* Summary counts — always visible */}
      <CardContent className="px-3 pb-2 pt-0">
        <div className="flex flex-wrap gap-2">
          <SummaryChip
            label="Not Received"
            count={counts.not_received}
            color="purple"
            active={activeFilter === "not_received"}
            onClick={() =>
              setActiveFilter(activeFilter === "not_received" ? null : "not_received")
            }
          />
          <SummaryChip
            label="Missing Inventory"
            count={counts.missing_inventory}
            color="red"
            active={activeFilter === "missing_inventory"}
            onClick={() =>
              setActiveFilter(activeFilter === "missing_inventory" ? null : "missing_inventory")
            }
          />
          <SummaryChip
            label="Not Allocated"
            count={counts.not_allocated}
            color="amber"
            active={activeFilter === "not_allocated"}
            onClick={() =>
              setActiveFilter(activeFilter === "not_allocated" ? null : "not_allocated")
            }
          />
          {activeFilter && (
            <button
              onClick={() => setActiveFilter(null)}
              className="text-xs text-gray-500 hover:text-gray-300 underline"
            >
              Clear
            </button>
          )}
        </div>
      </CardContent>

      {/* Detail table — only when expanded */}
      {expanded && (
        <CardContent className="px-3 pb-3 pt-0">
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-1.5 pr-2">Part</th>
                  <th className="text-right py-1.5 px-2">PO Qty</th>
                  <th className="text-right py-1.5 px-2">Received</th>
                  <th className="text-right py-1.5 px-2">Stock</th>
                  <th className="text-right py-1.5 px-2">Reserved</th>
                  <th className="text-left py-1.5 px-2">Issue</th>
                  <th className="text-right py-1.5 pl-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <GapRow
                    key={row.commitment_id}
                    row={row}
                    onReceive={onReceive}
                    onManageQty={onManageQty}
                    onRunBackfill={onRunBackfill}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-600 py-4">
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

function GapRow({ row, onReceive, onManageQty, onRunBackfill }) {
  const issue = ISSUE_TYPES[row.issue];

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
      <td className="py-1.5 pr-2">
        <span className="text-white font-medium truncate block max-w-[200px]">
          {row.part?.part_name || "Unknown"}
        </span>
        {row.part?.vendor_part_number && (
          <span className="text-gray-500 font-mono text-[10px]">
            {row.part.vendor_part_number}
          </span>
        )}
      </td>
      <td className="text-right py-1.5 px-2 text-purple-400 font-mono">
        {row.covered_from_po ?? 0}
      </td>
      <td className="text-right py-1.5 px-2 text-blue-400 font-mono">
        {row.qtyReceived}
      </td>
      <td className="text-right py-1.5 px-2 text-cyan-400 font-mono">
        {row.physicalStock}
      </td>
      <td className="text-right py-1.5 px-2 text-emerald-400 font-mono">
        {row.reserved_from_stock ?? 0}
      </td>
      <td className="py-1.5 px-2">
        <span
          className={cn(
            "inline-block px-1.5 py-0.5 rounded text-[10px] border",
            issue.color
          )}
        >
          {issue.label}
        </span>
      </td>
      <td className="text-right py-1.5 pl-2">
        <div className="flex items-center justify-end gap-1">
          {row.issue === "PO_NOT_RECEIVED" && onReceive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-blue-400 hover:text-blue-300"
              onClick={() => onReceive(row)}
            >
              <Truck className="w-3 h-3 mr-1" />
              Receive
            </Button>
          )}
          {row.issue === "RECEIVED_NO_INVENTORY" && onManageQty && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300"
              onClick={() => onManageQty(row)}
            >
              <Database className="w-3 h-3 mr-1" />
              Fix Stock
            </Button>
          )}
          {row.issue === "STOCK_NOT_ALLOCATED" && onRunBackfill && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-amber-400 hover:text-amber-300"
              onClick={() => onRunBackfill(row)}
            >
              <Package className="w-3 h-3 mr-1" />
              Backfill
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}