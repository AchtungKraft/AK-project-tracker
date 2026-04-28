import React from "react";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle, CheckCircle2, Truck, Wrench, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveLifecycleState } from "./resolveCommitmentStateLocal";
import { resolveInstallState } from "./resolveInstallState";

/**
 * InventoryStateBadgeSimple - Build Management Focused Inventory State
 * 
 * Precedence:
 * 1. covered_from_po > 0     → ORDERED  (PO placed, awaiting delivery)
 * 2. reserved_from_stock > 0 → IN STOCK (physically on shelf)
 * 3. otherwise               → NEEDS ORDER
 * 
 * Does NOT use physical_stock_global. Does NOT use to_order for primary state.
 * This badge reflects SUPPLY state only. NO payment logic.
 */

const STATE_CONFIG = {
  INSTALLED: {
    label: "Installed",
    color: "bg-gray-600/80 text-gray-200 border-gray-500",
    Icon: CircleCheck,
  },
  INSTALL_READY: {
    label: "Ready to Install",
    color: "bg-emerald-600/80 text-emerald-100 border-emerald-500",
    Icon: Wrench,
  },
  IN_STOCK: {
    label: "In Stock",
    color: "bg-cyan-600/80 text-cyan-100 border-cyan-500",
    Icon: CheckCircle2,
  },
  ORDERED: {
    label: "Ordered",
    color: "bg-purple-600/80 text-purple-100 border-purple-500",
    Icon: Truck,
  },
  NEEDS_ORDER: {
    label: "Needs Order",
    color: "bg-red-600/80 text-red-100 border-red-500",
    Icon: AlertTriangle,
  },
  // Ordering-context states (coverage-driven)
  COVERED: {
    label: "Covered",
    color: "bg-emerald-600/80 text-emerald-100 border-emerald-500",
    Icon: CheckCircle2,
  },
  PARTIAL: {
    label: "Partial",
    color: "bg-amber-600/80 text-amber-100 border-amber-500",
    Icon: AlertTriangle,
  },
};

/**
 * Determine ordering state from backend canonical flags.
 * Used in ordering context (tab === 'buy' or GlobalNeedToOrder).
 */
function determineOrderingState(commitment) {
  // CANONICAL: Backend needs_order is the single truth
  if (commitment.needs_order === true) return 'NEEDS_ORDER';
  if (commitment.commitment_fulfilled === true) return 'COVERED';
  const toOrder = commitment.to_order_qty ?? commitment.to_order ?? 0;
  if (toOrder > 0) return 'NEEDS_ORDER';
  const coverage = commitment.coverage_status;
  if (coverage === 'FULL') return 'COVERED';
  if (coverage === 'PARTIAL') return 'PARTIAL';
  return 'COVERED';
}

/**
 * Determine inventory state from commitment data — BACKEND CANONICAL FIELDS FIRST.
 * Uses backend needs_order / commitment_fulfilled when available.
 * Falls back to local resolver only when backend fields are missing.
 * 
 * CANONICAL: A commitment is NOT "Needs Order" if commitment_fulfilled === true
 * (i.e. coverage_qty >= effective_required)
 */
function determineInventoryState(commitment) {
  // CANONICAL: Use resolveInstallState as single source of truth for install readiness
  const { is_fully_installed, is_ready_to_install } = resolveInstallState(commitment);
  
  // Fully installed → show INSTALLED, not INSTALL_READY
  if (is_fully_installed) return 'INSTALLED';
  
  // Has units available to install → INSTALL_READY
  if (is_ready_to_install) return 'INSTALL_READY';

  // PHASE 5: Prefer backend canonical flags over local resolution
  const backendFulfilled = commitment.commitment_fulfilled;
  const backendNeedsOrder = commitment.needs_order;
  
  if (backendNeedsOrder === true) return 'NEEDS_ORDER';
  
  if (backendFulfilled === true) {
    return 'ORDERED'; // Covered by PO or stock, not yet installable
  }
  
  if (backendNeedsOrder === false && backendFulfilled === false) {
    const ordered = commitment.covered_from_po ?? 0;
    if (ordered > 0) return 'ORDERED';
    const reserved = commitment.reserved_from_stock ?? 0;
    if (reserved > 0) return 'IN_STOCK';
    return 'NEEDS_ORDER';
  }

  // Fallback: backend fields not present
  if (import.meta.env.DEV) {
    console.warn('[determineInventoryState] Missing backend canonical flags for', commitment.id || commitment.commitment_id);
  }
  const lifecycle = resolveLifecycleState(commitment);
  if (lifecycle === 'INSTALLED') return 'INSTALLED';
  if (lifecycle === 'INSTALL_READY') return 'INSTALL_READY';
  if (lifecycle === 'COVERED') return 'ORDERED';
  
  const ordered = commitment.covered_from_po ?? 0;
  if (ordered > 0) return 'ORDERED';
  const reserved = commitment.reserved_from_stock ?? 0;
  if (reserved > 0) return 'IN_STOCK';
  return 'NEEDS_ORDER';
}

