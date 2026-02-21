import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  CheckCircle2, 
  ShoppingCart, 
  Truck, 
  Wrench, 
  AlertTriangle,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase 9I - InventoryStateBadge
 * 
 * MANDATORY visual states for commitment inventory status.
 * Uses ONLY canonical fields from SupplyCommitmentViewModel.
 * NO local math. NO derived calculations.
 * 
 * States:
 * 1. IN_STOCK_ALLOCATED - reserved_from_stock > 0 AND to_order === 0
 * 2. NEEDS_ORDER - to_order > 0
 * 3. ON_PO - covered_from_po > 0
 * 4. READY_TO_INSTALL - available_to_install > 0
 * 5. COVERAGE_DRIFT - invariant violation (red error)
 */

const STATE_CONFIG = {
  IN_STOCK_ALLOCATED: {
    label: "In Stock – Allocated",
    color: "bg-cyan-600 text-white border-cyan-500",
    Icon: Package,
    description: "Fulfilled from existing stock. No PO required."
  },
  NEEDS_ORDER: {
    label: "Needs Order",
    color: "bg-purple-600 text-white border-purple-500",
    Icon: ShoppingCart,
    description: "Remaining quantity must be ordered."
  },
  ON_PO: {
    label: "On PO",
    color: "bg-blue-600 text-white border-blue-500",
    Icon: Truck,
    description: "Quantity covered by purchase order."
  },
  READY_TO_INSTALL: {
    label: "Ready to Install",
    color: "bg-green-600 text-white border-green-500",
    Icon: Wrench,
    description: "Parts available for installation."
  },
  COVERAGE_DRIFT: {
    label: "Coverage Drift",
    color: "bg-red-600 text-white border-red-500",
    Icon: AlertTriangle,
    description: "Backend invariant violation detected."
  },
  COMPLETE: {
    label: "Complete",
    color: "bg-gray-600 text-white border-gray-500",
    Icon: CheckCircle2,
    description: "Fully installed."
  }
};

/**
 * Determine primary inventory state from CANONICAL fields only.
 * NO local math - all values come from read model.
 */
function determineInventoryState(commitment) {
  const {
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    to_order = 0,
    available_to_install = 0,
    qty_installed = 0,
  } = commitment;

  // INVARIANT CHECK: required_total === reserved + covered + to_order
  const sum = reserved_from_stock + covered_from_po + to_order;
  if (Math.abs(sum - required_total) > 0.01 && required_total > 0) {
    return 'COVERAGE_DRIFT';
  }

  // Check if complete
  if (qty_installed >= required_total && required_total > 0) {
    return 'COMPLETE';
  }

  // Priority order for primary state display

  // STATE 4: Ready to Install (has available stock to consume)
  if (available_to_install > 0) {
    return 'READY_TO_INSTALL';
  }

  // STATE 2: Needs Order (has remaining quantity to order)
  if (to_order > 0) {
    return 'NEEDS_ORDER';
  }

  // STATE 3: On PO (waiting for delivery)
  if (covered_from_po > 0) {
    return 'ON_PO';
  }

  // STATE 1: In Stock Allocated (fully reserved from stock)
  if (reserved_from_stock > 0 && to_order === 0) {
    return 'IN_STOCK_ALLOCATED';
  }

  return null;
}

export function InventoryStateBadge({ commitment, compact = false, className }) {
  const state = determineInventoryState(commitment);
  
  if (!state) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  const config = STATE_CONFIG[state];
  const Icon = config.Icon;

  const badge = (
    <Badge className={cn(config.color, "gap-1 font-medium", className)}>
      <Icon className="w-3 h-3" />
      {compact ? null : config.label}
    </Badge>
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent className="bg-gray-900 border-gray-700">
            <p className="font-medium text-white">{config.label}</p>
            <p className="text-xs text-gray-400">{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

/**
 * Stock availability helper text
 * Shows when unreserved stock exists but commitment not fully reserved
 */
export function StockAvailableHelper({ commitment, inventorySnapshot }) {
  const available = inventorySnapshot?.available ?? 0;
  const reserved = commitment.reserved_from_stock ?? 0;
  const required = commitment.required_total ?? 0;

  // Only show if stock available AND not fully reserved
  if (available <= 0 || reserved >= required) {
    return null;
  }

  return (
    <span className="text-xs text-gray-400">
      Stock Available: {available}
    </span>
  );
}

/**
 * Prepay status badge for Order Queue
 */
export function PrepayStatusBadge({ requiresPrepay, billingStatus }) {
  // Normalize boolean - treat null/undefined as false (legacy default)
  const prepayRequired = requiresPrepay === true;

  if (!prepayRequired) {
    return (
      <Badge variant="outline" className="border-green-600 text-green-400 text-xs">
        Order Without Invoice
      </Badge>
    );
  }

  // Check if prepay satisfied
  const isPaid = billingStatus === 'INVOICED' || billingStatus === 'invoiced' || 
                 billingStatus === 'PAID' || billingStatus === 'paid';

  if (isPaid) {
    return (
      <Badge variant="outline" className="border-green-600 text-green-400 text-xs">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Prepay Satisfied
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-yellow-600 text-yellow-400 text-xs">
      <AlertTriangle className="w-3 h-3 mr-1" />
      Prepay Required
    </Badge>
  );
}

/**
 * Coverage drift error badge - shows when invariant violated
 */
export function CoverageDriftBadge({ commitment }) {
  const {
    required_total = 0,
    reserved_from_stock = 0,
    covered_from_po = 0,
    to_order = 0,
  } = commitment;

  const sum = reserved_from_stock + covered_from_po + to_order;
  const isDrift = Math.abs(sum - required_total) > 0.01 && required_total > 0;

  if (!isDrift) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-red-600 text-white gap-1">
            <AlertTriangle className="w-3 h-3" />
            Coverage Drift
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-gray-900 border-gray-700 max-w-xs">
          <p className="font-medium text-red-400">Invariant Violation</p>
          <div className="text-xs text-gray-400 mt-1">
            <p>Required: {required_total}</p>
            <p>Reserved: {reserved_from_stock}</p>
            <p>Covered: {covered_from_po}</p>
            <p>To Order: {to_order}</p>
            <p className="text-red-400 mt-1">Sum: {sum} (diff: {(sum - required_total).toFixed(2)})</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default InventoryStateBadge;