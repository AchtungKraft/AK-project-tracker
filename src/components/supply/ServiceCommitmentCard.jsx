import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, ArrowRight, Trash2, ChevronDown, ChevronRight, List } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import ServiceLineItemManager from "@/components/supply/ServiceLineItemManager";
import { FolderKanban } from "lucide-react";

const STATUS_CONFIG = {
  planned: { label: "Planned", color: "bg-gray-600 text-gray-100" },
  ordered: { label: "Ordered", color: "bg-purple-600 text-purple-100" },
  completed: { label: "Completed", color: "bg-blue-600 text-blue-100" },
  billed: { label: "Billed", color: "bg-green-600 text-green-100" },
};

const NEXT_STATUS = {
  planned: "ordered",
  ordered: "completed",
  completed: "billed",
};

const NEXT_LABEL = {
  planned: "Mark Ordered",
  ordered: "Mark Completed",
  completed: "Mark Billed",
};

export default function ServiceCommitmentCard({
  commitment,
  serviceName,
  vendorName,
  projectName,
  onStatusChange,
  onDelete,
  onTotalsChanged,
}) {
  const [expanded, setExpanded] = useState(false);
  const status = commitment.status || "planned";
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
  const nextStatus = NEXT_STATUS[status];

  // Prefer line-item-derived totals, fall back to legacy fields
  const totalCost = commitment.total_cost > 0 ? commitment.total_cost : (commitment.actual_cost ?? commitment.estimated_cost ?? 0);
  const totalBillable = commitment.total_billable || 0;
  const hasLineItems = commitment.total_cost > 0;
  const margin = totalBillable > 0 ? ((totalBillable - totalCost) / totalBillable) * 100 : 0;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
      {/* Main Row */}
      <div className="flex items-center gap-3 p-3">
        {/* Expand toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </Button>

        {/* Service info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {commitment.description}
            </span>
            <Badge className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
              {cfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
            {projectName && (
              <span className="flex items-center gap-1 text-blue-400">
                <FolderKanban className="w-3 h-3" />
                {projectName}
              </span>
            )}
            <span>{serviceName}</span>
            {vendorName && <span>• {vendorName}</span>}
            {commitment.quantity > 1 && <span>• Qty: {commitment.quantity}</span>}
          </div>
        </div>

        {/* Cost & Billable */}
        <div className="text-right shrink-0">
          <p className="text-sm font-mono font-medium text-white">
            {formatCurrencyUSD(totalCost)}
          </p>
          {totalBillable > 0 && (
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-[10px] font-mono text-green-400">{formatCurrencyUSD(totalBillable)}</span>
              <span className={`text-[10px] ${margin >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {margin.toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {nextStatus && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-blue-400 hover:text-blue-300"
              onClick={() => onStatusChange(commitment.id, nextStatus)}
            >
              <ArrowRight className="w-3 h-3" />
              {NEXT_LABEL[status]}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
              <DropdownMenuItem onClick={() => setExpanded(!expanded)} className="text-gray-200">
                <List className="w-3.5 h-3.5 mr-2" />
                {expanded ? "Hide" : "Show"} Line Items
              </DropdownMenuItem>
              {status !== "billed" && (
                <DropdownMenuItem onClick={() => onDelete(commitment.id)} className="text-red-400">
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded Line Items */}
      {expanded && (
        <div className="border-t border-gray-700/50 px-3 pb-3 pt-2 ml-9">
          <ServiceLineItemManager
            commitmentId={commitment.id}
            onTotalsChanged={onTotalsChanged}
          />
        </div>
      )}
    </div>
  );
}