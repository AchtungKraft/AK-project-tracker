/**
 * CanonicalQuantityDisplay - Standardized Inventory/Commitment Display
 * 
 * This component renders supply quantities using the canonical field names.
 * ALL supply displays MUST use this component to ensure consistency.
 * 
 * Commitment Display:
 * - Required (required_total)
 * - Reserved (reserved_from_stock) 
 * - On Order (covered_from_po)
 * - To Order (gap)
 * - Received Not Installed
 * - Installed (qty_installed)
 * 
 * Inventory Display:
 * - In Stock (physical_stock)
 * - Reserved (allocated_stock)
 * - Available (physical_stock - allocated_stock)
 * - On Order (on_order)
 * - To Order (global_gap)
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Package, ShoppingCart, Truck, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Commitment quantity display for project views
 */
export function CommitmentQuantityRow({ state, compact = false, className }) {
  if (!state) return null;
  
  const required = state.required_total ?? 0;
  const reserved = state.reserved_from_stock ?? 0;
  const onOrder = state.covered_from_po ?? 0;
  const toOrder = state.gap ?? 0;
  const installed = state.qty_installed ?? 0;
  const receivedNotInstalled = Math.max(0, reserved + (state.legacy?.qty_received ?? 0) - installed);
  
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-xs", className)}>
        <span className="text-gray-400">Req: <span className="text-white">{required}</span></span>
        {reserved > 0 && <span className="text-blue-400">Rsv: {reserved}</span>}
        {onOrder > 0 && <span className="text-purple-400">Ord: {onOrder}</span>}
        {toOrder > 0 && <span className="text-red-400">Gap: {toOrder}</span>}
        {installed > 0 && <span className="text-green-400">Inst: {installed}</span>}
      </div>
    );
  }
  
  return (
    <div className={cn("grid grid-cols-6 gap-2 text-center text-xs", className)}>
      <div className="bg-gray-800/50 rounded p-2">
        <div className="text-gray-500 mb-1">Required</div>
        <div className="text-white font-medium">{required}</div>
      </div>
      <div className="bg-blue-900/30 rounded p-2">
        <div className="text-blue-400/70 mb-1">Reserved</div>
        <div className="text-blue-300 font-medium">{reserved}</div>
      </div>
      <div className="bg-purple-900/30 rounded p-2">
        <div className="text-purple-400/70 mb-1">On Order</div>
        <div className="text-purple-300 font-medium">{onOrder}</div>
      </div>
      <div className={cn("rounded p-2", toOrder > 0 ? "bg-red-900/30" : "bg-gray-800/50")}>
        <div className={cn("mb-1", toOrder > 0 ? "text-red-400/70" : "text-gray-500")}>To Order</div>
        <div className={cn("font-medium", toOrder > 0 ? "text-red-300" : "text-gray-400")}>{toOrder}</div>
      </div>
      <div className="bg-yellow-900/30 rounded p-2">
        <div className="text-yellow-400/70 mb-1">Received</div>
        <div className="text-yellow-300 font-medium">{receivedNotInstalled}</div>
      </div>
      <div className="bg-green-900/30 rounded p-2">
        <div className="text-green-400/70 mb-1">Installed</div>
        <div className="text-green-300 font-medium">{installed}</div>
      </div>
    </div>
  );
}

/**
 * Inventory quantity display for part views
 */
export function InventoryQuantityRow({ state, compact = false, className }) {
  if (!state) return null;
  
  const inStock = state.physical_stock ?? 0;
  const reserved = state.allocated_stock ?? 0;
  const available = state.available_stock ?? 0;
  const onOrder = state.on_order ?? 0;
  const toOrder = state.global_gap ?? 0;
  
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-xs", className)}>
        <span className="text-gray-400">Stock: <span className="text-white">{inStock}</span></span>
        {reserved > 0 && <span className="text-blue-400">Rsv: {reserved}</span>}
        <span className="text-green-400">Avail: {available}</span>
        {onOrder > 0 && <span className="text-purple-400">Ord: {onOrder}</span>}
        {toOrder > 0 && <span className="text-red-400">Gap: {toOrder}</span>}
      </div>
    );
  }
  
  return (
    <div className={cn("grid grid-cols-5 gap-2 text-center text-xs", className)}>
      <div className="bg-gray-800/50 rounded p-2">
        <div className="text-gray-500 mb-1">In Stock</div>
        <div className="text-white font-medium">{inStock}</div>
      </div>
      <div className="bg-blue-900/30 rounded p-2">
        <div className="text-blue-400/70 mb-1">Reserved</div>
        <div className="text-blue-300 font-medium">{reserved}</div>
      </div>
      <div className="bg-green-900/30 rounded p-2">
        <div className="text-green-400/70 mb-1">Available</div>
        <div className="text-green-300 font-medium">{available}</div>
      </div>
      <div className="bg-purple-900/30 rounded p-2">
        <div className="text-purple-400/70 mb-1">On Order</div>
        <div className="text-purple-300 font-medium">{onOrder}</div>
      </div>
      <div className={cn("rounded p-2", toOrder > 0 ? "bg-red-900/30" : "bg-gray-800/50")}>
        <div className={cn("mb-1", toOrder > 0 ? "text-red-400/70" : "text-gray-500")}>To Order</div>
        <div className={cn("font-medium", toOrder > 0 ? "text-red-300" : "text-gray-400")}>{toOrder}</div>
      </div>
    </div>
  );
}

/**
 * Coverage status badge using canonical status
 */
export function CoverageStatusBadge({ status, className }) {
  const config = {
    FULLY_COVERED: { label: 'Covered', color: 'bg-green-600', icon: CheckCircle2 },
    PARTIALLY_COVERED: { label: 'Partial', color: 'bg-yellow-600', icon: AlertTriangle },
    NOT_COVERED: { label: 'Uncovered', color: 'bg-red-600', icon: AlertTriangle }
  }[status] || { label: status, color: 'bg-gray-600', icon: Package };
  
  const Icon = config.icon;
  
  return (
    <Badge className={cn(config.color, "text-white gap-1", className)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

/**
 * Lifecycle state badge using canonical states
 */
export function LifecycleStateBadge({ state, className }) {
  const config = {
    INSTALLED: { label: 'Installed', color: 'bg-green-600', icon: Wrench },
    COVERED: { label: 'Covered', color: 'bg-blue-600', icon: CheckCircle2 },
    NEEDS_ORDER: { label: 'Needs Order', color: 'bg-red-600', icon: ShoppingCart },
    PLANNED: { label: 'Planned', color: 'bg-gray-600', icon: Package }
  }[state] || { label: state, color: 'bg-gray-600', icon: Package };
  
  const Icon = config.icon;
  
  return (
    <Badge className={cn(config.color, "text-white gap-1", className)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

/**
 * Invariant warning display
 */
export function InvariantWarnings({ invariants, className }) {
  if (!invariants?.length) return null;
  
  const errors = invariants.filter(i => i.severity === 'error');
  const warnings = invariants.filter(i => i.severity === 'warning');
  
  if (errors.length === 0 && warnings.length === 0) return null;
  
  return (
    <div className={cn("space-y-1", className)}>
      {errors.map((inv, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">
          <AlertTriangle className="w-3 h-3" />
          {inv.message}
        </div>
      ))}
      {warnings.map((inv, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded">
          <AlertTriangle className="w-3 h-3" />
          {inv.message}
        </div>
      ))}
    </div>
  );
}

export default {
  CommitmentQuantityRow,
  InventoryQuantityRow,
  CoverageStatusBadge,
  LifecycleStateBadge,
  InvariantWarnings
};