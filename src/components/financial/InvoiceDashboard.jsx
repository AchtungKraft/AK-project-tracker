import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  DollarSign, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Upload,
  Search,
  RefreshCw,
  Loader2,
  ExternalLink,
  AlertCircle,
  Calendar,
  Lock,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * InvoiceDashboard - Forward Model Only
 * 
 * Replaces pool-based "Funding" with InvoiceBatch-based billing.
 * NO rendering of: BillingPool, PoolAllocation, PoolCharge, exposure_gap, covered_retail_total
 */

// ============================================
// KPI CARDS
// ============================================

function InvoiceKPICards({ kpis }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="bg-orange-900/20 border-orange-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-gray-400 uppercase">Outstanding</span>
          </div>
          <p className="text-xl font-bold text-orange-400">${(kpis.outstanding_total || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500">{kpis.outstanding_count || 0} invoices</p>
        </CardContent>
      </Card>
      <Card className="bg-red-900/20 border-red-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-gray-400 uppercase">Overdue</span>
          </div>
          <p className="text-xl font-bold text-red-400">${(kpis.overdue_total || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500">
            {kpis.oldest_overdue_days > 0 ? `${kpis.oldest_overdue_days}d oldest` : 'None'}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-yellow-900/20 border-yellow-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Upload className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-gray-400 uppercase">Needs QB Export</span>
          </div>
          <p className="text-xl font-bold text-yellow-400">{kpis.needs_qb_export || 0}</p>
          <p className="text-xs text-gray-500">pending export</p>
        </CardContent>
      </Card>
      <Card className="bg-green-900/20 border-green-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-400 uppercase">Paid</span>
          </div>
          <p className="text-xl font-bold text-green-400">${(kpis.paid_total || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500">{kpis.paid_count || 0} invoices</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// STATUS BADGE
// ============================================

function InvoiceStatusBadge({ status, qbExported, qbSyncStatus }) {
  const statusConfig = {
    draft: { label: 'Draft', color: 'bg-gray-600', icon: FileText },
    sent: { label: 'Sent', color: 'bg-blue-600', icon: Clock },
    exported: { label: 'Exported', color: 'bg-purple-600', icon: Upload },
    invoiced: { label: 'Invoiced', color: 'bg-purple-600', icon: FileText },
    paid: { label: 'Paid', color: 'bg-green-600', icon: CheckCircle2 },
    voided: { label: 'Voided', color: 'bg-red-600', icon: XCircle },
  };

  const config = statusConfig[status] || { label: status, color: 'bg-gray-600', icon: FileText };
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1">
      <Badge className={cn(config.color, "text-white gap-1")}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
      {qbExported && (
        <Badge className="bg-green-700 text-white text-xs">QB</Badge>
      )}
      {qbSyncStatus === 'failed' && (
        <Badge className="bg-red-700 text-white text-xs">QB Failed</Badge>
      )}
    </div>
  );
}

// ============================================
// QB EXPORT WARNING BANNER
// ============================================

function QBExportWarningBanner({ batch, onUnlock }) {
  if (!batch.qb_exported) return null;

  return (
    <div className="p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-yellow-400" />
          <span className="text-yellow-400 text-sm">
            Exported to QuickBooks on {batch.qb_export_date ? format(parseISO(batch.qb_export_date), 'MMM d, yyyy') : 'N/A'}
          </span>
        </div>
        {onUnlock && (
          <Button 
            variant="outline" 
            size="sm" 
            className="border-yellow-600 text-yellow-400 hover:bg-yellow-900/30"
            onClick={onUnlock}
          >
            Unlock for Edits
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Changes will require re-export to QuickBooks.
      </p>
    </div>
  );
}

// ============================================
// QB SYNC FAILED BANNER
// ============================================

function QBSyncFailedBanner({ batch }) {
  if (batch.qb_sync_status !== 'failed') return null;

  return (
    <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg mb-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-400" />
        <span className="text-red-400 text-sm font-medium">QuickBooks Export Failed</span>
      </div>
      {batch.qb_sync_error && (
        <p className="text-xs text-gray-400 mt-1">{batch.qb_sync_error}</p>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function InvoiceDashboard({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);

  // Fetch invoices for project
  const { data: invoices = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['invoiceBatches', projectId, statusFilter],
    queryFn: async () => {
      const filter = projectId ? { project_id: projectId } : {};
      if (statusFilter !== 'all') {
        filter.status = statusFilter;
      }
      return base44.entities.InvoiceBatch.filter(filter, '-created_date');
    },
    staleTime: 30000,
  });

  // Compute KPIs
  const kpis = useMemo(() => {
    const today = new Date();
    
    const outstanding = invoices.filter(i => ['sent', 'exported', 'invoiced'].includes(i.status));
    const overdue = outstanding.filter(i => {
      if (!i.due_date) return false;
      return differenceInDays(today, parseISO(i.due_date)) > 0;
    });
    const paid = invoices.filter(i => i.status === 'paid');
    const needsQBExport = invoices.filter(i => 
      i.status !== 'draft' && i.status !== 'voided' && !i.qb_exported
    );

    let oldestOverdueDays = 0;
    overdue.forEach(i => {
      if (i.due_date) {
        const days = differenceInDays(today, parseISO(i.due_date));
        if (days > oldestOverdueDays) oldestOverdueDays = days;
      }
    });

    return {
      outstanding_total: outstanding.reduce((sum, i) => sum + (i.total_amount || 0), 0),
      outstanding_count: outstanding.length,
      overdue_total: overdue.reduce((sum, i) => sum + (i.total_amount || 0), 0),
      overdue_count: overdue.length,
      oldest_overdue_days: oldestOverdueDays,
      paid_total: paid.reduce((sum, i) => sum + (i.total_amount || 0), 0),
      paid_count: paid.length,
      needs_qb_export: needsQBExport.length,
      qb_failed: invoices.filter(i => i.qb_sync_status === 'failed').length,
    };
  }, [invoices]);

  // Filter invoices by search
  const filteredInvoices = useMemo(() => {
    if (!searchTerm) return invoices;
    const search = searchTerm.toLowerCase();
    return invoices.filter(i => 
      i.invoice_number?.toLowerCase().includes(search) ||
      i.qb_invoice_number?.toLowerCase().includes(search) ||
      i.batch_name?.toLowerCase().includes(search) ||
      i.client_name?.toLowerCase().includes(search)
    );
  }, [invoices, searchTerm]);

  // Unlock mutation
  const unlockMutation = useMutation({
    mutationFn: async (batchId) => {
      await base44.entities.InvoiceBatch.update(batchId, { 
        is_locked: false,
        qb_exported: false, // Allow re-export
      });
    },
    onSuccess: async () => {
      toast.success('Invoice unlocked for editing');
      setShowUnlockConfirm(false);
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        projectIds: projectId ? [projectId] : [],
      });
    },
  });

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <InvoiceKPICards kpis={kpis} />

      {/* Invoice List */}
      <Card className="bg-black/40 border-gray-800">
        <CardHeader className="border-b border-gray-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              Invoices
              <Badge className="bg-blue-600 text-white text-xs ml-2">Forward Model</Badge>
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()} 
              disabled={isFetching}
              className="border-gray-700"
            >
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-gray-900/50 border-gray-700 h-9">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="voided">Voided</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-500" />
              <p className="text-gray-400">Loading invoices...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400">No invoices found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-transparent">
                  <TableHead className="text-gray-400">Invoice #</TableHead>
                  <TableHead className="text-gray-400">QB #</TableHead>
                  <TableHead className="text-gray-400">Type</TableHead>
                  <TableHead className="text-gray-400">Date</TableHead>
                  <TableHead className="text-gray-400">Due</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400 text-right">Amount</TableHead>
                  <TableHead className="text-gray-400">QB Export</TableHead>
                  <TableHead className="text-gray-400">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map(invoice => {
                  const isOverdue = invoice.due_date && 
                    ['sent', 'exported', 'invoiced'].includes(invoice.status) &&
                    differenceInDays(new Date(), parseISO(invoice.due_date)) > 0;

                  return (
                    <TableRow 
                      key={invoice.id} 
                      className="border-gray-800 hover:bg-gray-800/30 cursor-pointer"
                      onClick={() => setSelectedBatch(invoice)}
                    >
                      <TableCell className="font-medium text-white">
                        {invoice.invoice_number || invoice.batch_name || '—'}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {invoice.qb_invoice_number || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-gray-600 text-gray-300 capitalize">
                          {invoice.invoice_type || 'progress'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-300">
                        {invoice.invoice_date ? format(parseISO(invoice.invoice_date), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className={cn("text-gray-300", isOverdue && "text-red-400 font-medium")}>
                        {invoice.due_date ? format(parseISO(invoice.due_date), 'MMM d, yyyy') : '—'}
                        {isOverdue && (
                          <span className="ml-1 text-xs">
                            ({differenceInDays(new Date(), parseISO(invoice.due_date))}d)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge 
                          status={invoice.status} 
                          qbExported={invoice.qb_exported}
                          qbSyncStatus={invoice.qb_sync_status}
                        />
                      </TableCell>
                      <TableCell className="text-right text-green-400 font-medium">
                        ${(invoice.total_amount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {invoice.qb_exported ? (
                          <span className="text-green-400">
                            {invoice.qb_export_date ? format(parseISO(invoice.qb_export_date), 'MMM d') : 'Yes'}
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {invoice.paid_date ? format(parseISO(invoice.paid_date), 'MMM d, yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoice Detail Modal */}
      {selectedBatch && (
        <Dialog open={!!selectedBatch} onOpenChange={() => setSelectedBatch(null)}>
          <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {selectedBatch.invoice_number || selectedBatch.batch_name}
              </DialogTitle>
            </DialogHeader>

            {/* QB Export Warning */}
            <QBExportWarningBanner 
              batch={selectedBatch} 
              onUnlock={() => setShowUnlockConfirm(true)}
            />

            {/* QB Sync Failed */}
            <QBSyncFailedBanner batch={selectedBatch} />

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400">Status</label>
                  <div className="mt-1">
                    <InvoiceStatusBadge 
                      status={selectedBatch.status}
                      qbExported={selectedBatch.qb_exported}
                      qbSyncStatus={selectedBatch.qb_sync_status}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Total Amount</label>
                  <p className="text-xl font-bold text-green-400 mt-1">
                    ${(selectedBatch.total_amount || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Invoice Date</label>
                  <p className="text-white mt-1">
                    {selectedBatch.invoice_date ? format(parseISO(selectedBatch.invoice_date), 'MMM d, yyyy') : '—'}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Due Date</label>
                  <p className="text-white mt-1">
                    {selectedBatch.due_date ? format(parseISO(selectedBatch.due_date), 'MMM d, yyyy') : '—'}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">QB Invoice #</label>
                  <p className="text-white mt-1">{selectedBatch.qb_invoice_number || '—'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Line Count</label>
                  <p className="text-white mt-1">{selectedBatch.line_count || 0} items</p>
                </div>
              </div>

              {selectedBatch.notes && (
                <div>
                  <label className="text-xs text-gray-400">Notes</label>
                  <p className="text-gray-300 mt-1 text-sm">{selectedBatch.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedBatch(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Unlock Confirm Dialog */}
      <Dialog open={showUnlockConfirm} onOpenChange={setShowUnlockConfirm}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Unlock Invoice for Editing?</DialogTitle>
            <DialogDescription className="text-gray-400">
              This invoice has been exported to QuickBooks. Unlocking will allow edits but require re-export.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnlockConfirm(false)}>Cancel</Button>
            <Button 
              className="bg-yellow-600 hover:bg-yellow-700"
              onClick={() => unlockMutation.mutate(selectedBatch.id)}
              disabled={unlockMutation.isPending}
            >
              {unlockMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Unlock Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}