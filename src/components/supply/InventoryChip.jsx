import React from "react";
import { cn } from "@/lib/utils";
import { Package, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * InventoryChip - Compact display of part inventory state
 * 
 * Shows: Stock | Res | Avail | OnOrd | ToOrd
 * Highlights negative available (over-commitment)
 * 
 * @param {Object} snapshot - InventorySnapshot from view model
 * @param {boolean} compact - Show abbreviated version
 */
export default function InventoryChip({ snapshot, compact = false, className }) {
  if (!snapshot) {
    return (
      <span className={cn("text-xs text-gray-500", className)}>
        No inventory data
      </span>
    );
  }

  const {
    physical_stock = 0,
    reserved_total = 0,
    available = 0,
    on_order_total = 0,
    to_order_total = 0,
  } = snapshot;

  const isOverCommitted = available < 0;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
              isOverCommitted 
                ? "bg-red-900/30 text-red-400 border border-red-700/50" 
                : "bg-gray-800 text-gray-400 border border-gray-700",
              className
            )}>
              <Package className="w-3 h-3" />
              {physical_stock}
              {isOverCommitted && <AlertTriangle className="w-3 h-3 text-red-400" />}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-gray-900 border-gray-700">
            <InventoryChipExpanded snapshot={snapshot} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-2 text-xs font-mono",
      isOverCommitted ? "text-red-400" : "text-gray-400",
      className
    )}>
      <span className="text-gray-500">Stock</span>
      <span className="text-white">{physical_stock}</span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-500">Res</span>
      <span className="text-amber-400">{reserved_total}</span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-500">Avail</span>
      <span className={cn(isOverCommitted ? "text-red-400" : "text-green-400")}>
        {available}
      </span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-500">OnOrd</span>
      <span className="text-blue-400">{on_order_total}</span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-500">ToOrd</span>
      <span className="text-purple-400">{to_order_total}</span>
    </div>
  );
}

/**
 * InventoryChipExpanded - Full breakdown for tooltip/expanded view
 */
export function InventoryChipExpanded({ snapshot }) {
  if (!snapshot) return null;

  const {
    physical_stock = 0,
    reserved_total = 0,
    available = 0,
    on_order_total = 0,
    to_order_total = 0,
  } = snapshot;

  const isOverCommitted = available < 0;

  return (
    <div className="space-y-1.5 text-xs">
      <div className="font-medium text-white mb-2">Inventory Status</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-gray-400">Physical Stock:</span>
        <span className="text-white font-mono text-right">{physical_stock}</span>
        
        <span className="text-gray-400">Reserved:</span>
        <span className="text-amber-400 font-mono text-right">-{reserved_total}</span>
        
        <span className="text-gray-400">Available:</span>
        <span className={cn(
          "font-mono text-right font-medium",
          isOverCommitted ? "text-red-400" : "text-green-400"
        )}>
          {available}
        </span>
        
        <div className="col-span-2 border-t border-gray-700 my-1" />
        
        <span className="text-gray-400">On Order:</span>
        <span className="text-blue-400 font-mono text-right">{on_order_total}</span>
        
        <span className="text-gray-400">To Order:</span>
        <span className="text-purple-400 font-mono text-right">{to_order_total}</span>
      </div>
      
      {isOverCommitted && (
        <div className="flex items-center gap-1.5 mt-2 p-1.5 bg-red-900/30 rounded text-red-400">
          <AlertTriangle className="w-3 h-3" />
          <span>Over-committed by {Math.abs(available)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * InventoryChipRow - Row display for tables
 */
export function InventoryChipRow({ snapshot, className }) {
  if (!snapshot) return null;

  const {
    physical_stock = 0,
    reserved_total = 0,
    available = 0,
    on_order_total = 0,
    to_order_total = 0,
  } = snapshot;

  const isOverCommitted = available < 0;

  return (
    <div className={cn("flex items-center gap-3 text-xs", className)}>
      <div className="flex items-center gap-1">
        <span className="text-gray-500 w-10">Stock</span>
        <span className="text-white font-mono w-6 text-right">{physical_stock}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500 w-8">Res</span>
        <span className="text-amber-400 font-mono w-6 text-right">{reserved_total}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500 w-10">Avail</span>
        <span className={cn(
          "font-mono w-6 text-right",
          isOverCommitted ? "text-red-400" : "text-green-400"
        )}>
          {available}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500 w-12">OnOrd</span>
        <span className="text-blue-400 font-mono w-6 text-right">{on_order_total}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500 w-12">ToOrd</span>
        <span className="text-purple-400 font-mono w-6 text-right">{to_order_total}</span>
      </div>
    </div>
  );
}