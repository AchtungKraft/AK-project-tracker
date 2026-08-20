/**
 * CreateProjectInvoiceModal - SINGLE-SCREEN INVOICE BUILDER
 * 
 * ARCHITECTURE LOCK:
 * - This is the ONLY component allowed to call createProjectInvoiceDraft
 * - All invoice creation MUST flow through this modal
 * - NO wizard steps — the builder IS the review
 * 
 * BACKEND: UNTOUCHED. Uses:
 * - resolveProjectBillableItems (via BillableItemsSelector)
 * - createProjectInvoiceDraft
 * - getProjectsBillingSummary (validation)
 */
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  FileText,
  Package,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import FinancialProjectSelector from "./FinancialProjectSelector";
import BillableItemsSelector from "./BillableItemsSelector";
import BillingValidationBanner from "./BillingValidationBanner";
import { guardInvoiceMutation, registerInvoiceCreationSurface } from "@/components/dev/CanonicalArchitectureGuards";
import { billingKeys, invoiceKeys, creditKeys, normalizeProjectId } from "./queryKeyFactories";
import InvoiceTotalsPanel from "./InvoiceTotalsPanel";
import ManualLinesSection from "./ManualLinesSection";

// DEV guardrails
if (import.meta.env.DEV) {
  window.__INVOICEBATCH_REMOVED__ = true;
  window.__CANONICAL_INVOICE_MODAL__ = 'CreateProjectInvoiceModal';
  registerInvoiceCreationSurface('CreateProjectInvoiceModal');
}

