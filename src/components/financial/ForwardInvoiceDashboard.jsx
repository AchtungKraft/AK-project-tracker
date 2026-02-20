import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  FileText, 
  Plus,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Loader2,
  MoreVertical,
  Lock,
  Unlock,
  Send,
  CreditCard,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { differenceInDays, parseISO, format } from "date-fns";
import { useWiringAudit } from "@/components/dev/wiringAudit";

/**
 * ForwardInvoiceDashboard - Invoice-Based Funding UI for Forward Model Projects
 * 
 * FORWARD MODEL ONLY - Does NOT use:
 * - BillingPool, PoolAllocation, PoolCharge
 * - exposure_gap, covered_retail_total, billing_status
 * - VendorInvoice flows
 * 
 * USES:
 * - InvoiceBatch as single source of client billing truth
 * - InvoiceBatchLine for line items
 * - Payment recorded on InvoiceBatch (paid_date, payment_method, payment_reference, amount_paid)
 */
export default function ForwardInvoiceDashboard({ projectId, onCreateInvoice }) {
  const queryClient = useQueryClient();
  const audit = useWiringAudit('ForwardInvoiceDashboard');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentBatch, setPaymentBatch] = useState(null);

  // Fetch invoice batches for this project
  const { data: invoiceBatches = [], isLoading, refetch } = useQuery({
    queryKey: ['invoiceBatches', projectId],
    queryFn: async () => {
      const filter = { project_id: projectId };
      return base44.entities.InvoiceBatch.filter(filter, '-created_date');
    },
    enabled: !!projectId,
  });

  // Compute KPIs
  const kpis = useMemo(() => {
    const nonVoided = invoiceBatches.filter(b => b.status !== 'voided');
    const drafts = nonVoided.filter(b => b.status === 'draft');
    const sent = nonVoided.filter(b => ['sent', 'invoiced'].includes(b.status));
    const paid = nonVoided.filter(b => b.status === 'paid');
    const needsExport = nonVoided.filter(b => !b.qb_exported && b.status !== 'draft');
    const exportFailed = nonVoided.filter(b => b.qb_sync_status === 'failed');

    const totalInvoiced = nonVoided.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const totalPaid = paid.reduce((sum, b) => sum + (b.amount_paid || b.total_amount || 0), 0);
    const totalOutstanding = sent.reduce((sum, b) => sum + (b.total_amount || 0), 0);

    // Aging buckets
    const today = new Date();
    let totalOverdue = 0;
    let oldestOverdueDays = 0;
    const aging = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };

    for (const batch of sent) {
      const amount = batch.total_amount || 0;
      const dueDate = batch.due_date ? parseISO(batch.due_date) : null;
      if (dueDate) {
        const daysOverdue = differenceInDays(today, dueDate);
        if (daysOverdue <= 0) {
          aging.current += amount;
        } else {
          totalOverdue += amount;
          oldestOverdueDays = Math.max(oldestOverdueDays, daysOverdue);
          if (daysOverdue <= 30) aging['1-30'] += amount;
          else if (daysOverdue <= 60) aging['31-60'] += amount;
          else if (daysOverdue <= 90) aging['61-90'] += amount;
          else aging['90+'] += amount;
        }
      } else {
        aging.current += amount;
      }
    }

    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      totalOverdue,
      oldestOverdueDays,
      aging,
      draftCount: drafts.length,
      sentCount: sent.length,
      paidCount: paid.length,
      needsExportCount: needsExport.length,
      exportFailedCount: exportFailed.length,
    };
  }, [invoiceBatches]);

  // Export to QB mutation
  const exportMutation = useMutation({
    mutationFn: async ({ batchId, action }) => {
      audit.trackClick('qb_export', { batchId, action });
      const response = await base44.functions.invoke('exportInvoiceBatchToQuickBooks', {
        batch_id: batchId,
        action: action, // 'csv' or 'mark_exported'
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      audit.trackSuccess('qb_export', { action: variables.action });
      if (variables.action === 'csv' && data.csv_url) {
        // Trigger download
        const link = document.createElement('a');
        link.href = data.csv_url;
        link.download = `invoice_${variables.batchId}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('CSV downloaded');
      } else if (variables.action === 'mark_exported') {
        toast.success('Marked as exported');
        queryClient.invalidateQueries({ queryKey: ['invoiceBatches', projectId] });
      }
    },
    onError: (error) => {
      audit.trackError('qb_export', error);
      toast.error(error.message || 'Export failed');
    },
  });

  // Update status mutation
  const statusMutation = useMutation({
    mutationFn: async ({ batchId, status }) => {
      await base44.entities.InvoiceBatch.update(batchId, { status });
    },
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['invoiceBatches', projectId] });
    },
    onError: (error) => {
      toast.error(error.message || 'Update failed');
    },
  });

  // Record payment mutation
  const paymentMutation = useMutation({
    mutationFn: async (paymentData) => {
      audit.trackClick('record_payment', { batchId: paymentData.batchId });
      const { batchId, ...data } = paymentData;
      await base44.entities.InvoiceBatch.update(batchId, {
        status: 'paid',
        paid_date: data.paid_date,
        payment_method: data.payment_method,
        payment_reference: data.payment_reference,
        amount_paid: data.amount_paid,
        is_locked: true, // Lock on payment
      });
    },
    onSuccess: (_, variables) => {
      audit.trackSuccess('record_payment', { batchId: variables.batchId });
      toast.success('Payment recorded');
      setShowPaymentModal(false);
      setPaymentBatch(null);
      queryClient.invalidateQueries({ queryKey: ['invoiceBatches', projectId] });
    },
    onError: (error) => {
      audit.trackError('record_payment', error);
      toast.error(error.message || 'Failed to record payment');
    },
  });

  const getStatusBadge = (batch) => {
    const statusConfig = {
      draft: { color: 'bg-gray-600', label: 'Draft' },
      sent: { color: 'bg-purple-600', label: 'Sent' },
      invoiced: { color: 'bg-purple-600', label: 'Invoiced' },
      paid: { color: 'bg-green-600', label: 'Paid' },
      voided: { color: 'bg-red-600', label: 'Voided' },
    };
    const config = statusConfig[batch.status] || statusConfig.draft;
    return <Badge className={cn(config.color, "text-white text-xs")}>{config.label}</Badge>;
  };

  const handleRecordPayment = (batch) => {
    audit.trackClick('open_payment_modal', { batchId: batch.id });
    setPaymentBatch(batch);
    setShowPaymentModal(true);
  };

  const handleCreateInvoice = () => {
    audit.trackClick('create_invoice');
    onCreateInvoice?.();
  };

  return (
    <div className="space-y-4">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-blue-900/20 border-blue-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Total Invoiced</p>
            <p className="text-xl font-bold text-blue-400">${kpis.totalInvoiced.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-900/20 border-green-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Collected</p>
            <p className="text-xl font-bold text-green-400">${kpis.totalPaid.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-900/20 border-yellow-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Outstanding</p>
            <p className="text-xl font-bold text-yellow-400">${kpis.totalOutstanding.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card className={cn("border-gray-800", kpis.totalOverdue > 0 && "bg-red-900/20 border-red-800/50")}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Overdue</p>
            <p className={cn("text-xl font-bold", kpis.totalOverdue > 0 ? "text-red-400" : "text-gray-400")}>
              ${kpis.totalOverdue.toFixed(0)}
            </p>
          </CardContent>
        </Card>
        <Card className={cn("border-gray-800", kpis.needsExportCount > 0 && "bg-orange-900/20 border-orange-800/50")}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Needs QB Export</p>
            <p className={cn("text-xl font-bold", kpis.needsExportCount > 0 ? "text-orange-400" : "text-gray-400")}>
              {kpis.needsExportCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets */}
      {kpis.totalOutstanding > 0 && (
        <div className="grid grid-cols-5 gap-2">
          <AgingBucket label="Current" amount={kpis.aging.current} color="green" />
          <AgingBucket label="1-30 Days" amount={kpis.aging['1-30']} color="yellow" />
          <AgingBucket label="31-60 Days" amount={kpis.aging['31-60']} color="orange" />
          <AgingBucket label="61-90 Days" amount={kpis.aging['61-90']} color="red" />
          <AgingBucket label="90+ Days" amount={kpis.aging['90+']} color="red" severe />
        </div>
      )}

      {/* Actions Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-400" />
          Client Invoices
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-gray-700"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleCreateInvoice}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Invoice
          </Button>
        </div>
      </div>

      {/* Invoice Table */}
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-500" />
            </div>
          ) : invoiceBatches.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No invoices yet</p>
              <Button onClick={handleCreateInvoice} className="mt-3 bg-green-600 hover:bg-green-700">
                Create First Invoice
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-400">Invoice #</TableHead>
                  <TableHead className="text-gray-400">Type</TableHead>
                  <TableHead className="text-gray-400">Date</TableHead>
                  <TableHead className="text-gray-400">Due</TableHead>
                  <TableHead className="text-gray-400 text-right">Amount</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">QB</TableHead>
                  <TableHead className="text-gray-400">Payment</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceBatches.map(batch => (
                  <TableRow key={batch.id} className="border-gray-800 hover:bg-gray-800/30">
                    <TableCell className="text-white font-medium">
                      <div className="flex items-center gap-2">
                        {batch.is_locked && <Lock className="w-3 h-3 text-purple-400" />}
                        {batch.invoice_number || batch.batch_name || 'Draft'}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {batch.invoice_type || 'progress'}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {batch.invoice_date || '-'}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {batch.due_date || '-'}
                    </TableCell>
                    <TableCell className="text-right text-green-400 font-medium">
                      ${(batch.total_amount || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusBadge(batch)}</TableCell>
                    <TableCell>
                      {batch.qb_exported ? (
                        <Badge className="bg-blue-600 text-xs">Exported</Badge>
                      ) : batch.qb_sync_status === 'failed' ? (
                        <Badge className="bg-red-600 text-xs">Failed</Badge>
                      ) : (
                        <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {batch.paid_date ? format(parseISO(batch.paid_date), 'MMM d') : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                          {batch.status === 'draft' && (
                            <DropdownMenuItem
                              onClick={() => statusMutation.mutate({ batchId: batch.id, status: 'sent' })}
                              className="text-purple-400"
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Mark Sent
                            </DropdownMenuItem>
                          )}
                          {['sent', 'invoiced'].includes(batch.status) && (
                            <DropdownMenuItem
                              onClick={() => handleRecordPayment(batch)}
                              className="text-green-400"
                            >
                              <CreditCard className="w-4 h-4 mr-2" />
                              Record Payment
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-gray-700" />
                          <DropdownMenuItem
                            onClick={() => exportMutation.mutate({ batchId: batch.id, action: 'csv' })}
                            className="text-blue-400"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download CSV
                          </DropdownMenuItem>
                          {!batch.qb_exported && batch.status !== 'draft' && (
                            <DropdownMenuItem
                              onClick={() => exportMutation.mutate({ batchId: batch.id, action: 'mark_exported' })}
                              className="text-orange-400"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Mark Exported
                            </DropdownMenuItem>
                          )}
                          {batch.is_locked && (
                            <>
                              <DropdownMenuSeparator className="bg-gray-700" />
                              <DropdownMenuItem
                                onClick={() => {
                                  if (confirm('Unlock this invoice? This allows edits.')) {
                                    base44.entities.InvoiceBatch.update(batch.id, { is_locked: false });
                                    queryClient.invalidateQueries({ queryKey: ['invoiceBatches', projectId] });
                                  }
                                }}
                                className="text-red-400"
                              >
                                <Unlock className="w-4 h-4 mr-2" />
                                Unlock Invoice
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentBatch(null);
        }}
        batch={paymentBatch}
        onSubmit={(data) => paymentMutation.mutate(data)}
        isLoading={paymentMutation.isPending}
      />
    </div>
  );
}

function AgingBucket({ label, amount, color, severe = false }) {
  const colorClasses = {
    green: 'bg-green-900/30 border-green-700/50 text-green-400',
    yellow: 'bg-yellow-900/30 border-yellow-700/50 text-yellow-400',
    orange: 'bg-orange-900/30 border-orange-700/50 text-orange-400',
    red: severe 
      ? 'bg-red-900/50 border-red-600/50 text-red-400' 
      : 'bg-red-900/30 border-red-700/50 text-red-400',
  };
  
  return (
    <div className={cn(
      "p-2 rounded-lg border text-center",
      colorClasses[color]
    )}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn("text-sm font-medium", amount > 0 ? '' : 'text-gray-500')}>
        ${amount.toLocaleString()}
      </p>
    </div>
  );
}

function RecordPaymentModal({ isOpen, onClose, batch, onSubmit, isLoading }) {
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [amountPaid, setAmountPaid] = useState('');

  React.useEffect(() => {
    if (batch) {
      setAmountPaid(batch.total_amount?.toString() || '');
    }
  }, [batch]);

  if (!batch) return null;

  const handleSubmit = () => {
    onSubmit({
      batchId: batch.id,
      paid_date: paidDate,
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      amount_paid: parseFloat(amountPaid) || batch.total_amount,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-green-400" />
            Record Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-sm text-gray-400">Invoice</p>
            <p className="text-white font-medium">{batch.invoice_number || batch.batch_name}</p>
            <p className="text-green-400 font-bold">${(batch.total_amount || 0).toFixed(2)}</p>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-gray-300">Payment Date</Label>
              <Input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                  <SelectValue placeholder="Select method..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="wire">Wire Transfer</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-300">Reference # (Check #, Transaction ID)</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. Check #1234"
                className="bg-gray-800 border-gray-600 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Amount Paid</Label>
              <Input
                type="number"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white mt-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !paidDate}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}