/**
 * Context-aware state resolver.
 * In ordering context: uses coverage/to_order fields only.
 * Otherwise: uses inventory/lifecycle state.
 */
export function determineContextAwareState(commitment, isOrderingContext = false) {
  if (isOrderingContext) {
    // Dev conflict warning
    if (import.meta.env.DEV) {
      const stock = commitment.reserved_from_stock ?? 0;
      const toOrder = commitment.to_order ?? 0;
      if (stock > 0 && toOrder > 0) {
        console.warn('[Ordering Conflict]', {
          part: commitment.part?.part_name || commitment.part_name,
          stock,
          to_order: toOrder,
          coverage: commitment.coverage_status,
        });
      }
    }
    return determineOrderingState(commitment);
  }
  return determineInventoryState(commitment);
}

export function InventoryStateBadgeSimple({ commitment, compact = false, className, tab }) {
  // Phase 7: Dev diagnostics guard for missing canonical fields
  if (import.meta.env.DEV) {
    if (commitment.covered_from_po === undefined) console.error('Missing covered_from_po in read model', commitment.id);
    if (commitment.reserved_from_stock === undefined) console.error('Missing reserved_from_stock in read model', commitment.id);
    if (commitment.required_total === undefined) console.error('Missing required_total in read model', commitment.id);
  }

  const isOrderingContext = tab === 'buy';
  const state = determineContextAwareState(commitment, isOrderingContext);
  const config = STATE_CONFIG[state] || STATE_CONFIG.NEEDS_ORDER;
  const Icon = config.Icon;

  // In ordering context, demote stock to secondary info instead of primary badge
  const showStockSubtext = isOrderingContext && (commitment.reserved_from_stock ?? 0) > 0 && state === 'NEEDS_ORDER';

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Badge className={cn(
        config.color,
        "gap-1 text-[10px] font-medium whitespace-nowrap",
        className
      )}>
        <Icon className="w-3 h-3" />
        {!compact && config.label}
      </Badge>
      {showStockSubtext && (
        <span className="text-[9px] text-gray-500 font-mono">
          Stock: {commitment.reserved_from_stock}
        </span>
      )}
    </div>
  );
}

/**
 * Get inventory state counts for summary strip.
 * CANONICAL: Uses backend needs_order flag as the single truth for "Needs Order" count.
 */
export function getInventoryStateCounts(items, isOrderingContext = false) {
  let installed = 0;
  let installReady = 0;
  let inStock = 0;
  let ordered = 0;
  let needsOrder = 0;
  let covered = 0;
  let partial = 0;
  
  items.forEach(item => {
    // CANONICAL: For "Needs Order" count, use backend flag exclusively
    if (item.needs_order === true) {
      needsOrder++;
      return;
    }
    
    const state = determineContextAwareState(item, isOrderingContext);
    if (state === 'INSTALLED') installed++;
    else if (state === 'INSTALL_READY') installReady++;
    else if (state === 'IN_STOCK') inStock++;
    else if (state === 'ORDERED') ordered++;
    else if (state === 'NEEDS_ORDER') needsOrder++;
    else if (state === 'COVERED') covered++;
    else if (state === 'PARTIAL') partial++;
  });
  
  return {
    installed,
    installReady,
    inStock: inStock + covered + installed,
    ordered: ordered + partial,
    needsOrder,
    covered,
    partial,
    partialStock: ordered + partial,
    outOfStock: needsOrder,
  };
}

export default InventoryStateBadgeSimple;