export default function CreateProjectInvoiceModal({ 
  open, 
  onClose, 
  onSuccess,
  onOpenDraft,
  preselectedProjectId = null,
  initialSelectedItems = [],
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [invoiceType, setInvoiceType] = useState("progress");
  const [depositAmount, setDepositAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedParts, setSelectedParts] = useState([]);
  const [manualLines, setManualLines] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingValidation, setBillingValidation] = useState(null);

  // Existing draft detection
  const [existingDraft, setExistingDraft] = useState(null);
  const [checkingDraft, setCheckingDraft] = useState(false);

  // Credit state
  const [availableCredit, setAvailableCredit] = useState(0);
  const [creditToApply, setCreditToApply] = useState(null);
  const [creditInputValue, setCreditInputValue] = useState("");

  const normalizedProjectId = normalizeProjectId(selectedProjectId);

  // ── Reset on open/close ──
  useEffect(() => {
    if (open) {
      const pid = normalizeProjectId(preselectedProjectId);
      setSelectedProjectId(pid ?? null);
      setSelectedParts(initialSelectedItems || []);
      setInvoiceType("progress");
      setDepositAmount("");
      setNotes("");
      setManualLines([]);
      setCreditToApply(null);
      setCreditInputValue("");
      setAvailableCredit(0);
      setExistingDraft(null);
      setCheckingDraft(false);
    }
  }, [open, preselectedProjectId]);

  // ── Check for existing active draft when project+type changes ──
  useEffect(() => {
    if (!open || !selectedProjectId || !invoiceType) {
      setExistingDraft(null);
      return;
    }
    let cancelled = false;
    setCheckingDraft(true);
    setExistingDraft(null);
    (async () => {
      try {
        const drafts = await base44.entities.ProjectInvoice.filter({
          project_id: selectedProjectId,
          invoice_type: invoiceType,
          status: 'draft',
        });
        if (!cancelled && drafts.length > 0) {
          const draft = drafts[0];
          const lines = await base44.entities.ProjectInvoiceLine.filter({ invoice_id: draft.id });
          setExistingDraft({ ...draft, line_count: lines.length });
        } else if (!cancelled) {
          setExistingDraft(null);
        }
      } catch (e) {
        console.warn('Failed to check existing draft:', e);
        if (!cancelled) setExistingDraft(null);
      } finally {
        if (!cancelled) setCheckingDraft(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedProjectId, invoiceType]);

  // ── Fetch billing validation once ──
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await base44.functions.invoke("getProjectsBillingSummary", {});
        setBillingValidation(res.data?._validation || null);
      } catch (e) {
        console.warn('Failed to fetch billing validation:', e);
      }
    })();
  }, [open]);

  // ── Fetch credit for selected project ──
  useEffect(() => {
    if (!normalizedProjectId || !open) {
      setAvailableCredit(0);
      return;
    }
    (async () => {
      try {
        const credits = await base44.entities.ProjectCreditLedger.filter({ project_id: normalizedProjectId });
        const total = credits.reduce((s, c) => s + (c.remaining_amount ?? 0), 0);
        setAvailableCredit(total);
      } catch (e) {
        console.warn('Failed to fetch credits:', e);
      }
    })();
  }, [normalizedProjectId, open]);

  // ── Computed totals (memoized) ──
  const partsGrossTotal = useMemo(() => {
    return selectedParts.reduce((sum, p) => sum + (p.line_total || 0), 0);
  }, [selectedParts]);

  const manualTotal = useMemo(() => {
    return manualLines.reduce((sum, l) => sum + (l.amount || 0), 0);
  }, [manualLines]);

  const totalCost = useMemo(() => {
    return selectedParts.reduce((sum, p) => sum + (p.cost_total || 0), 0);
  }, [selectedParts]);

  const subtotal = invoiceType === "deposit" 
    ? parseFloat(depositAmount) || 0 
    : partsGrossTotal + manualTotal;

  const suggestedCredit = Math.min(availableCredit, subtotal);
  const effectiveCreditToApply = creditToApply !== null ? creditToApply : suggestedCredit;

  const creditValidationError = useMemo(() => {
    if (effectiveCreditToApply < 0) return "Credit cannot be negative";
    if (effectiveCreditToApply > availableCredit) return `Exceeds available credit (${formatCurrencyUSD(availableCredit)})`;
    if (effectiveCreditToApply > subtotal) return `Exceeds invoice subtotal (${formatCurrencyUSD(subtotal)})`;
    return null;
  }, [effectiveCreditToApply, availableCredit, subtotal]);

  const balanceDue = Math.max(0, subtotal - effectiveCreditToApply);

  // ── Item count for display ──
  const lineItemCount = invoiceType === "deposit" 
    ? 1 
    : selectedParts.length + manualLines.filter(l => l.amount > 0).length;

  // ── Validation ──
  const validationFailed = billingValidation?.ok === false;
  
  const canSubmit = useMemo(() => {
    if (!selectedProjectId) return false;
    if (validationFailed) return false;
    if (creditValidationError) return false;
    if (isSubmitting) return false;
    if (invoiceType === "deposit") return (parseFloat(depositAmount) || 0) > 0;
    return (selectedParts.length > 0 || manualLines.some(l => l.amount > 0)) && subtotal > 0;
  }, [selectedProjectId, validationFailed, creditValidationError, isSubmitting, invoiceType, depositAmount, selectedParts, manualLines, subtotal]);

  // ── Submit handler ──
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    
    setIsSubmitting(true);
    try {
      const lines = [];

      for (const item of selectedParts) {
        if (!item.source_id) continue;
        const linePayload = {
          type: item.type || "part",
          source_entity: item.source_entity,
          source_id: item.source_id,
          description: item.description || item.part_name || 'Item',
          qty: item.qty ?? 1,
          unit_price: item.unit_price ?? 0,
        };
        // Phase 1: Pass service children for expanded invoice lines
        if (item.type === 'service' && item.children?.length > 0) {
          linePayload.expanded_lines = item.children;
        }
        lines.push(linePayload);
      }

      for (const line of manualLines) {
        if (line.description && line.amount > 0) {
          lines.push({
            type: line.type,
            description: line.description,
            qty: 1,
            unit_price: line.amount,
          });
        }
      }

      if (invoiceType === "deposit" && lines.length === 0) {
        lines.push({
          type: "manual",
          description: "Project Deposit",
          qty: 1,
          unit_price: parseFloat(depositAmount) || 0,
        });
      }

      if (import.meta.env.DEV) {
        guardInvoiceMutation('createProjectInvoiceDraft', 'CreateProjectInvoiceModal');
      }

      const response = await base44.functions.invoke("createProjectInvoiceDraft", {
        project_id: selectedProjectId,
        invoice_type: invoiceType,
        lines,
        notes,
        credit_to_apply: effectiveCreditToApply,
      });

      if (response.data?.success) {
        toast({ title: "Invoice draft created", variant: "default" });
        
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: billingKeys.states(normalizedProjectId) }),
          queryClient.invalidateQueries({ queryKey: invoiceKeys.view(normalizedProjectId) }),
          queryClient.invalidateQueries({ queryKey: invoiceKeys.view(null) }),
          queryClient.invalidateQueries({ queryKey: creditKeys.allocations(normalizedProjectId) }),
          queryClient.invalidateQueries({ queryKey: ["billableItems", normalizedProjectId] }),
          queryClient.invalidateQueries({ queryKey: ["billingSummary"] }),
        ]);
        
        onSuccess?.();
      } else if (response.data?.existing_draft) {
        // Backend detected a race condition — another draft was created between our check and save
        setExistingDraft({
          ...response.data.existing_invoice,
          line_count: response.data.existing_invoice?.line_count ?? 0,
        });
        toast({ title: "A draft already exists for this project and type", variant: "default" });
      } else {
        toast({ title: response.data?.error || "Failed to create invoice", variant: "destructive" });
      }
    } catch (error) {
      console.error("Invoice creation error:", error);
      toast({ title: error.message || "Failed to create invoice", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, selectedParts, manualLines, invoiceType, depositAmount, selectedProjectId, notes, effectiveCreditToApply, normalizedProjectId, queryClient, onSuccess]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg">Create Invoice</DialogTitle>
          <DialogDescription className="sr-only">
            Single-screen invoice builder
          </DialogDescription>
        </DialogHeader>

        {/* Validation banner */}
        <BillingValidationBanner validation={billingValidation} />

        {/* ── HEADER: Project + Type ── */}
        <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Project</Label>
            <FinancialProjectSelector
              value={selectedProjectId ?? undefined}
              onValueChange={(val) => {
                if (!val) return;
                setSelectedProjectId(val);
                setSelectedParts([]);
                setCreditToApply(null);
                setCreditInputValue("");
              }}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Invoice Type</Label>
            <Select value={invoiceType} onValueChange={setInvoiceType}>
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="progress">Progress</SelectItem>
                <SelectItem value="final">Final</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator className="bg-gray-700/50" />

        {/* ── BODY: Scrollable content ── */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {!selectedProjectId ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <FileText className="w-8 h-8 mb-2 text-gray-600" />
              <p>Select a project to begin</p>
            </div>
          ) : checkingDraft ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <Loader2 className="w-6 h-6 mb-2 animate-spin text-gray-500" />
              <p className="text-sm">Checking for existing drafts…</p>
            </div>
          ) : existingDraft ? (
            /* ── EXISTING DRAFT DETECTED ── */
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <div className="w-full max-w-md p-5 rounded-lg border border-amber-700/50 bg-amber-950/20 space-y-4">
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-semibold text-base">Draft Already Exists</h3>
                </div>
                <p className="text-sm text-gray-300">
                  An active <span className="font-medium capitalize text-white">{existingDraft.invoice_type}</span> draft already exists for this project.
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Subtotal</span>
                    <p className="font-mono text-white">{formatCurrencyUSD(existingDraft.subtotal || 0)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Balance Due</span>
                    <p className="font-mono text-white">{formatCurrencyUSD(existingDraft.balance_due || 0)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Lines</span>
                    <p className="text-white">{existingDraft.line_count ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Created</span>
                    <p className="text-white">
                      {existingDraft.created_date
                        ? new Date(existingDraft.created_date).toLocaleDateString()
                        : '—'}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700 mt-2"
                  onClick={() => {
                    onClose();
                    // Open the existing draft in the detail drawer by passing its ID up
                    if (onOpenDraft) {
                      onOpenDraft(existingDraft.id);
                    }
                  }}
                >
                  <ArrowRight className="w-4 h-4" />
                  Continue Draft
                </Button>
              </div>
            </div>
          ) : invoiceType === "deposit" ? (
            /* ── DEPOSIT FLOW ── */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Deposit Amount</Label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-lg">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="text-lg font-mono"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Invoice notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          ) : (
            /* ── PROGRESS / FINAL FLOW ── */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Billable Items</Label>
                <Button variant="outline" size="sm" onClick={() => setManualLines(prev => [...prev, { id: Date.now(), description: "", amount: 0, type: "outside_cost" }])} className="gap-1 h-7 text-xs">
                  <Plus className="w-3 h-3" />
                  Manual Line
                </Button>
              </div>

              <BillableItemsSelector
                projectId={selectedProjectId}
                selectedItems={selectedParts}
                onSelectionChange={setSelectedParts}
              />

              <ManualLinesSection
                lines={manualLines}
                onUpdate={(id, field, value) =>
                  setManualLines(prev => prev.map(l => l.id === id ? { ...l, [field]: field === "amount" ? parseFloat(value) || 0 : value } : l))
                }
                onRemove={(id) => setManualLines(prev => prev.filter(l => l.id !== id))}
              />

              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Notes (optional)</Label>
                <Textarea
                  placeholder="Invoice notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── TOTALS PANEL (always visible, hidden when existing draft shown) ── */}
        {selectedProjectId && !existingDraft && !checkingDraft && (
          <InvoiceTotalsPanel
            subtotal={subtotal}
            totalCost={invoiceType === "deposit" ? 0 : totalCost}
            availableCredit={availableCredit}
            effectiveCreditToApply={effectiveCreditToApply}
            creditInputValue={creditInputValue}
            creditValidationError={creditValidationError}
            suggestedCredit={suggestedCredit}
            balanceDue={balanceDue}
            lineItemCount={lineItemCount}
            onCreditChange={(val) => {
              setCreditInputValue(val);
              const parsed = parseFloat(val);
              setCreditToApply(isNaN(parsed) ? null : parsed);
            }}
            onCreditReset={() => {
              setCreditToApply(null);
              setCreditInputValue("");
            }}
            maxCredit={Math.min(availableCredit, subtotal)}
          />
        )}

        {/* ── ACTION BAR ── */}
        {!existingDraft && (
          <div className="flex-shrink-0 flex items-center justify-between border-t border-gray-700 pt-3 mt-1">
            <div className="text-sm text-gray-400">
              {selectedProjectId && subtotal > 0 && (
                <span className="text-white font-medium">
                  {lineItemCount} item{lineItemCount !== 1 ? 's' : ''} — {formatCurrencyUSD(subtotal)}
                </span>
              )}
              {validationFailed && (
                <span className="text-red-400 ml-2 text-xs flex items-center gap-1 inline-flex">
                  <AlertTriangle className="w-3 h-3" />
                  Billing validation failed
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={!canSubmit}
                className="bg-green-600 hover:bg-green-700 gap-1"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Draft
              </Button>
            </div>
          </div>
        )}
        {existingDraft && (
          <div className="flex-shrink-0 flex justify-end border-t border-gray-700 pt-3 mt-1">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}