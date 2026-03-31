import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Package } from "lucide-react";
import { getDisplayStatus, getDisplayStatusColor } from "./lifecycleDisplay";
import PricingIntegrityBadge from "./PricingIntegrityBadge";
import { formatCurrencyUSD } from "./pricingHelpers";
import { resolveVendorDisplay, resolveCategoryDisplay } from "./supplyResolvers";
import { validateInventoryConsistency } from "./inventoryResolver";

/**
 * SUPPLY ROW DATA CONTRACT
 * 
 * Every row MUST display:
 * 1. Part Name (clickable)
 * 2. Category (resolved name - NEVER ID)
 * 3. In Stock
 * 4. Reserved
 * 5. Needed (static, not editable)
 * 6. Cost (USD formatted)
 * 7. Retail (USD formatted)
 * 8. Display Lifecycle
 * 9. Vendor (resolved name - NEVER ID)
 * 10. Payment Status
 * 11. Coverage Indicator
 * 12. Pricing Warning Badge (only if not OK)
 * 
 * NOTHING may be conditionally hidden.
 * VENDOR/CATEGORY must NEVER display IDs.
 */

/**
 * Inventory Coverage Indicator
 * - COVERED BY STOCK: inventory_available >= commitment_quantity
 * - OUT OF STOCK: inventory_available = 0
 * - INSUFFICIENT STOCK: inventory_available < commitment_quantity
 */
function InventoryCoverageIndicator({ available, needed }) {
  if (available >= needed && needed > 0) {
    return (
      <span className="text-[10px] font-mono uppercase text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded">
        COVERED BY STOCK
      </span>
    );
  }
  
  if (available === 0) {
    return (
      <span className="text-[10px] font-mono uppercase text-gray-400 border-l-2 border-l-amber-700 bg-gray-900/60 px-1.5 py-0.5">
        OUT OF STOCK
      </span>
    );
  }
  
  return (
    <span className="text-[10px] font-mono uppercase text-gray-400 border-l-2 border-l-amber-600 bg-gray-900/60 px-1.5 py-0.5">
      INSUFFICIENT STOCK
    </span>
  );
}

/**
 * Desktop Row - Single line format
 * Part | Category | In Stock | Reserved | Needed | Cost | Retail | Status | Vendor | Payment | Coverage | Warning
 * 
 * MANDATORY DATA CONTRACT - Nothing may be hidden.
 * VENDOR/CATEGORY MUST show resolved names, NEVER IDs.
 */
