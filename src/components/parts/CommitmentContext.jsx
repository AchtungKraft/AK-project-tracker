import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MoreVertical, Plus, XCircle, Download, Undo2, DollarSign, 
  CheckCircle2, AlertTriangle, FileText, ShoppingCart
} from "lucide-react";
import { getAllowedCommitmentActions, getCommitmentLifecycleState } from "../lifecycle/getAllowedCommitmentActions";

/**
 * CommitmentContext - Unified commitment lifecycle display component
 * Shows lifecycle state, financial summary, and available actions
 * Used across all parts surfaces for consistency
 */

// Commitment Status Badge - shows lifecycle state with color coding
export function CommitmentStatusBadge({ commitment, compact = false }) {
  if (!commitment) return null;
  
  const state = getCommitmentLifecycleState(commitment);
  
  const statusColors = {
    planned: 'border-gray-500 text-gray-400 bg-gray-900/50',
    ordered: 'border-yellow-500 text-yellow-400 bg-yellow-900/20',
    partially_received: 'border-orange-500 text-orange-400 bg-orange-900/20',
    received: 'border-blue-500 text-blue-400 bg-blue-900/20',
    allocated: 'border-purple-500 text-purple-400 bg-purple-900/20',
    installed: 'border-green-500 text-green-400 bg-green-900/20',
    closed: 'border-gray-600 text-gray-500 bg-gray-900/30',
    cancelled: 'border-red-600 text-red-500 bg-red-900/20',
  };
  
  const colorClass = statusColors[commitment.commitment_status] || statusColors.planned;
  
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`${colorClass} text-xs px-1.5 py-0`}>
              {state.label.charAt(0)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{state.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <Badge variant="outline" className={colorClass}>
      {state.label}
    </Badge>
  );
}

// Commitment Quantity Summary - shows qty breakdown
export function CommitmentQtySummary({ commitment, compact = false }) {
  if (!commitment) return null;
  
  const { qty_committed = 0, qty_ordered = 0, qty_received = 0, qty_installed = 0 } = commitment;
  
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-gray-400 font-mono">
              {qty_installed}/{qty_received}/{qty_committed}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p>Committed: {qty_committed}</p>
              <p>Ordered: {qty_ordered}</p>
              <p>Received: {qty_received}</p>
              <p>Installed: {qty_installed}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-green-400">{qty_installed}</span>
      <span className="text-gray-500">/</span>
      <span className="text-blue-400">{qty_received}</span>
      <span className="text-gray-500">/</span>
      <span className="text-white">{qty_committed}</span>
    </div>
  );
}

