import React from "react";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle, CheckCircle2, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * InventoryStateBadgeSimple - Build Management Focused Inventory State
 * 
 * Precedence:
 * 1. reserved_from_stock > 0 → IN STOCK (physically on shelf)
 * 2. covered_from_po > 0     → ORDERED  (PO placed, awaiting delivery)
 * 3. otherwise               → NEEDS ORDER
 * 
 * Does NOT use physical_stock_global. Does NOT use to_order for primary state.
 * This badge reflects SUPPLY state only. NO payment logic.
 */

const STATE_CONFIG = {
  IN_STOCK: {
    label: "In Stock",
    color: "bg-emerald-600/80 text-emerald-100 border-emerald-500",
    Icon: CheckCircle2,
  },
  ORDERED: {
    label: "Ordered",
    color: "bg-blue-600/80 text-blue-100 border-blue-500",
    Icon: Truck,
  },
  NEEDS_ORDER: {
    label: "Needs Order",
    color: "bg-red-600/80 text-red-100 border-red-500",
    Icon: AlertTriangle,
  },
};

/**
 * Determine inventory state from commitment data.
 * Strict precedence: stock → ordered → needs order.
 */
function determineInventoryState(commitment) {
  const reserved = commitment.reserved_from_stock ?? 0;
  const ordered = commitment.covered_from_po ?? 0;

  if (reserved > 0) return 'IN_STOCK';
  if (ordered > 0)  return 'ORDERED';
  return 'NEEDS_ORDER';
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