export function DesktopSupplyRow({
  commitment,
  part,
  vendor,
  category,
  categoryLookup,
  vendorLookup,
  onPartClick,
  children, // For action buttons
  className,
}) {
  const displayStatus = getDisplayStatus(commitment?.commitment_status);
  const statusColor = getDisplayStatusColor(displayStatus);
  
  // ============================================================================
  // PHASE 2: CANONICAL INVENTORY VALUES
  // Use inventory_snapshot from read model - NO local calculations
  // "In Stock" = physical_stock (part level)
  // "Reserved" = GLOBAL reserved across ALL commitments (from read model)
  // "Needed" = required_total - qty_installed (what remains to fulfill)
  // ============================================================================
  const inStock = commitment?.inventory_snapshot?.physical ?? commitment?.inventory_snapshot?.physical_stock ?? part?.physical_stock ?? 0;
  const reserved = commitment?.inventory_snapshot?.reserved ?? commitment?.inventory_snapshot?.reserved_total ?? 0;
  const needed = commitment?.inventory_snapshot?.needed ?? Math.max(0, (commitment?.required_total ?? 0) - (commitment?.qty_installed ?? 0));
  const cost = commitment?.unit_cost_snapshot ?? commitment?.unit_cost ?? part?.cost ?? 0;
  const retail = commitment?.unit_retail_snapshot ?? commitment?.unit_retail ?? 0;
  const paymentStatus = commitment?.billing_status ?? commitment?.payment_status ?? 'billable';
  const available = commitment?.inventory_snapshot?.available ?? 0;
  
  // PHASE 7: DEV GUARD - Validate inventory consistency
  if (import.meta.env.DEV) {
    const displayed = { in_stock: inStock, reserved, available };
    const canonical = { physical_stock: inStock, reserved_global: reserved, available_global: available };
    validateInventoryConsistency('DesktopSupplyRow', commitment?.part_id, displayed, canonical);
  }
  
  // RESOLVE NAMES - Never display IDs
  const resolvedVendor = resolveVendorDisplay(
    commitment?.vendor_id || vendor?.id,
    vendor || commitment?.vendor_name,
    vendorLookup
  );
  const resolvedCategory = resolveCategoryDisplay(
    commitment?.category_id || part?.part_category_id,
    category || commitment?.category_name,
    categoryLookup
  );
  
  return (
    <tr className={cn("hover:bg-gray-800/30 border-b border-gray-800/50", className)}>
      {/* Part Name - clickable */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {part?.featured_photo ? (
            <img 
              src={part.featured_photo} 
              alt="" 
              className="w-8 h-8 rounded bg-gray-800 object-contain flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-gray-600" />
            </div>
          )}
          <button
            onClick={() => onPartClick?.(part, commitment)}
            className="text-left text-sm font-medium text-white hover:text-gray-300 transition-colors truncate"
          >
            {part?.part_name || commitment?.part_name || 'Unknown Part'}
          </button>
        </div>
      </td>
      
      {/* Category - RESOLVED NAME, never ID */}
      <td className="px-2 py-2">
        <span className="text-xs text-gray-400 truncate max-w-[100px] block">
          {resolvedCategory.name}
        </span>
      </td>
      
      {/* In Stock */}
      <td className="px-2 py-2 text-center">
        <span className="text-sm font-mono text-gray-300">{inStock}</span>
      </td>
      
      {/* Reserved */}
      <td className="px-2 py-2 text-center">
        <span className={cn(
          "text-sm font-mono",
          reserved > 0 ? "text-cyan-400" : "text-gray-500"
        )}>
          {reserved}
        </span>
      </td>
      
      {/* Needed - STATIC, no inline editing */}
      <td className="px-2 py-2 text-center">
        <span className="text-sm font-mono text-white">{needed}</span>
      </td>
      
      {/* Cost */}
      <td className="px-2 py-2 text-right">
        <span className="text-sm font-mono text-gray-300">
          {formatCurrencyUSD(cost)}
        </span>
      </td>
      
      {/* Retail */}
      <td className="px-2 py-2 text-right">
        <span className="text-sm font-mono text-gray-300">
          {formatCurrencyUSD(retail)}
        </span>
      </td>
      
      {/* Display Lifecycle */}
      <td className="px-2 py-2">
        <span className={cn(
          "text-[10px] font-mono uppercase px-1.5 py-0.5 border-l-2 bg-gray-900/50 whitespace-nowrap",
          statusColor
        )}>
          {displayStatus}
        </span>
      </td>
      
      {/* Vendor - RESOLVED NAME, never ID */}
      <td className="px-2 py-2">
        <span className="text-xs text-gray-400 truncate max-w-[100px] block">
          {resolvedVendor.name}
        </span>
      </td>
      
      {/* Payment Status */}
      <td className="px-2 py-2">
        <span className={cn(
          "text-[10px] font-mono uppercase",
          paymentStatus === 'invoiced' || paymentStatus === 'paid' ? 'text-gray-500' : 'text-amber-500'
        )}>
          {paymentStatus}
        </span>
      </td>
      
      {/* Coverage Indicator */}
      <td className="px-2 py-2">
        <InventoryCoverageIndicator available={available} needed={needed} />
      </td>
      
      {/* Pricing Warning (only if not OK) */}
      <td className="px-2 py-2">
        <PricingIntegrityBadge commitment={commitment} />
      </td>
      
      {/* Actions */}
      <td className="px-2 py-2">
        {children}
      </td>
    </tr>
  );
}

/**
 * Mobile Supply Card - Expandable
 * 
 * MANDATORY DATA CONTRACT - Nothing may be hidden:
 * 1. Part Name (clickable)
 * 2. Category (resolved name)
 * 3. In Stock
 * 4. Reserved
 * 5. Needed
 * 6. Cost (USD formatted)
 * 7. Retail (USD formatted)
 * 8. Display Lifecycle
 * 9. Vendor (resolved name)
 * 10. Payment Status
 * 11. Coverage Indicator
 * 12. Pricing Warning Badge (only if not OK)
 * 
 * VENDOR/CATEGORY must NEVER display IDs.
 */
export function MobileSupplyCard({
  commitment,
  part,
  vendor,
  category,
  categoryLookup,
  vendorLookup,
  onPartClick,
  children, // For action buttons
  className,
}) {
  const [expanded, setExpanded] = useState(false);
  
  const displayStatus = getDisplayStatus(commitment?.commitment_status);
  const statusColor = getDisplayStatusColor(displayStatus);
  
  // ============================================================================
  // PHASE 2: CANONICAL INVENTORY VALUES (Mobile Card)
  // Use inventory_snapshot from read model - NO local calculations
  // "In Stock" = physical_stock (part level)
  // "Reserved" = GLOBAL reserved across ALL commitments (from read model)
  // "Needed" = required_total - qty_installed (what remains to fulfill)
  // ============================================================================
  const inStock = commitment?.inventory_snapshot?.physical ?? commitment?.inventory_snapshot?.physical_stock ?? part?.physical_stock ?? 0;
  const reserved = commitment?.inventory_snapshot?.reserved ?? commitment?.inventory_snapshot?.reserved_total ?? 0;
  const needed = commitment?.inventory_snapshot?.needed ?? Math.max(0, (commitment?.required_total ?? 0) - (commitment?.qty_installed ?? 0));
  const cost = commitment?.unit_cost_snapshot ?? commitment?.unit_cost ?? part?.cost ?? 0;
  const retail = commitment?.unit_retail_snapshot ?? commitment?.unit_retail ?? 0;
  const paymentStatus = commitment?.billing_status ?? commitment?.payment_status ?? 'billable';
  const available = commitment?.inventory_snapshot?.available ?? 0;
  
  // PHASE 7: DEV GUARD - Validate inventory consistency
  if (import.meta.env.DEV) {
    const displayed = { in_stock: inStock, reserved, available };
    const canonical = { physical_stock: inStock, reserved_global: reserved, available_global: available };
    validateInventoryConsistency('MobileSupplyCard', commitment?.part_id, displayed, canonical);
  }
  
  // RESOLVE NAMES - Never display IDs
  const resolvedVendor = resolveVendorDisplay(
    commitment?.vendor_id || vendor?.id,
    vendor || commitment?.vendor_name,
    vendorLookup
  );
  const resolvedCategory = resolveCategoryDisplay(
    commitment?.category_id || part?.part_category_id,
    category || commitment?.category_name,
    categoryLookup
  );
  
  // Extended fields for expanded view
  const ordered = commitment?.covered_from_po ?? commitment?.qty_ordered ?? commitment?.on_order_qty ?? 0;
  const received = commitment?.qty_received ?? commitment?.received_qty ?? 0;
  const installed = commitment?.qty_installed ?? 0;
  
  return (
    <div className={cn(
      "bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden",
      className
    )}>
      {/* Collapsed View - MANDATORY DATA */}
      <div 
        className="p-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Row 1: Part Name + Status + Expand Toggle */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPartClick?.(part, commitment);
            }}
            className="text-left text-sm font-medium text-white hover:text-gray-300 truncate flex-1"
          >
            {part?.part_name || commitment?.part_name || 'Unknown Part'}
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "text-[10px] font-mono uppercase px-1.5 py-0.5 border-l-2 bg-gray-800/50",
              statusColor
            )}>
              {displayStatus}
            </span>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </div>
        </div>
        
        {/* Row 2: Inventory - Stock / Reserved / Need */}
        <div className="flex items-center gap-4 text-xs mb-2">
          <span className="text-gray-500">
            Stock <span className="text-gray-300 font-mono">{inStock}</span>
          </span>
          <span className="text-gray-500">
            Reserved <span className={cn("font-mono", reserved > 0 ? "text-cyan-400" : "text-gray-400")}>{reserved}</span>
          </span>
          <span className="text-gray-500">
            Need <span className="text-white font-mono">{needed}</span>
          </span>
        </div>
        
        {/* Row 3: Cost / Retail */}
        <div className="flex items-center gap-4 text-xs mb-2">
          <span className="text-gray-500">
            Cost <span className="text-gray-300 font-mono">{formatCurrencyUSD(cost)}</span>
          </span>
          <span className="text-gray-500">
            Retail <span className="text-gray-300 font-mono">{formatCurrencyUSD(retail)}</span>
          </span>
        </div>
        
        {/* Row 4: Category / Vendor / Payment / Coverage / Warning */}
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="text-gray-400 truncate max-w-[80px]">{resolvedCategory.name}</span>
          <span className="text-gray-400 truncate max-w-[80px]">{resolvedVendor.name}</span>
          <span className={cn(
            "font-mono uppercase text-[10px]",
            paymentStatus === 'invoiced' || paymentStatus === 'paid' ? 'text-gray-500' : 'text-amber-500'
          )}>
            {paymentStatus}
          </span>
          <InventoryCoverageIndicator available={available} needed={needed} />
          <PricingIntegrityBadge commitment={commitment} />
        </div>
      </div>
      
      {/* Expanded View */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-800/50 space-y-3">
          {/* Exact Lifecycle State */}
          <div className="flex items-center justify-between text-xs pt-2">
            <span className="text-gray-500">Exact Status:</span>
            <span className="text-gray-300 font-mono uppercase">
              {commitment?.commitment_status || 'unknown'}
            </span>
          </div>
          
          {/* Quantity Breakdown */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-gray-800/40 rounded p-2">
              <p className="text-[10px] text-gray-500 uppercase">Ordered</p>
              <p className="text-sm font-mono text-gray-300">{ordered}</p>
            </div>
            <div className="bg-gray-800/40 rounded p-2">
              <p className="text-[10px] text-gray-500 uppercase">Received</p>
              <p className="text-sm font-mono text-gray-300">{received}</p>
            </div>
            <div className="bg-gray-800/40 rounded p-2">
              <p className="text-[10px] text-gray-500 uppercase">Installed</p>
              <p className="text-sm font-mono text-gray-300">{installed}</p>
            </div>
            <div className="bg-gray-800/40 rounded p-2">
              <p className="text-[10px] text-gray-500 uppercase">Remaining</p>
              <p className="text-sm font-mono text-gray-300">{needed - installed}</p>
            </div>
          </div>
          
          {/* Pricing Details */}
          <div className="bg-gray-800/30 rounded p-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Unit Cost</span>
              <span className="text-gray-300 font-mono">{formatCurrencyUSD(cost)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Unit Retail</span>
              <span className="text-gray-300 font-mono">{formatCurrencyUSD(retail)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Line Total (Retail)</span>
              <span className="text-gray-300 font-mono">{formatCurrencyUSD(retail * needed)}</span>
            </div>
            {retail > 0 && cost > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Margin</span>
                <span className={cn(
                  "font-mono",
                  retail > cost ? "text-gray-300" : "text-amber-500"
                )}>
                  {(((retail - cost) / retail) * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          
          {/* Notes */}
          {commitment?.notes && (
            <div className="text-xs text-gray-500 italic">
              {commitment.notes}
            </div>
          )}
          
          {/* Action Buttons */}
          {children && (
            <div className="pt-2 border-t border-gray-800/50">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Table Header Row for Desktop
 * Column order: Part | Category | In Stock | Reserved | Needed | Cost | Retail | Status | Vendor | Payment | Coverage | Pricing | Actions
 */
export function SupplyTableHeader({ showCheckbox = false, showActions = true }) {
  return (
    <tr className="border-b border-gray-800 bg-gray-900/50">
      {showCheckbox && <th className="px-3 py-2 w-10"></th>}
      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Part</th>
      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">In Stock</th>
      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Reserved</th>
      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Needed</th>
      <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
      <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Retail</th>
      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coverage</th>
      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pricing</th>
      {showActions && <th className="px-2 py-2 w-10"></th>}
    </tr>
  );
}