// Commitment Financial Summary - shows key financial metrics
export function CommitmentFinancialSummary({ commitment, compact = false }) {
  if (!commitment) return null;
  
  const {
    planned_retail_total = 0,
    covered_retail_total = 0,
    exposure_gap = 0,
    billing_status = 'billable',
  } = commitment;
  
  const coveragePct = planned_retail_total > 0 
    ? Math.round((covered_retail_total / planned_retail_total) * 100) 
    : 0;
  
  const billingColors = {
    not_billable: 'text-gray-500',
    billable: 'text-yellow-400',
    invoiced: 'text-blue-400',
    paid: 'text-green-400',
  };
  
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={`border-gray-600 ${billingColors[billing_status]} text-xs px-1.5`}>
                <DollarSign className="w-3 h-3" />
              </Badge>
              {exposure_gap > 0 && (
                <Badge variant="outline" className="border-red-600 text-red-400 text-xs px-1.5">
                  ${exposure_gap.toFixed(0)}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p>Planned Retail: ${planned_retail_total.toFixed(2)}</p>
              <p>Covered: ${covered_retail_total.toFixed(2)} ({coveragePct}%)</p>
              <p>Exposure Gap: ${exposure_gap.toFixed(2)}</p>
              <p>Billing: {billing_status}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-gray-500">Planned:</span>
        <span className="text-white">${planned_retail_total.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Covered:</span>
        <span className="text-green-400">${covered_retail_total.toFixed(2)} ({coveragePct}%)</span>
      </div>
      {exposure_gap > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-500">Exposure:</span>
          <span className="text-red-400">${exposure_gap.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

// Commitment Actions Dropdown - unified lifecycle actions
export function CommitmentActionsDropdown({
  commitment,
  part,
  onCreatePO,
  onDeltaOrder,
  onReceive,
  onInstall,
  onReverseInstall,
  onAllocatePool,
  onCancel,
  onViewFinancial,
  compact = false,
}) {
  if (!commitment) return null;
  
  const allowed = getAllowedCommitmentActions(commitment);
  
  // Count available actions
  const availableCount = [
    allowed.canCreatePO,
    allowed.canCreateDeltaOrder,
    allowed.canReceive,
    allowed.canInstall,
    allowed.canReverseInstall,
    allowed.canCancel,
  ].filter(Boolean).length;
  
  if (availableCount === 0) {
    return null;
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "sm" : "icon"}
          className={compact ? "h-6 w-6 p-0" : "h-8 w-8"}
        >
          <MoreVertical className={compact ? "w-3 h-3" : "w-4 h-4"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700 w-48">
        {/* Ordering Actions */}
        {allowed.canCreatePO && onCreatePO && (
          <DropdownMenuItem onClick={() => onCreatePO(commitment, part)} className="text-blue-400">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Create PO
          </DropdownMenuItem>
        )}
        {allowed.canCreateDeltaOrder && onDeltaOrder && (
          <DropdownMenuItem onClick={() => onDeltaOrder(commitment, part)} className="text-purple-400">
            <Plus className="w-4 h-4 mr-2" />
            Additional Order
          </DropdownMenuItem>
        )}
        
        {/* Receiving */}
        {allowed.canReceive && onReceive && (
          <DropdownMenuItem onClick={() => onReceive(commitment, part)} className="text-yellow-400">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Receive Parts
          </DropdownMenuItem>
        )}
        
        {/* Installation */}
        {allowed.canInstall && onInstall && (
          <DropdownMenuItem onClick={() => onInstall(commitment, part)} className="text-green-400">
            <Download className="w-4 h-4 mr-2" />
            Install Part
          </DropdownMenuItem>
        )}
        {allowed.canReverseInstall && onReverseInstall && (
          <DropdownMenuItem onClick={() => onReverseInstall(commitment, part)} className="text-orange-400">
            <Undo2 className="w-4 h-4 mr-2" />
            Reverse Installation
          </DropdownMenuItem>
        )}
        
        {/* Financial */}
        {onAllocatePool && (
          <>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem onClick={() => onAllocatePool(commitment, part)} className="text-emerald-400">
              <DollarSign className="w-4 h-4 mr-2" />
              Allocate from Pool
            </DropdownMenuItem>
          </>
        )}
        {onViewFinancial && (
          <DropdownMenuItem onClick={() => onViewFinancial(commitment, part)}>
            <FileText className="w-4 h-4 mr-2" />
            View Financial Detail
          </DropdownMenuItem>
        )}
        
        {/* Cancellation */}
        {allowed.canCancel && onCancel && (
          <>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem onClick={() => onCancel(commitment, part)} className="text-red-400">
              <XCircle className="w-4 h-4 mr-2" />
              Cancel / Scope Reduction
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Full Commitment Context Row - combines all components
export function CommitmentContextRow({
  commitment,
  part,
  showStatus = true,
  showQty = true,
  showFinancial = true,
  showActions = true,
  compact = false,
  onCreatePO,
  onDeltaOrder,
  onReceive,
  onInstall,
  onReverseInstall,
  onAllocatePool,
  onCancel,
  onViewFinancial,
}) {
  if (!commitment) {
    // No commitment - show "not tracked" indicator
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="border-gray-700 text-gray-500 text-xs">
              Not Tracked
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>This part has no commitment record</p>
            <p className="text-xs text-gray-400">Legacy requirement or untracked item</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      {showStatus && <CommitmentStatusBadge commitment={commitment} compact={compact} />}
      {showQty && <CommitmentQtySummary commitment={commitment} compact={compact} />}
      {showFinancial && <CommitmentFinancialSummary commitment={commitment} compact={compact} />}
      {showActions && (
        <CommitmentActionsDropdown
          commitment={commitment}
          part={part}
          compact={compact}
          onCreatePO={onCreatePO}
          onDeltaOrder={onDeltaOrder}
          onReceive={onReceive}
          onInstall={onInstall}
          onReverseInstall={onReverseInstall}
          onAllocatePool={onAllocatePool}
          onCancel={onCancel}
          onViewFinancial={onViewFinancial}
        />
      )}
    </div>
  );
}

// Expandable Commitment Breakdown - for parts with multiple commitments
export function CommitmentBreakdown({
  commitments,
  part,
  expanded = false,
  onToggle,
  ...actionHandlers
}) {
  if (!commitments || commitments.length === 0) {
    return null;
  }
  
  if (commitments.length === 1) {
    return (
      <CommitmentContextRow
        commitment={commitments[0]}
        part={part}
        compact
        {...actionHandlers}
      />
    );
  }
  
  // Multiple commitments - show summary with expandable breakdown
  const totalQty = commitments.reduce((sum, c) => sum + (c.qty_committed || 0), 0);
  const totalInstalled = commitments.reduce((sum, c) => sum + (c.qty_installed || 0), 0);
  const totalExposure = commitments.reduce((sum, c) => sum + (c.exposure_gap || 0), 0);
  
  return (
    <div className="space-y-1">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <Badge variant="outline" className="border-purple-600 text-purple-400">
          {commitments.length} commitments
        </Badge>
        <span>{totalInstalled}/{totalQty} qty</span>
        {totalExposure > 0 && (
          <span className="text-red-400">${totalExposure.toFixed(0)} exposure</span>
        )}
      </button>
      
      {expanded && (
        <div className="pl-4 border-l border-gray-700 space-y-2 mt-2">
          {commitments.map(commitment => (
            <CommitmentContextRow
              key={commitment.id}
              commitment={commitment}
              part={part}
              compact
              {...actionHandlers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default {
  CommitmentStatusBadge,
  CommitmentQtySummary,
  CommitmentFinancialSummary,
  CommitmentActionsDropdown,
  CommitmentContextRow,
  CommitmentBreakdown,
};