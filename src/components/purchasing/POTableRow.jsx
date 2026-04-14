import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import POStatusBadge from "@/components/supply/POStatusBadge";

const BILLING_COLORS = {
  'Not Invoiced': 'text-gray-400 border-gray-600',
  'Client Invoiced': 'text-amber-400 border-amber-500/50',
  'Client Paid': 'text-green-400 border-green-500/50',
};

export default function POTableRow({ po, onNavigate, showProject = false }) {
  const received = po.total_qty_received || 0;
  const ordered = po.total_qty_ordered || 0;
  const remaining = po.total_qty_remaining || 0;
  const progressPct = ordered > 0 ? (received / ordered) * 100 : 0;
  const isPartial = received > 0 && remaining > 0;

  return (
    <TableRow
      className="border-gray-700/50 hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={() => onNavigate(po.order_id)}
    >
      {/* PO Number */}
      <TableCell className="font-mono text-sm text-white font-medium">
        {po.po_number}
      </TableCell>

      {/* Vendor */}
      <TableCell className="text-sm text-gray-300 max-w-[160px] truncate">
        {po.vendor_name}
      </TableCell>

      {/* Status */}
      <TableCell>
        <POStatusBadge status={po.status} size="sm" />
      </TableCell>

      {/* Project (optional) */}
      {showProject && (
        <TableCell className="text-sm text-gray-400 max-w-[140px] truncate">
          {po.project_names?.length > 0
            ? po.project_names.join(', ')
            : <span className="text-gray-600">—</span>}
        </TableCell>
      )}

      {/* Cost */}
      <TableCell className="text-right font-mono text-sm text-emerald-400">
        {po.total_cost > 0 ? `$${po.total_cost.toFixed(2)}` : '—'}
      </TableCell>

      {/* Receiving Progress */}
      <TableCell>
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                isPartial ? "bg-amber-500" : progressPct >= 100 ? "bg-green-500" : "bg-blue-500"
              )}
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap font-mono">
            {received}/{ordered}
          </span>
        </div>
      </TableCell>

      {/* Billing */}
      <TableCell>
        {po.billing_status && (
          <Badge variant="outline" className={cn("text-[10px]", BILLING_COLORS[po.billing_status] || 'text-gray-400 border-gray-600')}>
            {po.billing_status}
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}