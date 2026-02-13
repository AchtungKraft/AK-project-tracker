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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShoppingCart,
  Calendar,
  CreditCard,
  FileText,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAYMENT_SOURCES = [
  { value: 'qb_synced', label: 'QuickBooks Synced', icon: '🔄' },
  { value: 'manual', label: 'Manual Entry', icon: '✏️' },
  { value: 'partial', label: 'Partial Payment', icon: '◐' },
  { value: 'deposit', label: 'Deposit Payment', icon: '💵' },
];

const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH/Wire' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export default function ConfirmPaymentModal({
  isOpen,
  onClose,
  onConfirm,
  paymentContext,
  isLoading = false,
}) {
  const [paymentSource, setPaymentSource] = useState('manual');
  const [paymentMethod, setPaymentMethod] = useState('check');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  if (!paymentContext) return null;

  const {
    client_name,
    project_name,
    batch_id,
    batch_name,
    commitment_id,
    total_amount,
    items = [],
    qb_exported = false,
    has_partial_payment = false,
  } = paymentContext;

  const hasRiskIndicators = !qb_exported || has_partial_payment;

  const handleConfirm = () => {
    onConfirm({
      payment_source: paymentSource,
      payment_method: paymentMethod,
      payment_date: paymentDate,
      reference_number: referenceNumber,
      notes,
      batch_id,
      commitment_id,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <DollarSign className="w-5 h-5 text-green-400" />
            Confirm Payment Received
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Record payment for this invoice. This action affects lifecycle state.
          </DialogDescription>
        </DialogHeader>

        {/* Section A: Payment Context */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Payment Context
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Client:</span>
              <p className="text-white font-medium">{client_name || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-500">Project:</span>
              <p className="text-white font-medium">{project_name || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-500">{batch_id ? 'Batch:' : 'Commitment:'}</span>
              <p className="text-white font-medium">{batch_name || commitment_id || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-500">Total Amount:</span>
              <p className="text-green-400 font-bold text-lg">
                ${total_amount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
              </p>
            </div>
          </div>
          {items.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <span className="text-xs text-gray-500">{items.length} item(s) included</span>
            </div>
          )}
        </div>

        {/* Section B: Lifecycle Impact Preview */}
        <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
          <h4 className="text-xs font-medium text-green-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Lifecycle Impact
          </h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-gray-300">
              <ArrowRight className="w-3 h-3 text-green-400" />
              Move parts to <Badge className="bg-green-600/20 text-green-400 text-xs">PAID</Badge>
            </li>
            <li className="flex items-center gap-2 text-gray-300">
              <ArrowRight className="w-3 h-3 text-green-400" />
              Change ordering safety to <Badge className="bg-green-600/20 text-green-400 text-xs">GREEN</Badge>
            </li>
            <li className="flex items-center gap-2 text-gray-300">
              <ArrowRight className="w-3 h-3 text-green-400" />
              Unlock procurement actions
            </li>
            <li className="flex items-center gap-2 text-gray-300">
              <ArrowRight className="w-3 h-3 text-green-400" />
              Create lifecycle audit event
            </li>
          </ul>
        </div>

        {/* Section E: Risk Indicators */}
        {hasRiskIndicators && (
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4">
            <h4 className="text-xs font-medium text-yellow-400 uppercase tracking-wide mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Risk Indicators
            </h4>
            <ul className="space-y-1 text-sm text-yellow-300">
              {!qb_exported && (
                <li className="flex items-center gap-2">
                  <Info className="w-3 h-3" />
                  Invoice not exported to QuickBooks
                </li>
              )}
              {has_partial_payment && (
                <li className="flex items-center gap-2">
                  <Info className="w-3 h-3" />
                  Partial payment on batch detected
                </li>
              )}
            </ul>
          </div>
        )}

        <Separator className="bg-gray-700" />

        {/* Section C: Payment Source Selection */}
        <div className="space-y-3">
          <Label className="text-gray-300">Payment Source</Label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_SOURCES.map((source) => (
              <button
                key={source.value}
                onClick={() => setPaymentSource(source.value)}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border text-sm transition-all",
                  paymentSource === source.value
                    ? "border-green-500 bg-green-900/20 text-green-400"
                    : "border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600"
                )}
              >
                <span>{source.icon}</span>
                <span>{source.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Section D: Payment Metadata */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Payment Date
              </Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Payment Method
              </Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Reference Number
            </Label>
            <Input
              placeholder="Check #, Transaction ID, etc."
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Notes (Optional)</Label>
            <Textarea
              placeholder="Additional payment notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white h-20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirm Payment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}