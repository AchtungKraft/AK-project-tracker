import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, ArrowRight, Trash2, DollarSign } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

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
  onStatusChange,
  onEditCost,
  onDelete,
}) {
  const status = commitment.status || "planned";
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
  const cost = commitment.actual_cost ?? commitment.estimated_cost ?? 0;
  const hasActual = commitment.actual_cost != null && commitment.actual_cost > 0;
  const nextStatus = NEXT_STATUS[status];

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
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
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
          <span>{serviceName}</span>
          {vendorName && <span>• {vendorName}</span>}
          {commitment.quantity > 1 && <span>• Qty: {commitment.quantity}</span>}
        </div>
      </div>

      {/* Cost */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-mono font-medium ${hasActual ? 'text-white' : 'text-gray-400'}`}>
          {formatCurrencyUSD(cost)}
        </p>
        {hasActual && commitment.estimated_cost > 0 && commitment.actual_cost !== commitment.estimated_cost && (
          <p className="text-[10px] text-gray-500 font-mono line-through">
            {formatCurrencyUSD(commitment.estimated_cost)}
          </p>
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
            <DropdownMenuItem onClick={() => onEditCost(commitment)} className="text-gray-200">
              <DollarSign className="w-3.5 h-3.5 mr-2" />
              Edit Cost
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
  );
}