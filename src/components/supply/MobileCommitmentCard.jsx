import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayStatus, getDisplayStatusColor } from "./lifecycleDisplay";
import PricingIntegrityBadge, { hasPricingWarning } from "./PricingIntegrityBadge";
import { formatCurrencyUSD } from "./pricingHelpers";
import { resolveVendorDisplay, resolveCategoryDisplay } from "./supplyResolvers";
import { validateInventoryConsistency } from "./inventoryResolver";

/**
 * MobileCommitmentCard - Industrial Expandable Card
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

/**
 * Inventory Coverage Indicator
 */
function InventoryCoverageIndicator({ available, needed }) {
  if (available >= needed && needed > 0) {
    return (
      <span className="text-[10px] font-mono uppercase text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded">
        COVERED
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
      INSUFFICIENT
    </span>
  );
}

export default function MobileCommitmentCard({
  commitment,
  part,
  vendor,
  category,
  categoryLookup,
  vendorLookup,
  onPartClick,
  onAction,
  isLoading = false,
  className,
  children,
}) {
  const [expanded, setExpanded] = useState(false);
  
  const displayStatus = getDisplayStatus(commitment?.commitment_status);
  const statusColor = getDisplayStatusColor(displayStatus);
  const hasWarning = hasPricingWarning(commitment);
  
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
  if (process.env.NODE_ENV === 'development') {
    const displayed = { in_stock: inStock, reserved, available };
    const canonical = { physical_stock: inStock, reserved_global: reserved, available_global: available };
    validateInventoryConsistency('MobileCommitmentCard', commitment?.part_id, displayed, canonical);
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
  const received = commitment?.received_qty ?? commitment?.qty_received ?? 0;
  const installed = commitment?.qty_installed ?? 0;

  return (
    <Card className={cn(
      "bg-gray-900/60 border-gray-800 transition-all",
      hasWarning && "border-l-2 border-l-amber-600",
      className
    )}>
      <CardContent className="p-0">
        {/* Collapsed View - MANDATORY DATA */}
        <div 
          className="p-3 cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
        >
          {/* Row 1: Part Name + Status + Expand */}
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
          
          {/* Row 2: Inventory - Stock | Reserved | Need */}
          <div className="flex items-center gap-4 text-xs mb-2">
            <span className="text-gray-500">
              Stock <span className="text-gray-300 font-mono">{inStock}</span>
            </span>
            <span className="text-gray-500">
              Reserved <span className={cn("font-mono", reserved > 0 ? "text-cyan-400" : "text-gray-500")}>{reserved}</span>
            </span>
            <span className="text-gray-500">
              Need <span className="text-white font-mono">{needed}</span>
            </span>
          </div>
          
          {/* Row 3: Cost | Retail */}
          <div className="flex items-center gap-4 text-xs mb-2">
            <span className="text-gray-500">
              Cost <span className="text-gray-300 font-mono">{formatCurrencyUSD(cost)}</span>
            </span>
            <span className="text-gray-500">
              Retail <span className="text-gray-300 font-mono">{formatCurrencyUSD(retail)}</span>
            </span>
          </div>
          
          {/* Row 4: Category | Vendor | Payment | Coverage | Warning */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <span className="text-gray-400 truncate max-w-[80px]">
              {resolvedCategory.name}
            </span>
            <span className="text-gray-400 truncate max-w-[80px]">
              {resolvedVendor.name}
            </span>
            <span className={cn(
              "font-mono uppercase text-[10px]",
              paymentStatus === 'invoiced' || paymentStatus === 'paid' ? 'text-gray-500' : 'text-amber-500'
            )}>
              {paymentStatus}
            </span>
            <InventoryCoverageIndicator available={available} needed={needed} />
            {hasWarning && (
              <PricingIntegrityBadge commitment={commitment} />
            )}
          </div>
        </div>
        
        {/* Expanded View */}
        {expanded && (
          <div className="px-3 pb-3 pt-0 border-t border-gray-800/50 space-y-3">
            {/* Exact Status */}
            <div className="flex items-center justify-between text-xs pt-2">
              <span className="text-gray-500">Exact Status:</span>
              <span className="text-gray-300 font-mono uppercase">
                {commitment?.commitment_status || 'unknown'}
              </span>
            </div>
            
            {/* Quantity Grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-gray-800/40 rounded p-2">
                <p className="text-[10px] text-gray-500 uppercase">Need</p>
                <p className="text-sm font-mono text-white">{needed}</p>
              </div>
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
              {commitment?.retail_adjustment_request_id && (
                <div className="flex items-center gap-1 text-xs text-amber-500 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="font-mono uppercase">Open Adjustment Request</span>
                </div>
              )}
            </div>
            
            {/* Actions (children) */}
            {children && (
              <div className="pt-2 border-t border-gray-800/50">
                {children}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}