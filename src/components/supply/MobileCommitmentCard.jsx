import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayStatus, getDisplayStatusColor } from "./lifecycleDisplay";
import PricingIntegrityBadge, { hasPricingWarning } from "./PricingIntegrityBadge";
import { formatCurrency } from "./pricingHelpers";

/**
 * MobileCommitmentCard - Industrial Expandable Card
 * 
 * Mobile-first design. No horizontal scroll tables.
 * Collapsed: Part Name, Status, Cost, Retail, Vendor, Payment, Warning
 * Expanded: Full quantities, pricing details
 */
export default function MobileCommitmentCard({
  commitment,
  part,
  vendor,
  onPartClick,
  onAction,
  isLoading = false,
  className
}) {
  const [expanded, setExpanded] = useState(false);
  
  const displayStatus = getDisplayStatus(commitment?.commitment_status);
  const statusColor = getDisplayStatusColor(displayStatus);
  const hasWarning = hasPricingWarning(commitment);
  
  // Computed values
  const cost = commitment?.unit_cost_snapshot || part?.cost || 0;
  const retail = commitment?.unit_retail_snapshot || 0;
  const paymentStatus = commitment?.payment_status || 'unpaid';
  const vendorName = vendor?.vendor_name || 'Unknown';
  
  // Inventory status summary
  const qtyCommitted = commitment?.qty_committed || commitment?.required_total || 0;
  const qtyOrdered = commitment?.qty_ordered || 0;
  const qtyReceived = commitment?.qty_received || 0;
  const qtyInstalled = commitment?.qty_installed || 0;
  
  const inventoryStatus = qtyInstalled > 0 
    ? `${qtyInstalled}/${qtyCommitted} installed`
    : qtyReceived > 0
      ? `${qtyReceived}/${qtyOrdered} received`
      : qtyOrdered > 0
        ? `${qtyOrdered} ordered`
        : `${qtyCommitted} needed`;

  return (
    <Card className={cn(
      "bg-gray-900/60 border-gray-800 transition-all",
      hasWarning && "border-l-2 border-l-amber-600",
      className
    )}>
      <CardContent className="p-0">
        {/* Collapsed View - Always Visible */}
        <div 
          className="p-3 cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start justify-between gap-2">
            {/* Left: Part info */}
            <div className="flex-1 min-w-0">
              {/* Part Name - clickable */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPartClick?.(part);
                }}
                className="text-left text-sm font-medium text-white hover:text-gray-300 truncate block w-full"
              >
                {part?.part_name || 'Unknown Part'}
              </button>
              
              {/* Inventory Status */}
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                {inventoryStatus}
              </p>
            </div>
            
            {/* Right: Status + Expand */}
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
          
          {/* Row 2: Cost, Retail, Vendor, Payment, Warning */}
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="text-gray-500">
              C: <span className="text-gray-300 font-mono">{formatCurrency(cost)}</span>
            </span>
            <span className="text-gray-500">
              R: <span className="text-gray-300 font-mono">{formatCurrency(retail)}</span>
            </span>
            <span className="text-gray-500 truncate max-w-[80px]">
              {vendorName}
            </span>
            <span className={cn(
              "font-mono uppercase text-[10px]",
              paymentStatus === 'paid' ? 'text-gray-500' : 'text-amber-500'
            )}>
              {paymentStatus}
            </span>
            
            {/* Pricing Warning */}
            {hasWarning && (
              <PricingIntegrityBadge commitment={commitment} className="ml-auto" />
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
                <p className="text-[10px] text-gray-500 uppercase">Committed</p>
                <p className="text-sm font-mono text-white">{qtyCommitted}</p>
              </div>
              <div className="bg-gray-800/40 rounded p-2">
                <p className="text-[10px] text-gray-500 uppercase">Ordered</p>
                <p className="text-sm font-mono text-gray-300">{qtyOrdered}</p>
              </div>
              <div className="bg-gray-800/40 rounded p-2">
                <p className="text-[10px] text-gray-500 uppercase">Received</p>
                <p className="text-sm font-mono text-gray-300">{qtyReceived}</p>
              </div>
              <div className="bg-gray-800/40 rounded p-2">
                <p className="text-[10px] text-gray-500 uppercase">Installed</p>
                <p className="text-sm font-mono text-gray-300">{qtyInstalled}</p>
              </div>
            </div>
            
            {/* Pricing Details */}
            <div className="bg-gray-800/30 rounded p-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Unit Cost</span>
                <span className="text-gray-300 font-mono">{formatCurrency(cost)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Unit Retail</span>
                <span className="text-gray-300 font-mono">{formatCurrency(retail)}</span>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}