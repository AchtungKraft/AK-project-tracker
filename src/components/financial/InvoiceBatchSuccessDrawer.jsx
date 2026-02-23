import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  FileText, 
  Download,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * InvoiceBatchSuccessDrawer - Success confirmation after batch creation
 * 
 * Shows:
 * - Success message with batch details
 * - Total amount created
 * - Quick actions (Export to QB, View Batch, Return)
 */
export default function InvoiceBatchSuccessDrawer({
  isOpen,
  onClose,
  batchData,
  onExportToQB,
  onViewBatch,
  onReturnToWorkbench,
}) {
  if (!batchData) return null;

  const {
    batches_created = 0,
    lines_created = 0,
    total_amount = 0,
    batch_id,
    invoice_number,
  } = batchData;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[400px] bg-gray-900 border-gray-700">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-white">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            Invoice Created
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Success Summary */}
          <div className="p-4 bg-green-900/20 border border-green-800/50 rounded-lg text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-2xl font-bold text-white mb-1">
              {formatCurrencyUSD(total_amount)}
            </p>
            <p className="text-sm text-gray-400">
              {lines_created} line items on {batches_created} invoice(s)
            </p>
          </div>

          {/* Batch Details */}
          {invoice_number && (
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Invoice #</span>
                <Badge className="bg-purple-600 text-white">{invoice_number}</Badge>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="space-y-2">
            <Button
              onClick={onExportToQB}
              className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
            >
              <Download className="w-4 h-4" />
              Export to QuickBooks
            </Button>
            
            <Button
              onClick={onViewBatch}
              variant="outline"
              className="w-full border-gray-600 gap-2"
            >
              <FileText className="w-4 h-4" />
              View Invoice Details
            </Button>
            
            <Button
              onClick={onReturnToWorkbench}
              variant="ghost"
              className="w-full gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Workbench
            </Button>
          </div>

          {/* Info */}
          <p className="text-xs text-gray-500 text-center">
            Commitment billing status has been updated to "invoiced"
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}