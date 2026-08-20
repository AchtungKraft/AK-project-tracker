/**
 * ProjectInvoiceDetailDrawer - CANONICAL INVOICE STATUS TRANSITION SURFACE
 * 
 * ARCHITECTURE LOCK:
 * - This is the ONLY component allowed to call markInvoiceSent/markInvoicePaid
 * - Uses queryKeyFactories for all queries
 */
import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Send,
  DollarSign,
  Download,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Pencil,
  X,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { invoiceKeys } from "@/components/financial/queryKeyFactories";
import { guardInvoiceMutation } from "@/components/dev/CanonicalArchitectureGuards";
import { downloadClientDetailPDF } from "@/components/financial/ClientDetailPDFExport";

export default function ProjectInvoiceDetailDrawer({
  invoiceId,
  open,
  onClose,
  onUpdated,
}) {
  const queryClient = useQueryClient();
  const [showMarkSentModal, setShowMarkSentModal] = useState(false);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // DETERMINISTIC: Normalize invoice ID
  const normalizedInvoiceId = invoiceId ? String(invoiceId) : "";

  // Mark Sent form state
  const [qbInvoiceNumber, setQbInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");

  // Mark Paid form state
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paidAmount, setPaidAmount] = useState("");

  // QB Info editing state
  const [isEditingQB, setIsEditingQB] = useState(false);
  const [qbDraft, setQbDraft] = useState({ qb_invoice_number: "", qb_invoice_date: "" });
  const [qbError, setQbError] = useState(null);

  // Fetch invoice - uses factory key
  const { data: invoice, isLoading: loadingInvoice } = useQuery({
    queryKey: invoiceKeys.detail(normalizedInvoiceId),
    queryFn: async () => {
      const invoices = await base44.entities.ProjectInvoice.filter({ id: normalizedInvoiceId });
      return invoices[0];
    },
    enabled: Boolean(normalizedInvoiceId),
  });

  // Fetch invoice lines - uses invoice-specific key (not factory's project-based lines key)
  const { data: lines = [], isLoading: loadingLines } = useQuery({
    queryKey: ['invoiceLines', normalizedInvoiceId],
    queryFn: async () => {
      return base44.entities.ProjectInvoiceLine.filter({ invoice_id: normalizedInvoiceId });
    },
    enabled: Boolean(normalizedInvoiceId),
  });

  // DETERMINISTIC: Normalize project ID from invoice
  const normalizedProjectId = invoice?.project_id ? String(invoice.project_id) : "";

  // Reset QB draft state when invoice changes
  useEffect(() => {
    setIsEditingQB(false);
    setQbError(null);
    setQbDraft({
      qb_invoice_number: invoice?.qb_invoice_number ?? "",
      qb_invoice_date: invoice?.qb_invoice_date ?? "",
    });
  }, [invoice?.id]);

  // QB Info mutation
  const qbMutation = useMutation({
    mutationFn: async (payload) => {
      return base44.entities.ProjectInvoice.update(invoice.id, payload);
    },
    onSuccess: () => {
      toast.success("QB info updated");
      setIsEditingQB(false);
      setQbError(null);
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(normalizedInvoiceId) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.list(normalizedProjectId) });
      queryClient.invalidateQueries({ queryKey: ['projectInvoicesView', normalizedProjectId] });
      onUpdated?.();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update QB info");
    },
  });

  const handleSaveQBInfo = () => {
    const trimmedNumber = qbDraft.qb_invoice_number.trim();
    
    // Validation: if number is set, date is required
    if (trimmedNumber && !qbDraft.qb_invoice_date) {
      setQbError("QB date required when invoice # is set");
      return;
    }
    
    setQbError(null);
    qbMutation.mutate({
      qb_invoice_number: trimmedNumber || null,
      qb_invoice_date: qbDraft.qb_invoice_date || null,
    });
  };

  const handleCancelQBEdit = () => {
    setIsEditingQB(false);
    setQbError(null);
    setQbDraft({
      qb_invoice_number: invoice?.qb_invoice_number ?? "",
      qb_invoice_date: invoice?.qb_invoice_date ?? "",
    });
  };

  // Fetch project
  const { data: project } = useQuery({
    queryKey: ["project", normalizedProjectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({ id: normalizedProjectId });
      return projects[0];
    },
    enabled: Boolean(normalizedProjectId),
  });

  const isLoading = loadingInvoice || loadingLines;

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: "Draft", icon: FileText, className: "bg-gray-600 text-white" },
      sent: { label: "Sent", icon: Clock, className: "bg-purple-600 text-white" },
      paid: { label: "Paid", icon: CheckCircle2, className: "bg-green-600 text-white" },
    };
    const c = config[status] || config.draft;
    const Icon = c.icon;
    return (
      <Badge className={cn("gap-1", c.className)}>
        <Icon className="w-3 h-3" />
        {c.label}
      </Badge>
    );
  };

  const getInvoiceTypeBadge = (type) => {
    const config = {
      deposit: { label: "Deposit", className: "bg-blue-600/20 text-blue-400" },
      progress: { label: "Progress", className: "bg-purple-600/20 text-purple-400" },
      final: { label: "Final", className: "bg-green-600/20 text-green-400" },
    };
    const c = config[type] || config.progress;
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const handleMarkSent = async () => {
    if (!qbInvoiceNumber || !issueDate || !dueDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      // DEV GUARDRAIL: Track canonical mutation call
      if (import.meta.env.DEV) {
        guardInvoiceMutation('markInvoiceSent', 'ProjectInvoiceDetailDrawer');
      }

      const response = await base44.functions.invoke("markInvoiceSent", {
        invoice_id: invoiceId,
        qb_invoice_number: qbInvoiceNumber,
        issue_date: issueDate,
        due_date: dueDate,
      });

      if (response.data?.success) {
        toast.success("Invoice marked as sent");
        setShowMarkSentModal(false);
        
        // Use forceAppRefresh for complete cache sync
        const projectIdForRefresh = invoice?.project_id || null;
        await forceAppRefresh(queryClient, {
          projectIds: projectIdForRefresh ? [projectIdForRefresh] : [],
        });
        
        onUpdated?.();
      } else {
        toast.error(response.data?.error || "Failed to mark as sent");
      }
    } catch (error) {
      toast.error(error.message || "Failed to mark as sent");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!paymentDate) {
      toast.error("Please enter payment date");
      return;
    }

    setIsSubmitting(true);
    try {
      // DEV GUARDRAIL: Track canonical mutation call
      if (import.meta.env.DEV) {
        guardInvoiceMutation('markInvoicePaid', 'ProjectInvoiceDetailDrawer');
      }

      const response = await base44.functions.invoke("markInvoicePaid", {
        invoice_id: invoiceId,
        payment_date: paymentDate,
        paid_amount: paidAmount ? parseFloat(paidAmount) : undefined,
      });

      if (response.data?.success) {
        toast.success(
          response.data.credit_created
            ? `Invoice paid. ${formatCurrencyUSD(response.data.credit_created.amount)} credit created.`
            : "Invoice marked as paid"
        );
        setShowMarkPaidModal(false);
        
        // Use forceAppRefresh for complete cache sync
        const projectIdForRefresh = invoice?.project_id || null;
        await forceAppRefresh(queryClient, {
          projectIds: projectIdForRefresh ? [projectIdForRefresh] : [],
        });
        
        onUpdated?.();
      } else {
        toast.error(response.data?.error || "Failed to mark as paid");
      }
    } catch (error) {
      toast.error(error.message || "Failed to mark as paid");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleExportClientPDF = async () => {
    if (!invoice || !lines.length) return;
    setIsExportingPDF(true);
    try {
      // Fetch category sort orders for proper ordering
      const categories = await base44.entities.PartCategory.list();
      const categoryOrder = new Map();
      categories.forEach(cat => {
        categoryOrder.set(cat.name, cat.sort_order ?? 9999);
      });
      // Services and Additional Items go last
      categoryOrder.set("SERVICES", 99000);
      categoryOrder.set("ADDITIONAL ITEMS", 99500);

      downloadClientDetailPDF({ invoice, lines, project, categoryOrder });
      toast.success("Client detail PDF exported");
    } catch (error) {
      toast.error(error.message || "PDF export failed");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleExportCSV = async () => {
    if (!invoice) return;

    setIsExporting(true);
    try {
      const result = await base44.functions.invoke('exportProjectInvoicesToQuickBooks', {
        project_id: normalizedProjectId,
        mode: 'single',
        invoice_ids: [invoice.id],
      });

      if (!result.data?.success) {
        toast.error(result.data?.error || 'Export failed');
        return;
      }

      // HARD LOG - verify export version and CSV header
      console.log('[QB EXPORT VERIFY]', result.data);

      const blob = new Blob([result.data.content], { type: result.data.mime_type });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = result.data.file_name;
      a.click();

      URL.revokeObjectURL(url);
      toast.success('Invoice exported');
    } catch (error) {
      toast.error(error.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-purple-400" />
              Invoice Details
            </SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : !invoice ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <AlertTriangle className="w-8 h-8 mb-2" />
              <p>Invoice not found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="p-4 bg-gray-800/50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Status</span>
                  {getStatusBadge(invoice.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Type</span>
                  {getInvoiceTypeBadge(invoice.invoice_type)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Project</span>
                  <span className="text-white">{project?.name || "—"}</span>
                </div>
              </div>

              {/* QB Invoice Metadata */}
              <div className="p-4 bg-gray-800/30 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-300">QuickBooks Info</h4>
                  {!isEditingQB && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingQB(true)}
                      className="h-7 px-2 text-gray-400 hover:text-white"
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>

                {isEditingQB ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-400">QB Invoice #</Label>
                      <Input
                        value={qbDraft.qb_invoice_number}
                        onChange={(e) => setQbDraft(prev => ({ ...prev, qb_invoice_number: e.target.value }))}
                        placeholder="e.g., INV-001234"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-400">QB Invoice Date</Label>
                      <Input
                        type="date"
                        value={qbDraft.qb_invoice_date}
                        onChange={(e) => setQbDraft(prev => ({ ...prev, qb_invoice_date: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    {qbError && (
                      <p className="text-xs text-red-400">{qbError}</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleSaveQBInfo}
                        disabled={qbMutation.isPending}
                        className="h-7 bg-purple-600 hover:bg-purple-700"
                      >
                        {qbMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelQBEdit}
                        disabled={qbMutation.isPending}
                        className="h-7"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">QB Invoice #</span>
                      <span className="font-mono text-white text-sm">
                        {invoice.qb_invoice_number || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">QB Invoice Date</span>
                      <span className="text-white text-sm">
                        {invoice.qb_invoice_date
                          ? format(parseISO(invoice.qb_invoice_date), "MMM d, yyyy")
                          : "—"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800/30 rounded-lg">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Created</p>
                  <p className="text-sm text-white">
                    {invoice.created_date
                      ? format(parseISO(invoice.created_date), "MMM d, yyyy")
                      : "—"}
                  </p>
                </div>
                {invoice.issue_date && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Issued</p>
                    <p className="text-sm text-white">
                      {format(parseISO(invoice.issue_date), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
                {invoice.due_date && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Due</p>
                    <p className="text-sm text-white">
                      {format(parseISO(invoice.due_date), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
                {invoice.payment_date && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Paid</p>
                    <p className="text-sm text-green-400">
                      {format(parseISO(invoice.payment_date), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3">Line Items</h3>
                <div className="border border-gray-700 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-700">
                        <TableHead className="text-gray-400">Description</TableHead>
                        <TableHead className="text-gray-400 text-right">Qty</TableHead>
                        <TableHead className="text-gray-400 text-right">Price</TableHead>
                        <TableHead className="text-gray-400 text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, idx) => (
                        <TableRow key={idx} className="border-gray-700">
                          <TableCell className="text-white">{line.description}</TableCell>
                          <TableCell className="text-right text-gray-300">
                            {line.qty || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-gray-300">
                            {line.unit_price ? formatCurrencyUSD(line.unit_price) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-white">
                            {formatCurrencyUSD(line.line_total || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals */}
              <div className="p-4 bg-gray-800/50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="font-mono text-white">
                    {formatCurrencyUSD(invoice.subtotal || 0)}
                  </span>
                </div>
                {(invoice.credit_applied || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Credit Applied</span>
                    <span className="font-mono text-green-400">
                      -{formatCurrencyUSD(invoice.credit_applied)}
                    </span>
                  </div>
                )}
                <Separator className="bg-gray-700 my-2" />
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-white">Total</span>
                  <span className="font-mono text-white">
                    {formatCurrencyUSD(invoice.total || 0)}
                  </span>
                </div>
                {invoice.status === "paid" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Paid Amount</span>
                    <span className="font-mono text-green-400">
                      {formatCurrencyUSD(invoice.paid_amount || invoice.total || 0)}
                    </span>
                  </div>
                )}
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div className="p-4 bg-gray-800/30 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Notes</h4>
                  <p className="text-sm text-gray-400 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-700">
                {invoice.status === "draft" && (
                  <Button
                    onClick={() => setShowMarkSentModal(true)}
                    className="gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    <Send className="w-4 h-4" />
                    Mark as Sent
                  </Button>
                )}
                {invoice.status === "sent" && (
                  <Button
                    onClick={() => setShowMarkPaidModal(true)}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <DollarSign className="w-4 h-4" />
                    Mark as Paid
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="gap-2"
                      disabled={isExporting || isExportingPDF}
                    >
                      {(isExporting || isExportingPDF) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Export
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportCSV} disabled={isExporting}>
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportClientPDF} disabled={isExportingPDF}>
                      <FileText className="w-4 h-4 mr-2" />
                      Client Detail PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Mark Sent Modal */}
      <Dialog open={showMarkSentModal} onOpenChange={setShowMarkSentModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Invoice as Sent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>QuickBooks Invoice Number *</Label>
              <Input
                value={qbInvoiceNumber}
                onChange={(e) => setQbInvoiceNumber(e.target.value)}
                placeholder="e.g., INV-001234"
              />
            </div>
            <div className="space-y-2">
              <Label>Issue Date *</Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkSentModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkSent}
              disabled={isSubmitting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Sent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Modal */}
      <Dialog open={showMarkPaidModal} onOpenChange={setShowMarkPaidModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Invoice as Paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Invoice Total</span>
                <span className="font-mono text-white">
                  {formatCurrencyUSD(invoice?.total || 0)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Payment Date *</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Paid Amount{" "}
                <span className="text-gray-400">(leave blank for full amount)</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder={invoice?.total?.toString() || "0.00"}
              />
              <p className="text-xs text-gray-400">
                If paid amount exceeds invoice total, credit will be created.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaidModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkPaid}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}