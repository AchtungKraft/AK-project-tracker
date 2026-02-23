import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * InvoiceBatchPreviewModal - Preview selected items before creating invoice batch
 * 
 * Shows:
 * - List of selected items with pricing
 * - Blocked items with reasons
 * - Total amount summary
 * - Confirm/Cancel actions
 */
export default function InvoiceBatchPreviewModal({
  isOpen,
  onClose,
  selectedItems = [],
  blockedItems = [],
  batchMode = "single",
  onConfirm,
  onFixItem,
  isCreating = false,
}) {
  const readyItems = selectedItems.filter(item => (item.unit_retail || 0) > 0);
  const totalAmount = readyItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
  const hasBlockedItems = blockedItems.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-green-400" />
            Invoice Preview
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
            <div>
              <p className="text-sm text-gray-400">Ready to Invoice</p>
              <p className="text-lg font-bold text-green-400">{readyItems.length} items</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Total Amount</p>
              <p className="text-xl font-bold text-white">{formatCurrencyUSD(totalAmount)}</p>
            </div>
          </div>

          {/* Blocked Items Warning */}
          {hasBlockedItems && (
            <div className="p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">
                  {blockedItems.length} items cannot be invoiced
                </span>
              </div>
              <ScrollArea className="max-h-32">
                {blockedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-gray-300">{item.part_name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onFixItem?.(item)}
                      className="text-xs text-amber-400 hover:text-amber-300 h-6"
                    >
                      Fix
                    </Button>
                  </div>
                ))}
              </ScrollArea>
            </div>
          )}

          {/* Ready Items List */}
          <ScrollArea className="max-h-64">
            <div className="space-y-1">
              {readyItems.map((item, idx) => (
                <div
                  key={item.commitment_id || idx}
                  className="flex items-center justify-between p-2 bg-gray-800/30 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.part_name}</p>
                    <p className="text-xs text-gray-500">{item.project_name}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-medium text-green-400">
                      {formatCurrencyUSD(item.line_total || 0)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.required_total || 0} × {formatCurrencyUSD(item.unit_retail || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Batch Mode Info */}
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <Badge variant="outline" className="border-gray-600">
              {batchMode === "single" ? "Single Invoice" : "Per-Project Invoices"}
            </Badge>
            <span>
              {batchMode === "single" 
                ? "All items on one invoice" 
                : "Separate invoice per project"}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isCreating}
            className="border-gray-600"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isCreating || readyItems.length === 0}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Create Invoice ({readyItems.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}