import React from "react";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * InventoryStateBadgeSimple - Build Management Focused Inventory State
 * 
 * PHASE 1 SEMANTIC CORRECTION:
 * Replaces misleading "Covered" semantics with clear inventory state.
 * 
 * States:
 * - IN STOCK: to_order === 0 AND needed <= (reserved + covered_from_po + qty_installed)
 * - PARTIAL STOCK: to_order > 0 AND reserved_from_stock > 0
 * - OUT OF STOCK: to_order > 0 AND reserved_from_stock === 0
 * 
 * This badge reflects INVENTORY state only. NO payment logic.
 */

const STATE_CONFIG = {
  IN_STOCK: {
    label: "In Stock",
    color: "bg-emerald-600/80 text-emerald-100 border-emerald-500",
    Icon: CheckCircle2,
  },
  PARTIAL_STOCK: {
    label: "Partial Stock",
    color: "bg-amber-600/80 text-amber-100 border-amber-500",
    Icon: Package,
  },
  OUT_OF_STOCK: {
    label: "Out of Stock",
    color: "bg-red-600/80 text-red-100 border-red-500",
    Icon: AlertTriangle,
  },
};

/**
 * Determine inventory state from commitment data
 */
function determineInventoryState(commitment) {
  const toOrder = commitment.to_order ?? 0;
  const reservedFromStock = commitment.reserved_from_stock ?? 0;
  const coveredFromPO = commitment.covered_from_po ?? 0;
  const qtyInstalled = commitment.qty_installed ?? 0;
  const requiredTotal = commitment.required_total ?? 0;
  
  // Check if needs (required - installed) is satisfied
  const needed = Math.max(0, requiredTotal - qtyInstalled);
  const supplied = reservedFromStock + coveredFromPO;
  
  // IN STOCK: No ordering needed and supply covers demand
  if (toOrder === 0 && supplied >= needed) {
    return 'IN_STOCK';
  }
  
  // PARTIAL STOCK: Needs ordering but has some reserved
  if (toOrder > 0 && reservedFromStock > 0) {
    return 'PARTIAL_STOCK';
  }
  
  // OUT OF STOCK: Needs ordering and no stock reserved
  if (toOrder > 0) {
    return 'OUT_OF_STOCK';
  }
  
  // Default: If nothing to order, consider in stock
  return 'IN_STOCK';
}

export function InventoryStateBadgeSimple({ commitment, compact = false, className }) {
  const state = determineInventoryState(commitment);
  const config = STATE_CONFIG[state];
  const Icon = config.Icon;

  return (
    <Badge className={cn(
      config.color,
      "gap-1 text-[10px] font-medium whitespace-nowrap",
      className
    )}>
      <Icon className="w-3 h-3" />
      {!compact && config.label}
    </Badge>
  );
}

/**
 * Get inventory state counts for summary strip
 */
export function getInventoryStateCounts(items) {
  let inStock = 0;
  let partialStock = 0;
  let outOfStock = 0;
  
  items.forEach(item => {
    const state = determineInventoryState(item);
    if (state === 'IN_STOCK') inStock++;
    else if (state === 'PARTIAL_STOCK') partialStock++;
    else if (state === 'OUT_OF_STOCK') outOfStock++;
  });
  
  return { inStock, partialStock, outOfStock };
}

export default InventoryStateBadgeSimple;