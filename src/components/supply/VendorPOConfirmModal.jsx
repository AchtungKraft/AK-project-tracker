import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, AlertTriangle, Building2, RefreshCw } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";

/**
 * VendorPOConfirmModal — Final confirmation before PO creation.
 */
export default function VendorPOConfirmModal({
  vendor, cart, etaDate, notes, totalCost, totalQty, zeroCostCount,
  isSubmitting, onConfirm, onClose,
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-green-400" />
            Confirm Purchase Order
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3 overflow-y-auto flex-1">
          {/* Vendor */}
          <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: vendor.color || '#3B82F6' }}
            >
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-medium">{vendor.vendor_name}</p>
              {etaDate && <p className="text-xs text-gray-500">ETA: {etaDate}</p>}
            </div>
          </div>

          {/* Zero cost warning */}
          {zeroCostCount > 0 && (
            <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  {zeroCostCount} line(s) have no cost
                </p>
                <p className="text-xs text-amber-400/70">
                  These will create PO lines with $0 unit cost.
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-blue-900/30 rounded-lg">
              <p className="text-2xl font-bold text-blue-400">{cart.length}</p>
              <p className="text-xs text-gray-400">Line Items</p>
            </div>
            <div className="p-3 bg-purple-900/30 rounded-lg">
              <p className="text-2xl font-bold text-purple-400">{totalQty}</p>
              <p className="text-xs text-gray-400">Total Qty</p>
            </div>
            <div className="p-3 bg-green-900/30 rounded-lg">
              <p className="text-lg font-bold text-emerald-400 font-mono">{formatCurrencyUSD(totalCost)}</p>
              <p className="text-xs text-gray-400">Est. Total</p>
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Line Items</p>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {cart.map((line, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center text-xs py-1.5 px-2 rounded",
                    line.unit_cost <= 0 ? "bg-red-900/20" : "bg-gray-800/30"
                  )}
                >
                  <span className="flex-1 truncate text-gray-300">{line.part_name}</span>
                  <span className="w-16 text-right font-mono text-gray-400">{line.qty}x</span>
                  <span className={cn(
                    "w-20 text-right font-mono",
                    line.unit_cost > 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {line.unit_cost > 0 ? formatCurrencyUSD(line.unit_cost) : '$0'}
                  </span>
                  <span className="w-24 text-right font-mono text-gray-400">
                    {formatCurrencyUSD(line.qty * line.unit_cost)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-gray-800">
          <Button variant="outline" onClick={onClose} className="border-gray-600" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting || cart.length === 0}
            className={zeroCostCount > 0 ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                {zeroCostCount > 0 ? 'Create Anyway' : 'Create PO'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}