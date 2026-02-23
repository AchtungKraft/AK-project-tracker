import React, { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  DollarSign,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import FinancialProjectSelector from "./FinancialProjectSelector";
import BillablePartsSelector from "./BillablePartsSelector";
import { useFinancialProjectsView, useBillingAndProcurementStates } from "./useFinancialProjectsView";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import CreditSummaryStrip from "./CreditSummaryStrip";

const STEPS = ["project", "type", "lines", "review"];

/**
 * PHASE 1 REFACTOR — Invoice Builder Flow
 * 
 * NOW USES getBillingAndProcurementStates as CANONICAL exposure engine.
 * 
 * Step 1: Select Project (grouped by type, only eligible shown)
 * Step 2: Select Billing Type (deposit, progress, final)
 * Step 3: Select Parts / Add Lines (uses canonical commitments from getBillingAndProcurementStates)
 * Step 4: Review Summary (displays gross, credit applied, net from canonical source)
 */
export default function CreateProjectInvoiceModal({ 
  open, 
  onClose, 
  onSuccess,
  preselectedProjectId = null, // PHASE 1: Allow pre-selection from ForwardInvoiceDashboard
}) {
  const queryClient = useQueryClient();
  // If project is preselected, skip to step 1 (type selection)
  const [step, setStep] = useState(preselectedProjectId ? 1 : 0);
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProjectId || "");
  const [invoiceType, setInvoiceType] = useState("progress");
  const [depositAmount, setDepositAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedParts, setSelectedParts] = useState([]);
  const [manualLines, setManualLines] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Reset state when modal opens with preselected project
  React.useEffect(() => {
    if (open && preselectedProjectId) {
      setSelectedProjectId(preselectedProjectId);
      setStep(1); // Skip project selection
    } else if (open && !preselectedProjectId) {
      setStep(0);
      setSelectedProjectId("");
    }
  }, [open, preselectedProjectId]);

  // Get financial projects data for project dropdown
  const { data: financialData } = useFinancialProjectsView();
  const selectedProjectFinancials = financialData?.projects?.find(
    (p) => p.project_id === selectedProjectId
  );

  // PHASE 1 CANONICAL: Use getBillingAndProcurementStates as single source of truth
  const { data: billingData, isLoading: billingLoading } = useBillingAndProcurementStates(
    selectedProjectId,
    { enabled: !!selectedProjectId && open }
  );

  // PHASE 1: Extract canonical totals from billing data
  const canonicalTotals = billingData?.totals || {};
  const canonicalCreditSummary = billingData?.credit_summary || {};
  const availableCredit = canonicalCreditSummary.total_credit_available || 0;
  const creditAppliedTotal = canonicalCreditSummary.total_credit_applied || 0;
  const grossExposure = canonicalTotals.gross_exposure || 0;
  const netExposure = canonicalTotals.net_exposure || 0;

  // PHASE 5: Remove frontend exposure math - use canonical values from backend
  // Calculate totals - these are for the invoice being CREATED, not exposure calculation
  const partsTotal = useMemo(() => {
    // Use net_exposure from selected parts (already credit-adjusted from backend)
    return selectedParts.reduce((sum, p) => sum + (p.net_exposure || p.line_total || 0), 0);
  }, [selectedParts]);

  const partsGrossTotal = useMemo(() => {
    return selectedParts.reduce((sum, p) => sum + (p.gross_exposure || p.line_total || 0), 0);
  }, [selectedParts]);

  const partsCreditApplied = useMemo(() => {
    return selectedParts.reduce((sum, p) => sum + (p.credit_applied || 0), 0);
  }, [selectedParts]);

  const manualTotal = useMemo(() => {
    return manualLines.reduce((sum, l) => sum + (l.amount || 0), 0);
  }, [manualLines]);

  // PHASE 5: Use canonical net values - no frontend credit math
  const subtotal = invoiceType === "deposit" 
    ? parseFloat(depositAmount) || 0 
    : partsTotal + manualTotal;

  // For display: gross total before credit
  const grossSubtotal = invoiceType === "deposit"
    ? parseFloat(depositAmount) || 0
    : partsGrossTotal + manualTotal;

  // Credit preview: backend already applied credits to selected parts
  const creditPreview = partsCreditApplied;
  const balanceDue = subtotal; // Net exposure is already credit-adjusted

  // Manual line handlers
  const handleAddManualLine = () => {
    setManualLines([
      ...manualLines,
      { id: Date.now(), description: "", amount: 0, type: "outside_cost" },
    ]);
  };

  const handleRemoveManualLine = (id) => {
    setManualLines(manualLines.filter((l) => l.id !== id));
  };

  const handleUpdateManualLine = (id, field, value) => {
    setManualLines(
      manualLines.map((l) =>
        l.id === id ? { ...l, [field]: field === "amount" ? parseFloat(value) || 0 : value } : l
      )
    );
  };

  // Validation
  const canProceed = () => {
    switch (step) {
      case 0:
        return !!selectedProjectId;
      case 1:
        return !!invoiceType;
      case 2:
        if (invoiceType === "deposit") {
          return parseFloat(depositAmount) > 0;
        }
        return selectedParts.length > 0 || manualLines.length > 0;
      case 3:
        return subtotal > 0;
      default:
        return false;
    }
  };

  const getValidationMessage = () => {
    switch (step) {
      case 0:
        return "Select a project to continue";
      case 2:
        if (invoiceType === "deposit") {
          return "Enter a deposit amount";
        }
        return "Add at least one line item";
      default:
        return null;
    }
  };

  const handleNext = () => {
    if (!canProceed()) {
      const msg = getValidationMessage();
      if (msg) toast.error(msg);
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    // PHASE 6 Safety Guards
    if (subtotal <= 0) {
      toast.error("Invoice total must be greater than zero");
      return;
    }
    if (invoiceType !== "deposit" && selectedParts.length === 0 && manualLines.length === 0) {
      toast.error("Cannot create progress/final invoice without line items");
      return;
    }

    setIsSubmitting(true);
    try {
      // Build lines array using CANONICAL backend-provided fields
      const lines = [];

      // Part lines - use backend-provided qty/price from selector
      for (const part of selectedParts) {
        // Validate part_commitment_id exists
        if (!part.part_commitment_id) {
          console.warn('[CreateProjectInvoiceModal] Skipping part without commitment ID:', part);
          continue;
        }
        
        lines.push({
          type: "part",
          part_commitment_id: part.part_commitment_id,
          description: part.part_name || 'Unknown Part',
          qty: part.qty ?? part.qty_remaining_to_bill ?? 1,
          unit_price: part.unit_price ?? 0,
        });
      }

      // Manual lines
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

      // Deposit line
      if (invoiceType === "deposit" && lines.length === 0) {
        lines.push({
          type: "manual",
          description: "Project Deposit",
          qty: 1,
          unit_price: parseFloat(depositAmount) || 0,
        });
      }

      const payload = {
        project_id: selectedProjectId,
        invoice_type: invoiceType,
        preview_credit: true,
        lines,
        notes,
      };

      const response = await base44.functions.invoke("createProjectInvoiceDraft", payload);

      if (response.data?.success) {
        toast.success("Invoice draft created");
        
        // PHASE 2: Deterministic refresh - await ALL refetches before callback
        await forceAppRefresh(queryClient, {
          projectIds: [selectedProjectId],
          commitmentIds: selectedParts.map(p => p.part_commitment_id).filter(Boolean),
        });
        
        // Explicitly refetch scoped billing states to ensure UI consistency
        await queryClient.refetchQueries({ 
          queryKey: ['billingProcurementStates', selectedProjectId],
          type: 'all'
        });
        await queryClient.refetchQueries({ 
          queryKey: ['projectInvoicesView'],
          type: 'all'
        });
        
        onSuccess?.();
      } else {
        toast.error(response.data?.error || "Failed to create invoice");
      }
    } catch (error) {
      console.error("Invoice creation error:", error);
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((s, idx) => (
        <div key={s} className="flex items-center">
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
              idx < step
                ? "bg-green-600 text-white"
                : idx === step
                ? "bg-red-600 text-white"
                : "bg-gray-700 text-gray-400"
            )}
          >
            {idx < step ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
          </div>
          {idx < STEPS.length - 1 && (
            <div
              className={cn(
                "w-8 h-0.5 mx-1",
                idx < step ? "bg-green-600" : "bg-gray-700"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4 py-4">
            <Label>Select Project</Label>
            <FinancialProjectSelector
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              className="w-full"
            />
            {/* PHASE 1: Show canonical exposure data from getBillingAndProcurementStates */}
            {selectedProjectId && (
              <div className="space-y-3">
                {billingLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-gray-800/50 rounded-lg space-y-2">
                      <p className="text-white font-medium">{selectedProjectFinancials?.project_name || 'Selected Project'}</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-400">Unbilled Items:</span>
                          <span className="ml-2 font-mono text-amber-400">
                            {canonicalTotals.unbilled_count || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Net to Bill:</span>
                          <span className="ml-2 font-mono text-amber-400">
                            {formatCurrencyUSD(canonicalTotals.unbilled_total || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* PHASE 1: Credit summary from canonical source */}
                    {(availableCredit > 0 || creditAppliedTotal > 0) && (
                      <CreditSummaryStrip
                        grossExposure={grossExposure}
                        creditAvailable={availableCredit}
                        creditApplied={creditAppliedTotal}
                        netExposure={netExposure}
                        isLoading={billingLoading}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-4 py-4">
            <Label>Invoice Type</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "deposit", label: "Deposit", desc: "Initial payment", icon: DollarSign },
                { value: "progress", label: "Progress", desc: "Ongoing work", icon: FileText },
                { value: "final", label: "Final", desc: "Project completion", icon: CheckCircle2 },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => setInvoiceType(t.value)}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-colors",
                      invoiceType === t.value
                        ? "border-red-500 bg-red-500/10"
                        : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                    )}
                  >
                    <Icon className={cn("w-5 h-5 mb-2", invoiceType === t.value ? "text-red-400" : "text-gray-400")} />
                    <p className="text-white font-medium">{t.label}</p>
                    <p className="text-xs text-gray-400">{t.desc}</p>
                  </button>
                );
              })}
            </div>
            {invoiceType === "deposit" && (
              <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                <p className="text-sm text-blue-300">
                  Deposit invoices allow a manual amount without selecting specific parts.
                </p>
              </div>
            )}
          </div>
        );

      case 2:
        if (invoiceType === "deposit") {
          return (
            <div className="space-y-4 py-4">
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
                />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Invoice notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Select Parts to Bill</Label>
              <Button variant="outline" size="sm" onClick={handleAddManualLine} className="gap-1">
                <Plus className="w-3 h-3" />
                Manual Line
              </Button>
            </div>

            <BillablePartsSelector
              projectId={selectedProjectId}
              selectedItems={selectedParts}
              onSelectionChange={setSelectedParts}
            />

            {/* Manual Lines */}
            {manualLines.length > 0 && (
              <div className="space-y-2">
                <Label className="text-gray-400">Manual / Outside Costs</Label>
                {manualLines.map((line) => (
                  <div key={line.id} className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg">
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => handleUpdateManualLine(line.id, "description", e.target.value)}
                      className="flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">$</span>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={line.amount || ""}
                        onChange={(e) => handleUpdateManualLine(line.id, "amount", e.target.value)}
                        className="w-24"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveManualLine(line.id)}
                      className="text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Invoice notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4 py-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-medium text-white">Review Invoice</h3>
              <p className="text-sm text-gray-400">Verify details before creating draft</p>
            </div>

            <div className="p-4 bg-gray-800/50 rounded-lg space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Project</span>
                <span className="text-white font-medium">
                  {selectedProjectFinancials?.project_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Type</span>
                <Badge className="bg-purple-600/20 text-purple-400">
                  {invoiceType.charAt(0).toUpperCase() + invoiceType.slice(1)}
                </Badge>
              </div>
              <Separator className="bg-gray-700" />
              <div className="flex justify-between">
                <span className="text-gray-400">Line Items</span>
                <span className="text-white">
                  {invoiceType === "deposit" ? 1 : selectedParts.length + manualLines.filter(l => l.amount > 0).length}
                </span>
              </div>
              <Separator className="bg-gray-700" />
              {/* PHASE 1: Show gross/credit/net breakdown from canonical backend */}
              <div className="flex justify-between">
                <span className="text-gray-400">Gross Total</span>
                <span className="font-mono text-gray-300">{formatCurrencyUSD(grossSubtotal)}</span>
              </div>
              {partsCreditApplied > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Credit Applied</span>
                  <span className="font-mono text-green-400">-{formatCurrencyUSD(partsCreditApplied)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold">
                <span className="text-white">Net Balance Due</span>
                <span className="font-mono text-white">{formatCurrencyUSD(balanceDue)}</span>
              </div>
            </div>

            {partsCreditApplied > 0 && (
              <div className="p-3 bg-green-900/20 border border-green-800/50 rounded-lg">
                <p className="text-sm text-green-300">
                  <strong>Credit Applied:</strong> {formatCurrencyUSD(partsCreditApplied)} credit has been pre-applied to these commitments.
                </p>
              </div>
            )}

            <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
              <p className="text-sm text-blue-300">
                This will create a draft invoice. No billing or commitment changes occur until the invoice is sent.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        {renderStepIndicator()}
        {renderStepContent()}

        <DialogFooter className="flex justify-between">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting || !canProceed()}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Draft
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}