import React from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, X, Package, Wrench, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PSMFloatingActionBar - Floating action bar for batch operations
 * 
 * Shows when items are selected, with context-aware actions based on tab
 */
export default function PSMFloatingActionBar({
  selectedCount,
  onClear,
  onBatchPO,
  onBatchReceive,
  onBatchInstall,
  onBatchInvoice,
  isLoading = false,
  tab = 'plan',
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 md:left-auto md:right-6 md:translate-x-0">
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl",
        "bg-gray-900 border border-gray-700",
        "backdrop-blur-xl"
      )}>
        {/* Selection Count */}
        <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
          <span className="text-white font-medium">{selectedCount}</span>
          <span className="text-gray-400 text-sm">selected</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            className="h-6 w-6 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tab-specific Actions */}
        {(tab === 'plan' || tab === 'buy') && onBatchPO && (
          <Button
            onClick={onBatchPO}
            disabled={isLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            Create Batch PO ({selectedCount})
          </Button>
        )}

        {tab === 'receive' && onBatchReceive && (
          <Button
            onClick={onBatchReceive}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Package className="w-4 h-4" />
            Receive Selected ({selectedCount})
          </Button>
        )}

        {tab === 'install' && onBatchInstall && (
          <Button
            onClick={onBatchInstall}
            disabled={isLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Wrench className="w-4 h-4" />
            Install Selected ({selectedCount})
          </Button>
        )}

        {tab === 'invoice' && onBatchInvoice && (
          <Button
            onClick={onBatchInvoice}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Receipt className="w-4 h-4" />
            Add to Invoice ({selectedCount})
          </Button>
        )}
      </div>
    </div>
  );
}