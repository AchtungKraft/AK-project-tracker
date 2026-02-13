import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle2, 
  FileText, 
  DollarSign, 
  Upload,
  Eye,
  ArrowLeft,
  Clock,
  Users,
  FolderOpen,
  ExternalLink,
  Copy,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import PaymentTimeline from "./PaymentTimeline";

// ============================================
// TIMELINE STEP
// ============================================

function TimelineStep({ icon: Icon, label, status, isLast }) {
  const statusConfig = {
    complete: { color: 'text-green-400', bgColor: 'bg-green-600/20', lineColor: 'bg-green-600' },
    current: { color: 'text-yellow-400', bgColor: 'bg-yellow-600/20', lineColor: 'bg-gray-700' },
    pending: { color: 'text-gray-500', bgColor: 'bg-gray-800', lineColor: 'bg-gray-700' },
  }[status] || statusConfig.pending;

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", statusConfig.bgColor)}>
          <Icon className={cn("w-4 h-4", statusConfig.color)} />
        </div>
        {!isLast && (
          <div className={cn("w-0.5 h-8 mt-1", statusConfig.lineColor)} />
        )}
      </div>
      <div className="pt-1">
        <p className={cn("text-sm font-medium", statusConfig.color)}>{label}</p>
      </div>
    </div>
  );
}

// ============================================
// NEXT STEP CARD
// ============================================

function NextStepCard({ title, description, icon: Icon, onClick, variant = 'primary' }) {
  const variants = {
    primary: "bg-green-950/30 border-green-900/30 hover:bg-green-950/50",
    secondary: "bg-gray-800/50 border-gray-700 hover:bg-gray-800",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-4 rounded-lg border text-left transition-all",
        variants[variant]
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          variant === 'primary' ? "bg-green-600/20" : "bg-gray-700"
        )}>
          <Icon className={cn("w-5 h-5", variant === 'primary' ? "text-green-400" : "text-gray-400")} />
        </div>
        <div>
          <p className="text-white font-medium">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}

// ============================================
// MAIN DRAWER
// ============================================

export default function InvoiceBatchSuccessDrawer({
  isOpen,
  onClose,
  batchData,
  onExportToQB,
  onViewBatch,
  onReturnToWorkbench,
  onMarkPaid,
  onUndoPayment,
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  
  if (!batchData) return null;

  const {
    batch_id,
    batch_name,
    total_amount,
    lines_created,
    batches_created,
    client_name,
    project_name,
    qb_status,
    status,
    payment_received_at,
  } = batchData;
  
  const isPaid = status === 'paid' || !!payment_received_at;

  const handleCopyBatchId = () => {
    navigator.clipboard.writeText(batch_id || '');
    toast.success('Batch ID copied to clipboard');
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg bg-gray-900 border-gray-700 overflow-y-auto">
        <SheetHeader className="text-left pb-4">
          {/* Success Animation */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="w-16 h-16 rounded-full bg-green-600/20 flex items-center justify-center mx-auto mb-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </motion.div>
          </motion.div>
          
          <SheetTitle className="text-center text-xl text-white">
            Invoice Batch Created!
          </SheetTitle>
          <p className="text-center text-gray-400 text-sm">
            Your invoice batch has been successfully created and is ready for export.
          </p>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Batch Summary Card */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Batch ID</span>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-900 px-2 py-1 rounded text-gray-300">
                  {batch_name || batch_id?.slice(0, 8)}
                </code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={handleCopyBatchId}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
            
            <Separator className="bg-gray-700" />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Invoice Total</p>
                <p className="text-2xl font-bold text-green-400">
                  ${(total_amount || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Line Items</p>
                <p className="text-2xl font-bold text-white">
                  {lines_created || 0}
                </p>
              </div>
            </div>
            
            {(client_name || project_name) && (
              <>
                <Separator className="bg-gray-700" />
                <div className="flex items-center gap-4 text-sm">
                  {client_name && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <Users className="w-4 h-4 text-gray-500" />
                      {client_name}
                    </div>
                  )}
                  {project_name && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <FolderOpen className="w-4 h-4 text-gray-500" />
                      {project_name}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* QB Export Status */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-300">QuickBooks Status</span>
              <Badge className={cn(
                qb_status === 'exported' ? "bg-green-600" :
                qb_status === 'queued' ? "bg-yellow-600" :
                "bg-gray-600"
              )}>
                {qb_status || 'Ready to Export'}
              </Badge>
            </div>
            
            {/* Mini Timeline */}
            <div className="space-y-0">
              <TimelineStep 
                icon={FileText} 
                label="Batch Created" 
                status="complete" 
              />
              <TimelineStep 
                icon={Upload} 
                label="Export to QuickBooks" 
                status={qb_status === 'exported' ? 'complete' : 'current'}
              />
              <TimelineStep 
                icon={DollarSign} 
                label="Payment Received" 
                status="pending"
                isLast 
              />
            </div>
          </div>

          {/* Payment Timeline (collapsible) */}
          <div className="space-y-2">
            <button 
              onClick={() => setShowTimeline(!showTimeline)}
              className="flex items-center justify-between w-full text-sm text-gray-400 hover:text-gray-300"
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Payment History
              </span>
              <span>{showTimeline ? '−' : '+'}</span>
            </button>
            {showTimeline && (
              <PaymentTimeline batch={batchData} className="mt-2" />
            )}
          </div>

          {/* Next Steps */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              Next Steps
            </h4>
            
            {!isPaid ? (
              <>
                <NextStepCard
                  icon={Upload}
                  title="Export to QuickBooks"
                  description="Send this batch to QuickBooks to create the invoice"
                  onClick={onExportToQB}
                  variant="primary"
                />
                
                {onMarkPaid && (
                  <NextStepCard
                    icon={DollarSign}
                    title="Mark as Paid"
                    description="Record payment received for this batch"
                    onClick={onMarkPaid}
                    variant="secondary"
                  />
                )}
              </>
            ) : (
              <>
                <div className="bg-green-950/30 border border-green-900/30 rounded-lg p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-green-400 font-medium">Payment Received</p>
                  <p className="text-xs text-gray-400 mt-1">This batch has been marked as paid</p>
                </div>
                
                {onUndoPayment && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full text-yellow-400 hover:text-yellow-300 hover:bg-yellow-950/20"
                    onClick={onUndoPayment}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Undo Payment
                  </Button>
                )}
              </>
            )}
            
            <NextStepCard
              icon={Eye}
              title="View Batch Details"
              description="Review all line items and batch information"
              onClick={onViewBatch}
              variant="secondary"
            />
          </div>

          {/* Instructions */}
          <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-3">
            <p className="text-xs text-blue-300">
              <FileText className="w-3 h-3 inline mr-1" />
              <strong>What happens next?</strong> Export this batch to QuickBooks to generate the client invoice. 
              Once the invoice is paid, record the payment to update lifecycle status.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-800">
          <Button 
            variant="outline" 
            className="w-full border-gray-700"
            onClick={onReturnToWorkbench}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Workbench
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}