import React from "react";
import { cn } from "@/lib/utils";

/**
 * ExecutionDataBlock - SHARED Canonical Inventory Display Component
 * 
 * PHASE 4: Unified execution data display for PSM and GNO
 * 
 * CANONICAL FIELDS (from read model ONLY - NO local derivation):
 * - inventory_snapshot.physical_stock_global
 * - inventory_snapshot.reserved_global_active
 * - inventory_snapshot.reserved_this_project
 * - required_total
 * - to_order (computed gap - NEVER derive locally)
 * - on_order_qty / covered_from_po
 * - available_to_install
 * - coverage_status
 * 
 * FORMATTING:
 * - Monospace numbers
 * - Tight vertical spacing
 * - Muted labels
 * - NO derived math in component
 * 
 * Used by: ProjectSupplyManager, GlobalNeedToOrder
 */
export default function ExecutionDataBlock({ item, showCoveredBadge = false }) {
  const inv = item.inventory_snapshot || {};
  
  // CANONICAL: Read directly from read model - NO local computation
  const physical = inv.physical_stock_global ?? inv.physical ?? 0;
  const reservedGlobal = inv.reserved_global_active ?? inv.reserved ?? 0;
  const reservedProject = inv.reserved_this_project ?? item.reserved_from_stock ?? 0;
  const requiredTotal = item.required_total ?? 0;
  const toOrder = item.to_order ?? 0;
  const onOrderQty = item.on_order_qty ?? item.covered_from_po ?? 0;
  const qtyInstalled = item.qty_installed ?? 0;
  
  // Available to install - use read model value or compute if missing
  const availableToInstall = item.available_to_install ?? 
    Math.max(0, Math.min(physical - reservedGlobal + reservedProject, requiredTotal - qtyInstalled));
  
  // PHASE 5: Coverage badge for fully covered items
  const isCovered = item.coverage_status === 'FULL';
  
  return (
    <div className="bg-gray-900/50 rounded px-2 py-1.5 text-[10px] font-mono text-gray-400 space-y-0.5">
      <div className="flex justify-between gap-4">
        <span>Stock:</span>
        <span className="text-gray-300">{physical}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span>Reserved (G|P):</span>
        <span className="text-gray-300">{reservedGlobal} | {reservedProject}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span>Needed:</span>
        <span className="text-gray-300">{requiredTotal}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span>To Order:</span>
        <span className={toOrder > 0 ? "text-red-400 font-semibold" : "text-gray-500"}>{toOrder}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span>On Order:</span>
        <span className={onOrderQty > 0 ? "text-blue-400" : "text-gray-500"}>{onOrderQty}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span>Avail Install:</span>
        <span className={availableToInstall > 0 ? "text-emerald-400" : "text-gray-500"}>{availableToInstall}</span>
      </div>
      {isCovered && showCoveredBadge && (
        <div className="mt-1 pt-1 border-t border-gray-700">
          <span className="text-emerald-500 text-[9px]">✓ Covered</span>
        </div>
      )}
    </div>
  );
}

/**
 * PHASE 2: Development-only drift guard
 * 
 * Validates that read model data is consistent with expected invariants.
 * Logs warnings to console in development - does NOT throw in production.
 */
export function validateSupplyModelDrift(items, sourceName = 'Unknown') {
  if (process.env.NODE_ENV !== 'development') return;
  
  items.forEach(item => {
    const inv = item.inventory_snapshot || {};
    const availableGlobal = inv.available_global_active ?? inv.available ?? 0;
    const requiredTotal = item.required_total ?? 0;
    const toOrder = item.to_order ?? 0;
    const gapQty = item.gap_qty ?? toOrder;
    const coverageStatus = item.coverage_status;
    
    // INVARIANT 1: If available >= required_total, gap_qty must be 0
    if (availableGlobal >= requiredTotal && requiredTotal > 0 && gapQty > 0) {
      console.warn(`[SUPPLY DRIFT] ${sourceName}`, {
        id: item.commitment_id || item.id,
        required_total: requiredTotal,
        available: availableGlobal,
        gap_qty: gapQty,
        message: 'available >= required_total but gap_qty > 0'
      });
    }
    
    // INVARIANT 2: FULL coverage must have to_order = 0
    if (coverageStatus === 'FULL' && toOrder > 0) {
      console.warn(`[SUPPLY DRIFT] ${sourceName}`, {
        id: item.commitment_id || item.id,
        coverage_status: coverageStatus,
        to_order: toOrder,
        message: 'FULL coverage but to_order > 0'
      });
    }
    
    // INVARIANT 3: reserved_global >= reserved_this_project
    const reservedGlobal = inv.reserved_global_active ?? 0;
    const reservedProject = inv.reserved_this_project ?? item.reserved_from_stock ?? 0;
    if (reservedGlobal < reservedProject) {
      console.warn(`[SUPPLY DRIFT] ${sourceName}`, {
        id: item.commitment_id || item.id,
        reserved_global: reservedGlobal,
        reserved_project: reservedProject,
        message: 'reserved_global < reserved_this_project'
      });
    }
    
    // INVARIANT 4: to_order must be >= 0
    if (toOrder < 0) {
      console.warn(`[SUPPLY DRIFT] ${sourceName}`, {
        id: item.commitment_id || item.id,
        to_order: toOrder,
        message: 'to_order < 0'
      });
    }
  });
}