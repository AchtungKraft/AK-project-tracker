import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  RotateCcw,
  Clock,
  User,
  ArrowRight,
  Lock,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const REVERSAL_REASONS = [
  { value: 'data_entry_error', label: 'Data Entry Error' },
  { value: 'chargeback', label: 'Payment Chargeback' },
  { value: 'qb_sync_correction', label: 'QB Sync Correction' },
  { value: 'duplicate_payment', label: 'Duplicate Payment' },
  { value: 'refund_issued', label: 'Refund Issued' },
  { value: 'other', label: 'Other' },
];

export default function ConfirmPaymentReversalModal({
  isOpen,
  onClose,
  onConfirm,
  paymentContext,
  isLoading = false,
}) {
  const [reversalReason, setReversalReason] = useState('');
  const [reversalNotes, setReversalNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (!paymentContext) return null;

  const {
    client_name,
    project_name,
    batch_id,
    batch_name,
    commitment_id,
    total_amount,
    payment_date,
    payment_source,
    payment_method,
    payment_reference,
    marked_paid_by,
    marked_paid_at,
    qb_reference,
    // Reversal blockers
    has_vendor_payment = false,
    is_project_closed = false,
    is_installed = false,
  } = paymentContext;

  const isReversalBlocked = has_vendor_payment || is_project_closed;
  const canReverse = reversalReason && confirmed && !isReversalBlocked;

  const handleConfirm = () => {
    if (!canReverse) return;
    onConfirm({
      batch_id,
      commitment_id,
      reversal_reason: reversalReason,
      reversal_notes: reversalNotes,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <RotateCcw className="w-5 h-5 text-yellow-400" />
            Reverse Payment
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            This will revert the payment status and affect lifecycle state.
          </DialogDescription>
        </DialogHeader>

        {/* Reversal Blocked Warning */}
        {isReversalBlocked && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-red-400 mt-0.5" />
              <div>
                <h4 className="text-red-400 font-medium mb-2">Payment Cannot Be Reversed</h4>
                <p className="text-sm text-red-300 mb-3">
                  Downstream lifecycle actions have been completed:
                </p>
                <ul className="space-y-1 text-sm text-red-300">
                  {has_vendor_payment && (
                    <li className="flex items-center gap-2">
                      <XCircle className="w-3 h-3" />
                      Vendor payment has been recorded
                    </li>
                  )}
                  {is_project_closed && (
                    <li className="flex items-center gap-2">
                      <XCircle className="w-3 h-3" />
                      Project has been closed
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Section A: Payment History */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Original Payment Details
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Client:</span>
              <p className="text-white font-medium">{client_name || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-500">Amount:</span>
              <p className="text-green-400 font-bold">
                ${total_amount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Payment Date:</span>
              <p className="text-white flex items-center gap-1">
                <Clock className="w-3 h-3 text-gray-500" />
                {payment_date ? format(new Date(payment_date), 'MMM d, yyyy') : 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Source:</span>
              <Badge className="bg-gray-700 text-gray-300 text-xs">
                {payment_source || payment_method || 'Manual'}
              </Badge>
            </div>
            {marked_paid_by && (
              <div>
                <span className="text-gray-500">Marked Paid By:</span>
                <p className="text-white flex items-center gap-1">
                  <User className="w-3 h-3 text-gray-500" />
                  {marked_paid_by}
                </p>
              </div>
            )}
            {qb_reference && (
              <div>
                <span className="text-gray-500">QB Reference:</span>
                <p className="text-blue-400">{qb_reference}</p>
              </div>
            )}
          </div>
        </div>

        {/* Section B: Impact Warning */}
        {!isReversalBlocked && (
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4">
            <h4 className="text-xs font-medium text-yellow-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Reversal Impact
            </h4>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-yellow-300">
                <ArrowRight className="w-3 h-3" />
                Move parts back to <Badge className="bg-yellow-600/20 text-yellow-400 text-xs">AWAITING PAYMENT</Badge>
              </li>
              <li className="flex items-center gap-2 text-yellow-300">
                <ArrowRight className="w-3 h-3" />
                <span>Lock procurement if not yet ordered</span>
              </li>
              <li className="flex items-center gap-2 text-yellow-300">
                <ArrowRight className="w-3 h-3" />
                Create lifecycle reversal event
              </li>
            </ul>
          </div>
        )}

        {!isReversalBlocked && (
          <>
            <Separator className="bg-gray-700" />

            {/* Section C: Reversal Reason */}
            <div className="space-y-3">
              <Label className="text-gray-300">
                Reversal Reason <span className="text-red-400">*</span>
              </Label>
              <Select value={reversalReason} onValueChange={setReversalReason}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select reason for reversal..." />
                </SelectTrigger>
                <SelectContent>
                  {REVERSAL_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Additional Notes</Label>
              <Textarea
                placeholder="Explain why this payment is being reversed..."
                value={reversalNotes}
                onChange={(e) => setReversalNotes(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white h-20"
              />
            </div>

            {/* Section D: Confirmation */}
            <div className="bg-red-900/10 border border-red-700/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirm-reversal"
                  checked={confirmed}
                  onCheckedChange={setConfirmed}
                  className="mt-1 border-red-500 data-[state=checked]:bg-red-600"
                />
                <label
                  htmlFor="confirm-reversal"
                  className="text-sm text-red-300 cursor-pointer"
                >
                  I understand this will revert financial lifecycle state and create an audit record.
                </label>
              </div>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          {!isReversalBlocked && (
            <Button
              onClick={handleConfirm}
              disabled={!canReverse || isLoading}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Processing...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reverse Payment
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}