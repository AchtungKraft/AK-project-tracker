/**
 * ProjectInvoiceDetailDrawer - CANONICAL INVOICE STATUS TRANSITION SURFACE
 * 
 * ARCHITECTURE LOCK:
 * - This is the ONLY component allowed to call markInvoiceSent/markInvoicePaid
 * - Uses queryKeyFactories for all queries
 */
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { invoiceKeys, billingKeys } from "@/components/financial/queryKeyFactories";
import { guardInvoiceMutation } from "@/components/dev/CanonicalArchitectureGuards";
import { invoiceKeys } from "@/components/financial/queryKeyFactories";
import { guardInvoiceMutation } from "@/components/dev/CanonicalArchitectureGuards";

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

  // Fetch invoice - uses factory key
  const { data: invoice, isLoading: loadingInvoice } = useQuery({
    queryKey: invoiceKeys.detail(normalizedInvoiceId),
    queryFn: async () => {
      const invoices = await base44.entities.ProjectInvoice.filter({ id: normalizedInvoiceId });
      return invoices[0];
    },
    enabled: Boolean(normalizedInvoiceId),
  });

  // Fetch invoice lines - uses factory key
  const { data: lines = [], isLoading: loadingLines } = useQuery({
    queryKey: invoiceKeys.lines(normalizedInvoiceId),
    queryFn: async () => {
      return base44.entities.ProjectInvoiceLine.filter({ invoice_id: normalizedInvoiceId });
    },
    enabled: Boolean(normalizedInvoiceId),
  });

  // DETERMINISTIC: Normalize project ID from invoice
  const normalizedProjectId = invoice?.project_id ? String(invoice.project_id) : "";

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
      if (process.env.NODE_ENV === 'development') {
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
        const normalizedProjectId = invoice?.project_id || null;
        await forceAppRefresh(queryClient, {
          projectIds: normalizedProjectId ? [normalizedProjectId] : [],
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
      if (process.env.NODE_ENV === 'development') {
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
        // DETERMINISTIC: Invalidate exact keys only
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["projectInvoice", normalizedInvoiceId] }),
          queryClient.invalidateQueries({ queryKey: ["projectInvoicesView", normalizedProjectId] }),
          queryClient.invalidateQueries({ queryKey: ["billingProcurementStates", normalizedProjectId] }),
          queryClient.invalidateQueries({ queryKey: ["creditAllocations", normalizedProjectId] }),
        ]);
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

  const handleExportCSV = () => {
    if (!invoice || !lines) return;

    // Build CSV content
    const headers = ["Line Type", "Description", "Qty", "Unit Price", "Line Total"];
    const rows = lines.map((line) => [
      line.type,
      line.description,
      line.qty ?? "",
      line.unit_price ?? 0,
      line.line_total ?? 0,
    ]);

    // Add summary rows
    rows.push([]);
    rows.push(["", "Subtotal", "", "", invoice.subtotal ?? 0]);
    if (invoice.credit_applied > 0) {
      rows.push(["", "Credit Applied", "", "", -invoice.credit_applied]);
    }
    rows.push(["", "Balance Due", "", "", invoice.balance_due ?? 0]);

    const csvContent =
      headers.join(",") +
      "\n" +
      rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${invoice.qb_invoice_number || invoice.id}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();

    toast.success("CSV exported");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Invoice Details
            </SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : !invoice ? (
            <div className="text-center py-12 text-gray-500">Invoice not found</div>
          ) : (
            <div className="space-y-6 py-6">
              {/* Header Info */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  {getStatusBadge(invoice.status)}
                  {getInvoiceTypeBadge(invoice.invoice_type)}
                </div>

                <div className="p-4 bg-gray-800/50 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Project</span>
                    <span className="text-white">{project?.name || "—"}</span>
                  </div>
                  {project?.client_name && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Client</span>
                      <span className="text-gray-300">{project.client_name}</span>
                    </div>
                  )}
                  {invoice.qb_invoice_number && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">QB Invoice #</span>
                      <span className="text-white font-mono">{invoice.qb_invoice_number}</span>
                    </div>
                  )}
                  {invoice.issue_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Issue Date</span>
                      <span className="text-gray-300">
                        {format(parseISO(invoice.issue_date), "MMM d, yyyy")}
                      </span>
                    </div>
                  )}
                  {invoice.due_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Due Date</span>
                      <span className="text-gray-300">
                        {format(parseISO(invoice.due_date), "MMM d, yyyy")}
                      </span>
                    </div>
                  )}
                  {invoice.payment_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Payment Date</span>
                      <span className="text-green-400">
                        {format(parseISO(invoice.payment_date), "MMM d, yyyy")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <Separator className="bg-gray-700" />

              {/* Line Items */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400">Line Items</h3>
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead className="text-gray-400">Description</TableHead>
                      <TableHead className="text-gray-400 text-right">Qty</TableHead>
                      <TableHead className="text-gray-400 text-right">Price</TableHead>
                      <TableHead className="text-gray-400 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id} className="border-gray-800">
                        <TableCell>
                          <div>
                            <p className="text-white">{line.description}</p>
                            <p className="text-xs text-gray-500 capitalize">{line.type}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-gray-300">
                          {line.qty ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-gray-300">
                          {formatCurrencyUSD(line.unit_price ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-white">
                          {formatCurrencyUSD(line.line_total ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator className="bg-gray-700" />

              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="text-white font-mono">
                    {formatCurrencyUSD(invoice.subtotal ?? 0)}
                  </span>
                </div>
                {invoice.credit_applied > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Credit Applied</span>
                    <span className="text-green-400 font-mono">
                      -{formatCurrencyUSD(invoice.credit_applied)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-700">
                  <span className="text-white font-medium">Balance Due</span>
                  <span className="text-white font-mono font-bold text-lg">
                    {formatCurrencyUSD(invoice.balance_due ?? 0)}
                  </span>
                </div>
                {invoice.paid_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Amount Paid</span>
                    <span className="text-green-400 font-mono">
                      {formatCurrencyUSD(invoice.paid_amount)}
                    </span>
                  </div>
                )}
              </div>

              {invoice.notes && (
                <>
                  <Separator className="bg-gray-700" />
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Notes</h3>
                    <p className="text-gray-300 text-sm">{invoice.notes}</p>
                  </div>
                </>
              )}

              <Separator className="bg-gray-700" />

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleExportCSV} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>

                {invoice.status === "draft" && (
                  <Button onClick={() => setShowMarkSentModal(true)} className="gap-2">
                    <Send className="w-4 h-4" />
                    Mark Sent
                  </Button>
                )}

                {invoice.status === "sent" && (
                  <Button
                    onClick={() => {
                      setPaidAmount(invoice.balance_due?.toString() || "");
                      setShowMarkPaidModal(true);
                    }}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <DollarSign className="w-4 h-4" />
                    Mark Paid
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Mark Sent Modal */}
      <Dialog open={showMarkSentModal} onOpenChange={setShowMarkSentModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Mark Invoice as Sent
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>QuickBooks Invoice # *</Label>
              <Input
                placeholder="e.g., INV-2024-001"
                value={qbInvoiceNumber}
                onChange={(e) => setQbInvoiceNumber(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkSentModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkSent} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Mark Sent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Modal */}
      <Dialog open={showMarkPaidModal} onOpenChange={setShowMarkPaidModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Record Payment
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-gray-400">Balance Due</span>
                <span className="text-white font-mono font-bold">
                  {formatCurrencyUSD(invoice?.balance_due ?? 0)}
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
              <Label>Amount Paid (leave blank for full amount)</Label>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">$</span>
                <Input
                  type="number"
                  placeholder={invoice?.balance_due?.toString() || "0.00"}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>
              {paidAmount && parseFloat(paidAmount) > (invoice?.balance_due ?? 0) && (
                <p className="text-sm text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Overpayment will create{" "}
                  {formatCurrencyUSD(parseFloat(paidAmount) - (invoice?.balance_due ?? 0))} credit
                </p>
              )}
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
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}