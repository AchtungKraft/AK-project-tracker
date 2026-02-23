/**
 * INVOICEBATCH IS REMOVED. Do not import or use InvoiceBatch* components or functions.
 * Use ProjectInvoice + CreateProjectInvoiceModal.
 */
import React, { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// DEV guardrail
if (process.env.NODE_ENV === "development") {
  window.__INVOICEBATCH_REMOVED__ = true;
}
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  DollarSign,
  RefreshCw,
  Loader2,
  MoreVertical,
  Lock,
  Unlock,
  Send,
  CreditCard,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { differenceInDays, parseISO, format } from "date-fns";
import { useWiringAudit } from "@/components/dev/wiringAudit";
import InvoiceWorkbench from "./InvoiceWorkbench";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { 
  useProjectInvoiceView, 
  CANONICAL_BILLING_STATUS,
  getBillingStatusConfig 
} from "./useProjectInvoiceView";
import { useBillingAndProcurementStates } from "./useFinancialProjectsView";
import { billingKeys, invoiceKeys, creditKeys } from "./queryKeyFactories";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import CreditSummaryStrip from "./CreditSummaryStrip";
import ApplyCreditModal from "./ApplyCreditModal";
import CreateProjectInvoiceModal from "./CreateProjectInvoiceModal";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * ForwardInvoiceDashboard - Invoice-Based Funding UI for Forward Model Projects
 * 
 * PHASE 1 UNIFIED: Uses SAME modal and data sources as ProjectInvoices page.
 * 
 * DATA SOURCES:
 * - useProjectInvoiceView: Invoice history (ProjectInvoice entities) - SINGLE SOURCE
 * - useBillingAndProcurementStates: Canonical exposure/credit calculations
 * 
 * HARD-LOCKED: invoices comes ONLY from useProjectInvoiceView.
 * NO duplicate queries. NO base44.entities.ProjectInvoice calls. NO inline query keys.
 */
export default function ForwardInvoiceDashboard({ projectId }) {
  const queryClient = useQueryClient();
  const audit = useWiringAudit('ForwardInvoiceDashboard');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentBatch, setPaymentBatch] = useState(null);
  const [showInvoiceWorkbench, setShowInvoiceWorkbench] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // PHASE 4: Credit allocation modal and selection state
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [selectedCommitmentIds, setSelectedCommitmentIds] = useState(new Set());
  // PHASE 1 UNIFIED: Use same CreateProjectInvoiceModal as ProjectInvoices
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);

  // DETERMINISTIC: Normalize projectId once - null if invalid
  const normalizedProjectId = 
    projectId !== undefined && projectId !== null && projectId !== ""
      ? String(projectId)
      : null;

  // GUARD: Check for project drift
  if (!normalizedProjectId) {
    console.error("[ForwardInvoiceDashboard] Invoice tab mounted without projectId");
  }

  // CANONICAL: Invoice history from useProjectInvoiceView - SINGLE SOURCE
  // NO duplicate queries allowed. NO base44.entities.ProjectInvoice. NO inline query keys.
  const { 
    invoices,
    summary, 
    isLoading: invoiceLoading, 
    isFetching: invoiceFetching,
    refetch,
  } = useProjectInvoiceView(normalizedProjectId);
  
  // HARD ASSERTION: Log invoice data for debugging
  React.useEffect(() => {
    console.log("INVOICE PROJECT ID:", normalizedProjectId);
    console.log("INVOICE LIST:", invoices);
  }, [normalizedProjectId, invoices]);
  
  // PHASE 2 CANONICAL: Use getBillingAndProcurementStates as single source for exposure/credit
  const { data: billingData, isLoading: billingLoading, isFetching: billingFetching, dataUpdatedAt } = useBillingAndProcurementStates(normalizedProjectId);
  
  // Merge loading states
  const isLoading = invoiceLoading || billingLoading;
  
  // CANONICAL: Use billing data for exposure/credit ONLY - no UI math
  const canonicalTotals = billingData?.totals || {};
  const canonicalCreditSummary = billingData?.credit_summary || {};
  const creditSummary = {
    total_credit_available: canonicalCreditSummary.total_credit_available ?? 0,
    total_credit_applied: canonicalCreditSummary.total_credit_applied ?? 0,
    gross_exposure: canonicalTotals.gross_exposure ?? 0,
    net_exposure: canonicalTotals.net_exposure ?? 0,
  };

  // DEV diagnostic logging
  React.useEffect(() => {
    console.log("[ForwardInvoiceDashboard] Query State:", {
      normalizedProjectId,
      queryKey: billingKeys.states(normalizedProjectId),
      invoiceCount: invoices?.length ?? 0,
      billingData: billingData ? "loaded" : "null",
      isLoading,
      billingFetching,
      dataUpdatedAt: dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null,
      netExposure: canonicalTotals.net_exposure ?? "N/A",
    });
  }, [normalizedProjectId, invoices, billingData, isLoading, billingFetching, dataUpdatedAt, canonicalTotals.net_exposure]);

  // Toggle commitment selection
  const toggleCommitmentSelection = (commitmentId, checked) => {
    setSelectedCommitmentIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(commitmentId);
      } else {
        next.delete(commitmentId);
      }
      return next;
    });
  };

  // Get selected commitment IDs as array
  const selectedIdsArray = useMemo(() => [...selectedCommitmentIds], [selectedCommitmentIds]);

  // Compute ProjectInvoice-level KPIs from canonical invoices array
  const batchKpis = useMemo(() => {
    const nonVoided = invoices.filter(b => b.status !== 'voided');
    const drafts = nonVoided.filter(b => b.status === 'draft');
    const sent = nonVoided.filter(b => ['sent', 'invoiced'].includes(b.status));
    const paid = nonVoided.filter(b => b.status === 'paid');
    const needsExport = nonVoided.filter(b => !b.qb_exported && b.status !== 'draft');

    const totalInvoiced = nonVoided.reduce((sum, b) => sum + (b.total_amount || b.total || 0), 0);
    const totalPaid = paid.reduce((sum, b) => sum + (b.paid_amount || b.total_amount || b.total || 0), 0);
    const totalOutstanding = sent.reduce((sum, b) => sum + (b.total_amount || b.total || 0), 0);

    // Aging buckets
    const today = new Date();
    let totalOverdue = 0;
    const aging = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };

    for (const inv of sent) {
      const amount = inv.total_amount || inv.total || 0;
      const dueDate = inv.due_date ? parseISO(inv.due_date) : null;
      if (dueDate) {
        const daysOverdue = differenceInDays(today, dueDate);
        if (daysOverdue <= 0) {
          aging.current += amount;
        } else {
          totalOverdue += amount;
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
      aging,
      draftCount: drafts.length,
      sentCount: sent.length,
      paidCount: paid.length,
      needsExportCount: needsExport.length,
    };
  }, [invoices]);

  // Export to QB handler - PHASE 1: Uses ProjectInvoice system
  const handleExport = async (invoiceId, action) => {
    setIsExporting(true);
    try {
      audit.trackClick('qb_export', { invoiceId, action });
      const response = await base44.functions.invoke('exportProjectInvoicesToQB', {
        invoice_id: invoiceId,
        action: action,
      });
      
      if (action === 'csv' && response.data?.csv_url) {
        const link = document.createElement('a');
        link.href = response.data.csv_url;
        link.download = `invoice_${invoiceId}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('CSV downloaded');
      } else if (action === 'mark_exported') {
        toast.success('Marked as exported');
        await forceAppRefresh(queryClient, { projectIds: [projectId] });
      }
      audit.trackSuccess('qb_export', { action });
    } catch (error) {
      audit.trackError('qb_export', error);
      toast.error(error.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // Update status handler - PHASE 1: Uses ProjectInvoice
  const handleStatusUpdate = async (invoiceId, status) => {
    try {
      await base44.entities.ProjectInvoice.update(invoiceId, { status });
      toast.success('Status updated');
      refetch();
    } catch (error) {
      toast.error(error.message || 'Update failed');
    }
  };

  // Record payment handler
  const handleRecordPayment = (batch) => {
    audit.trackClick('open_payment_modal', { batchId: batch.id });
    setPaymentBatch(batch);
    setShowPaymentModal(true);
  };

  // PHASE 1: Payment uses markInvoicePaid function for ProjectInvoice
  const handlePaymentSubmit = async (paymentData) => {
    try {
      const invoiceId = paymentData.batchId || paymentData.invoiceId;
      audit.trackClick('record_payment', { invoiceId });
      
      // Use markInvoicePaid backend function
      await base44.functions.invoke('markInvoicePaid', {
        invoice_id: invoiceId,
        payment_date: paymentData.paid_date,
        paid_amount: paymentData.amount_paid,
      });
      
      audit.trackSuccess('record_payment', { invoiceId });
      toast.success('Payment recorded');
      setShowPaymentModal(false);
      setPaymentBatch(null);
      // DETERMINISTIC: Invalidate specific keys only using factories
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: billingKeys.states(normalizedProjectId) }),
        queryClient.invalidateQueries({ queryKey: invoiceKeys.view(normalizedProjectId) }),
        queryClient.invalidateQueries({ queryKey: creditKeys.allocations(normalizedProjectId) }),
      ]);
      refetch();
    } catch (error) {
      audit.trackError('record_payment', error);
      toast.error(error.message || 'Failed to record payment');
    }
  };

  // PHASE 1 UNIFIED: Use same modal as ProjectInvoices page
  const handleCreateInvoice = () => {
    audit.trackClick('create_invoice');
    setShowCreateInvoiceModal(true);
  };
  
  const handleInvoiceCreated = async () => {
    setShowCreateInvoiceModal(false);
    // DETERMINISTIC: Invalidate specific keys only using factories
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: billingKeys.states(normalizedProjectId) }),
      queryClient.invalidateQueries({ queryKey: invoiceKeys.view(normalizedProjectId) }),
      queryClient.invalidateQueries({ queryKey: creditKeys.allocations(normalizedProjectId) }),
    ]);
    refetch();
  };

  // PHASE 5: Status badge with canonical colors
  const getStatusBadge = (batch) => {
    // Map batch.status to canonical billing status colors
    if (batch.status === 'paid') {
      return <Badge className="bg-green-600 text-white text-xs">Paid</Badge>;
    }
    if (['sent', 'invoiced'].includes(batch.status)) {
      return <Badge className="bg-purple-600 text-white text-xs">Invoiced</Badge>;
    }
    if (batch.status === 'voided') {
      return <Badge className="bg-red-600 text-white text-xs">Voided</Badge>;
    }
    // Draft = unbilled
    return <Badge className="bg-gray-600 text-white text-xs">Unbilled</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* PHASE 4: Credit Summary Strip - CANONICAL VALUES ONLY */}
      {creditSummary && (creditSummary.total_credit_available > 0 || creditSummary.total_credit_applied > 0) && (
        <CreditSummaryStrip
          grossExposure={creditSummary.gross_exposure}
          creditAvailable={creditSummary.total_credit_available}
          creditApplied={creditSummary.total_credit_applied}
          netExposure={creditSummary.net_exposure}
          selectedCount={selectedCommitmentIds.size}
          onApplyCredit={() => setShowCreditModal(true)}
          isLoading={isLoading}
        />
      )}

      {/* KPI Summary - PHASE 5: Canonical colors */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Unbilled - Gray */}
        <Card className="bg-gray-900/40 border-gray-700">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Unbilled</p>
            <p className="text-xl font-bold text-gray-400">
              {formatCurrencyUSD(summary.unbilled_total)}
            </p>
            <p className="text-xs text-gray-600">{summary.unbilled_count} items</p>
          </CardContent>
        </Card>
        
        {/* Invoiced - Purple */}
        <Card className="bg-purple-900/20 border-purple-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Awaiting Payment</p>
            <p className="text-xl font-bold text-purple-400">
              {formatCurrencyUSD(batchKpis.totalOutstanding)}
            </p>
            <p className="text-xs text-gray-600">{batchKpis.sentCount} invoices</p>
          </CardContent>
        </Card>
        
        {/* Paid - Green */}
        <Card className="bg-green-900/20 border-green-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Collected</p>
            <p className="text-xl font-bold text-green-400">
              {formatCurrencyUSD(batchKpis.totalPaid)}
            </p>
            <p className="text-xs text-gray-600">{batchKpis.paidCount} paid</p>
          </CardContent>
        </Card>
        
        {/* Outstanding/Overdue - Amber */}
        <Card className={cn(
          "border-gray-800",
          batchKpis.totalOverdue > 0 && "bg-amber-900/20 border-amber-800/50"
        )}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Overdue</p>
            <p className={cn(
              "text-xl font-bold",
              batchKpis.totalOverdue > 0 ? "text-amber-400" : "text-gray-500"
            )}>
              {formatCurrencyUSD(batchKpis.totalOverdue)}
            </p>
            <p className="text-xs text-gray-600">
              {batchKpis.needsExportCount > 0 && `${batchKpis.needsExportCount} needs QB`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets - Only show if outstanding */}
      {batchKpis.totalOutstanding > 0 && (
        <div className="grid grid-cols-5 gap-2">
          <AgingBucket label="Current" amount={batchKpis.aging.current} status="current" />
          <AgingBucket label="1-30 Days" amount={batchKpis.aging['1-30']} status="warning" />
          <AgingBucket label="31-60 Days" amount={batchKpis.aging['31-60']} status="late" />
          <AgingBucket label="61-90 Days" amount={batchKpis.aging['61-90']} status="severe" />
          <AgingBucket label="90+ Days" amount={batchKpis.aging['90+']} status="critical" />
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
          ) : invoices.length === 0 ? (
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
                {invoices.map(inv => (
                  <TableRow key={inv.id} className="border-gray-800 hover:bg-gray-800/30">
                    <TableCell className="text-white font-medium">
                      <div className="flex items-center gap-2">
                        {inv.is_locked && <Lock className="w-3 h-3 text-purple-400" />}
                        {inv.qb_invoice_number || inv.invoice_number || 'Draft'}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {inv.invoice_type || 'progress'}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {inv.issue_date || inv.invoice_date || '-'}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {inv.due_date || '-'}
                    </TableCell>
                    {/* Use formatCurrencyUSD, color by status */}
                    <TableCell className={cn(
                      "text-right font-medium",
                      inv.status === 'paid' ? "text-green-400" :
                      ['sent', 'invoiced'].includes(inv.status) ? "text-purple-400" :
                      "text-gray-400"
                    )}>
                      {formatCurrencyUSD(inv.total_amount || inv.total || 0)}
                    </TableCell>
                    <TableCell>{getStatusBadge(inv)}</TableCell>
                    <TableCell>
                      {inv.qb_exported ? (
                        <Badge className="bg-blue-600 text-xs">Exported</Badge>
                      ) : inv.qb_sync_status === 'failed' ? (
                        <Badge className="bg-red-600 text-xs">Failed</Badge>
                      ) : (
                        <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {inv.payment_date ? format(parseISO(inv.payment_date), 'MMM d') : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                          {inv.status === 'draft' && (
                            <DropdownMenuItem
                              onClick={() => handleStatusUpdate(inv.id, 'sent')}
                              className="text-purple-400"
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Mark Sent
                            </DropdownMenuItem>
                          )}
                          {['sent', 'invoiced'].includes(inv.status) && (
                            <DropdownMenuItem
                              onClick={() => handleRecordPayment(inv)}
                              className="text-green-400"
                            >
                              <CreditCard className="w-4 h-4 mr-2" />
                              Record Payment
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-gray-700" />
                          <DropdownMenuItem
                            onClick={() => handleExport(inv.id, 'csv')}
                            disabled={isExporting}
                            className="text-blue-400"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download CSV
                          </DropdownMenuItem>
                          {!inv.qb_exported && inv.status !== 'draft' && (
                            <DropdownMenuItem
                              onClick={() => handleExport(inv.id, 'mark_exported')}
                              disabled={isExporting}
                              className="text-amber-400"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Mark Exported
                            </DropdownMenuItem>
                          )}
                          {inv.is_locked && (
                            <>
                              <DropdownMenuSeparator className="bg-gray-700" />
                              <DropdownMenuItem
                                onClick={async () => {
                                  if (confirm('Unlock this invoice? This allows edits.')) {
                                    await base44.entities.ProjectInvoice.update(inv.id, { is_locked: false });
                                    refetch();
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

      {/* Commitment Summary by Status - PHASE 7: Only financial states */}
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-4">
          <h4 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Commitment Billing Summary
          </h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
              <p className="text-xs text-gray-500 mb-1">Ready to Bill</p>
              <p className="text-lg font-bold text-gray-400">
                {formatCurrencyUSD(summary.unbilled_total)}
              </p>
              <p className="text-xs text-gray-600">{summary.unbilled_count} commitments</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-900/30 border border-purple-800/50">
              <p className="text-xs text-gray-500 mb-1">Awaiting Payment</p>
              <p className="text-lg font-bold text-purple-400">
                {formatCurrencyUSD(summary.invoiced_total)}
              </p>
              <p className="text-xs text-gray-600">{summary.invoiced_count} commitments</p>
            </div>
            <div className="p-3 rounded-lg bg-green-900/30 border border-green-800/50">
              <p className="text-xs text-gray-500 mb-1">Paid</p>
              <p className="text-lg font-bold text-green-400">
                {formatCurrencyUSD(summary.paid_total)}
              </p>
              <p className="text-xs text-gray-600">{summary.paid_count} commitments</p>
            </div>
          </div>
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
        onSubmit={handlePaymentSubmit}
      />

      {/* PHASE 1 UNIFIED: Use same CreateProjectInvoiceModal as ProjectInvoices */}
      <CreateProjectInvoiceModal
        open={showCreateInvoiceModal}
        onClose={() => setShowCreateInvoiceModal(false)}
        onSuccess={handleInvoiceCreated}
        preselectedProjectId={projectId}
      />

      {/* PHASE 4: Credit Allocation Modal */}
      <ApplyCreditModal
        open={showCreditModal}
        onClose={() => setShowCreditModal(false)}
        projectId={projectId}
        projectName={summary?.project_name || 'Project'}
        selectedCommitmentIds={selectedIdsArray}
        creditSummary={creditSummary}
        onSuccess={async () => {
          setSelectedCommitmentIds(new Set());
          // DETERMINISTIC: Invalidate specific keys only using factories
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: billingKeys.states(normalizedProjectId) }),
            queryClient.invalidateQueries({ queryKey: invoiceKeys.view(normalizedProjectId) }),
            queryClient.invalidateQueries({ queryKey: creditKeys.allocations(normalizedProjectId) }),
          ]);
          refetch();
        }}
      />
    </div>
  );
}

// ============================================
// AGING BUCKET COMPONENT
// ============================================

function AgingBucket({ label, amount, status }) {
  // PHASE 5: Canonical colors for aging
  const statusStyles = {
    current: 'bg-green-900/30 border-green-700/50 text-green-400',
    warning: 'bg-amber-900/30 border-amber-700/50 text-amber-400',
    late: 'bg-orange-900/30 border-orange-700/50 text-orange-400',
    severe: 'bg-red-900/30 border-red-700/50 text-red-400',
    critical: 'bg-red-900/50 border-red-600/50 text-red-400',
  };
  
  return (
    <div className={cn(
      "p-2 rounded-lg border text-center",
      statusStyles[status]
    )}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn("text-sm font-medium", amount > 0 ? '' : 'text-gray-500')}>
        {formatCurrencyUSD(amount)}
      </p>
    </div>
  );
}

// ============================================
// RECORD PAYMENT MODAL
// ============================================

function RecordPaymentModal({ isOpen, onClose, batch, onSubmit }) {
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (batch) {
      setAmountPaid(batch.total_amount?.toString() || '');
    }
  }, [batch]);

  if (!batch) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        batchId: batch.id,
        paid_date: paidDate,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        amount_paid: parseFloat(amountPaid) || batch.total_amount,
      });
    } finally {
      setIsSubmitting(false);
    }
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
            <p className="text-green-400 font-bold">{formatCurrencyUSD(batch.total_amount || 0)}</p>
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
            disabled={isSubmitting || !paidDate}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}