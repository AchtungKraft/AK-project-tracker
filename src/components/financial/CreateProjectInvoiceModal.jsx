import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  DollarSign,
  Package,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const STEPS = ["project", "type", "lines", "review"];

export default function CreateProjectInvoiceModal({
  open,
  onClose,
  onSuccess,
  projects,
  creditBalances,
}) {
  const [step, setStep] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [invoiceType, setInvoiceType] = useState("progress");
  const [applyCredit, setApplyCredit] = useState(true);
  const [notes, setNotes] = useState("");
  const [selectedCommitments, setSelectedCommitments] = useState([]);
  const [manualLines, setManualLines] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch commitments for selected project
  const { data: commitments = [], isLoading: loadingCommitments } = useQuery({
    queryKey: ["projectCommitments", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      return base44.entities.PartCommitment.filter({ project_id: selectedProjectId });
    },
    enabled: !!selectedProjectId,
  });

  // Fetch parts for names
  const partIds = [...new Set(commitments.map((c) => c.part_id).filter(Boolean))];
  const { data: parts = [] } = useQuery({
    queryKey: ["partsForInvoice", partIds.sort().join(",")],
    queryFn: async () => {
      if (partIds.length === 0) return [];
      const allParts = await base44.entities.Part.list();
      return allParts.filter((p) => partIds.includes(p.id));
    },
    enabled: partIds.length > 0,
  });

  const partsMap = Object.fromEntries(parts.map((p) => [p.id, p]));

  // Calculate remaining to bill for each commitment
  const billableCommitments = useMemo(() => {
    return commitments
      .filter((c) => {
        const required = c.required_total ?? 0;
        const invoiced = c.invoiced_qty ?? 0;
        const remaining = Math.max(0, required - invoiced);
        return remaining > 0;
      })
      .map((c) => {
        const part = partsMap[c.part_id];
        const required = c.required_total ?? 0;
        const invoiced = c.invoiced_qty ?? 0;
        const remainingQty = Math.max(0, required - invoiced);
        const unitRetail = c.unit_retail_snapshot ?? 0;
        const remainingAmount = remainingQty * unitRetail;

        return {
          ...c,
          part_name: part?.part_name || "Unknown Part",
          vendor_name: part?.default_vendor_id || "—",
          category: part?.category || "—",
          remaining_qty: remainingQty,
          unit_retail: unitRetail,
          remaining_amount: remainingAmount,
        };
      });
  }, [commitments, partsMap]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectCreditBalance = creditBalances[selectedProjectId] || 0;

  // Calculate totals
  const selectedTotal = useMemo(() => {
    const partTotal = selectedCommitments.reduce((sum, sel) => {
      const commitment = billableCommitments.find((c) => c.id === sel.commitment_id);
      if (!commitment) return sum;
      const qty = sel.qty ?? commitment.remaining_qty;
      return sum + qty * commitment.unit_retail;
    }, 0);

    const manualTotal = manualLines.reduce((sum, line) => sum + (line.amount || 0), 0);

    return partTotal + manualTotal;
  }, [selectedCommitments, manualLines, billableCommitments]);

  const creditToApply = applyCredit ? Math.min(projectCreditBalance, selectedTotal) : 0;
  const balanceDue = Math.max(0, selectedTotal - creditToApply);

  const handleToggleCommitment = (commitmentId, checked) => {
    if (checked) {
      const commitment = billableCommitments.find((c) => c.id === commitmentId);
      if (commitment) {
        setSelectedCommitments([
          ...selectedCommitments,
          {
            commitment_id: commitmentId,
            qty: commitment.remaining_qty,
            unit_price: commitment.unit_retail,
          },
        ]);
      }
    } else {
      setSelectedCommitments(selectedCommitments.filter((s) => s.commitment_id !== commitmentId));
    }
  };

  const handleUpdateQty = (commitmentId, qty) => {
    setSelectedCommitments(
      selectedCommitments.map((s) =>
        s.commitment_id === commitmentId ? { ...s, qty: parseFloat(qty) || 0 } : s
      )
    );
  };

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

  const handleNext = () => {
    if (step === 0 && !selectedProjectId) {
      toast.error("Please select a project");
      return;
    }
    if (step === 2 && selectedCommitments.length === 0 && manualLines.length === 0) {
      toast.error("Please add at least one line item");
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Build lines array
      const lines = [];

      // Part lines
      for (const sel of selectedCommitments) {
        const commitment = billableCommitments.find((c) => c.id === sel.commitment_id);
        if (commitment) {
          lines.push({
            type: "part",
            part_commitment_id: sel.commitment_id,
            description: commitment.part_name,
            qty: sel.qty,
            unit_price: sel.unit_price,
          });
        }
      }

      // Manual lines
      for (const line of manualLines) {
        lines.push({
          type: line.type,
          description: line.description,
          qty: 1,
          unit_price: line.amount,
        });
      }

      const payload = {
        project_id: selectedProjectId,
        invoice_type: invoiceType,
        apply_credit: applyCredit,
        lines,
        notes,
      };

      console.log("Creating invoice draft with payload:", payload);

      const response = await base44.functions.invoke("createProjectInvoiceDraft", payload);

      console.log("Invoice creation response:", response);

      if (!response?.data) {
        throw new Error("No response data from server");
      }

      if (response.data?.success) {
        console.log("Invoice created with ID:", response.data.invoice_id);
        toast.success("Invoice draft created");
        
        // Parent controls invalidation via onSuccess callback
        onSuccess?.();
      } else {
        console.error("Invoice creation failed:", response.data?.error);
        toast.error(response.data?.error || "Failed to create invoice");
      }
    } catch (error) {
      console.error("Invoice creation error:", error);
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4 py-4">
            <Label>Select Project</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{p.name}</span>
                      {creditBalances[p.id] > 0 && (
                        <Badge className="bg-green-600/20 text-green-400 text-xs">
                          {formatCurrencyUSD(creditBalances[p.id])} credit
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProject && (
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-white font-medium">{selectedProject.name}</p>
                {selectedProject.client_name && (
                  <p className="text-sm text-gray-400">{selectedProject.client_name}</p>
                )}
                {projectCreditBalance > 0 && (
                  <p className="text-sm text-green-400 mt-1">
                    Credit Balance: {formatCurrencyUSD(projectCreditBalance)}
                  </p>
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
                { value: "deposit", label: "Deposit", desc: "Initial payment" },
                { value: "progress", label: "Progress", desc: "Ongoing work" },
                { value: "final", label: "Final", desc: "Project completion" },
              ].map((t) => (
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
                  <p className="text-white font-medium">{t.label}</p>
                  <p className="text-xs text-gray-400">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Add Line Items</Label>
              <Button variant="outline" size="sm" onClick={handleAddManualLine} className="gap-1">
                <Plus className="w-3 h-3" />
                Manual Line
              </Button>
            </div>

            {/* Parts Section */}
            <div className="space-y-2">
              <p className="text-sm text-gray-400 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Parts (select from remaining to bill)
              </p>
              <ScrollArea className="h-[200px] border border-gray-700 rounded-lg">
                {loadingCommitments ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                  </div>
                ) : billableCommitments.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No parts remaining to bill
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400 text-right">Remaining</TableHead>
                        <TableHead className="text-gray-400 text-right">Unit Price</TableHead>
                        <TableHead className="text-gray-400 text-right">Qty to Bill</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billableCommitments.map((c) => {
                        const isSelected = selectedCommitments.some(
                          (s) => s.commitment_id === c.id
                        );
                        const selectedData = selectedCommitments.find(
                          (s) => s.commitment_id === c.id
                        );

                        return (
                          <TableRow key={c.id} className="border-gray-800">
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) =>
                                  handleToggleCommitment(c.id, checked)
                                }
                              />
                            </TableCell>
                            <TableCell className="text-white">{c.part_name}</TableCell>
                            <TableCell className="text-right font-mono text-gray-300">
                              {c.remaining_qty}
                            </TableCell>
                            <TableCell className="text-right font-mono text-gray-300">
                              {formatCurrencyUSD(c.unit_retail)}
                            </TableCell>
                            <TableCell className="text-right">
                              {isSelected && (
                                <Input
                                  type="number"
                                  min={0}
                                  max={c.remaining_qty}
                                  value={selectedData?.qty ?? c.remaining_qty}
                                  onChange={(e) => handleUpdateQty(c.id, e.target.value)}
                                  className="w-20 text-right"
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </div>

            {/* Manual Lines Section */}
            {manualLines.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Manual / Outside Costs
                </p>
                <div className="space-y-2">
                  {manualLines.map((line) => (
                    <div
                      key={line.id}
                      className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg"
                    >
                      <Select
                        value={line.type}
                        onValueChange={(v) => handleUpdateManualLine(line.id, "type", v)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="outside_cost">Outside Cost</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Description"
                        value={line.description}
                        onChange={(e) =>
                          handleUpdateManualLine(line.id, "description", e.target.value)
                        }
                        className="flex-1"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">$</span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={line.amount || ""}
                          onChange={(e) =>
                            handleUpdateManualLine(line.id, "amount", e.target.value)
                          }
                          className="w-28"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveManualLine(line.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals Preview */}
            <div className="p-3 bg-gray-800/50 rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white font-mono">{formatCurrencyUSD(selectedTotal)}</span>
              </div>
              {projectCreditBalance > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={applyCredit}
                      onCheckedChange={setApplyCredit}
                      id="apply-credit"
                    />
                    <label htmlFor="apply-credit" className="text-gray-400">
                      Apply Credit ({formatCurrencyUSD(projectCreditBalance)} available)
                    </label>
                  </div>
                  {applyCredit && creditToApply > 0 && (
                    <span className="text-green-400 font-mono">
                      -{formatCurrencyUSD(creditToApply)}
                    </span>
                  )}
                </div>
              )}
              <div className="flex justify-between text-sm font-medium pt-1 border-t border-gray-700">
                <span className="text-white">Balance Due</span>
                <span className="text-white font-mono">{formatCurrencyUSD(balanceDue)}</span>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-gray-800/50 rounded-lg space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Project</span>
                <span className="text-white">{selectedProject?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Type</span>
                <Badge className="capitalize">{invoiceType}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Lines</span>
                <span className="text-white">
                  {selectedCommitments.length + manualLines.length} items
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white font-mono">{formatCurrencyUSD(selectedTotal)}</span>
              </div>
              {creditToApply > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Credit Applied</span>
                  <span className="text-green-400 font-mono">
                    -{formatCurrencyUSD(creditToApply)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-700">
                <span className="text-white font-medium">Balance Due</span>
                <span className="text-white font-mono font-medium">
                  {formatCurrencyUSD(balanceDue)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add any notes for this invoice..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
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
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Create Invoice
            <span className="text-sm text-gray-400 font-normal ml-2">
              Step {step + 1} of {STEPS.length}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicators */}
        <div className="flex items-center gap-2 py-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-red-500" : "bg-gray-700"
              )}
            />
          ))}
        </div>

        {renderStepContent()}

        <DialogFooter className="gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              Save Draft
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}