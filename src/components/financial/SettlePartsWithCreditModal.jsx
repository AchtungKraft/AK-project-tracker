import React, { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { billingKeys, creditKeys } from "./queryKeyFactories";

/**
 * PHASE 3 — Settle Parts With Credit Modal
 * 
 * Allows users to apply project credit directly to selected parts,
 * marking them as PAID without generating an invoice.
 * 
 * WORKFLOW:
 * 1. User selects parts they want to settle
 * 2. Modal shows preview (dry_run=true, settle_parts=true)
 * 3. User confirms → executes (dry_run=false, settle_parts=true)
 * 4. Parts that are fully covered become PAID
 * 
 * BUSINESS RULES:
 * - Credit is applied in the order commitments are provided
 * - If credit runs out, remaining parts stay NOT_INVOICED
 * - Parts with 0 outstanding cannot be settled
 * - Already-paid parts are not shown
 */
export default function SettlePartsWithCreditModal({
  open,
  onClose,
  projectId,
  projectName,
  selectedCommitmentIds = [], // Pre-selected from parent (e.g., PSM action)
  availableCredit = 0,
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const [previewData, setPreviewData] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // DETERMINISTIC: Normalize project ID
  const normalizedProjectId = projectId ? String(projectId) : "";

  const hasSelectedCommitments = selectedCommitmentIds.length > 0;

  // Preview mutation (dry_run=true, settle_parts=true)
  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('applyProjectCreditToCommitments', {
        project_id: normalizedProjectId,
        commitment_ids: hasSelectedCommitments ? selectedCommitmentIds : undefined,
        mode: 'auto',
        dry_run: true,
        settle_parts: true, // PHASE 3: Preview settlement
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        setPreviewData(data);
      } else {
        toast.error(data.error || 'Failed to generate preview');
      }
    },
    onError: (error) => {
      toast.error(`Preview failed: ${error.message}`);
    },
  });

  // Execute mutation (dry_run=false, settle_parts=true)
  const executeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('applyProjectCreditToCommitments', {
        project_id: normalizedProjectId,
        commitment_ids: hasSelectedCommitments ? selectedCommitmentIds : undefined,
        mode: 'auto',
        dry_run: false,
        settle_parts: true, // PHASE 3: Execute settlement
      });
      return response.data;
    },
    onSuccess: async (data) => {
      if (data.success) {
        const settledCount = data.settled_commitments?.length || 0;
        const appliedAmount = data.summary?.credit_applied_now || 0;
        
        toast.success(
          settledCount > 0 
            ? `Settled ${settledCount} part(s) with ${formatCurrencyUSD(appliedAmount)} credit`
            : `Applied ${formatCurrencyUSD(appliedAmount)} credit (no parts fully settled)`
        );
        
        // Invalidate relevant queries
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: billingKeys.project(normalizedProjectId) }),
          queryClient.invalidateQueries({ queryKey: creditKeys.project(normalizedProjectId) }),
          queryClient.invalidateQueries({ queryKey: ["partCommitments", normalizedProjectId] }),
        ]);
        
        // Force app refresh for consistency
        forceAppRefresh(['supply', 'financial']);
        
        onSuccess?.();
        handleClose();
      } else {
        toast.error(data.error || 'Failed to settle parts');
      }
    },
    onError: (error) => {
      toast.error(`Settlement failed: ${error.message}`);
    },
  });

  // Load preview when modal opens
  React.useEffect(() => {
    if (open && projectId && hasSelectedCommitments) {
      setPreviewData(null);
      setIsConfirming(false);
      setConfirmChecked(false);
      previewMutation.mutate();
    }
  }, [open, projectId, selectedCommitmentIds.join(',')]);

  const handleClose = () => {
    setPreviewData(null);
    setIsConfirming(false);
    setConfirmChecked(false);
    onClose();
  };

  const handleConfirm = () => {
    setIsConfirming(true);
    executeMutation.mutate();
  };

  const summary = previewData?.summary || {};
  const perCommitment = previewData?.per_commitment || [];
  const hasCredit = (summary.credit_to_apply || 0) > 0;
  const willSettleCount = summary.commitments_to_settle || 0;
  const partialCount = summary.commitments_partially_settled || 0;

  // Categorize commitments for display
  const { toSettle, partial, noCredit } = useMemo(() => {
    const toSettle = perCommitment.filter(c => c.will_be_settled);
    const partial = perCommitment.filter(c => c.credit_applied_new > 0 && !c.will_be_settled);
    const noCredit = perCommitment.filter(c => c.credit_applied_new === 0 && c.net > 0);
    return { toSettle, partial, noCredit };
  }, [perCommitment]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="w-5 h-5 text-green-400" />
            Apply Credit Without Invoice
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            This settles selected commitments directly using existing project credit. No invoice will be created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!hasSelectedCommitments ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Package className="w-10 h-10 mb-2" />
              <p>No parts selected. Select parts to settle with credit.</p>
            </div>
          ) : previewMutation.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-400">Calculating settlement...</span>
            </div>
          ) : previewData ? (
            <>
              {/* Summary Strip */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Credit Available</p>
                  <p className="text-lg font-bold text-green-400">
                    {formatCurrencyUSD(summary.credit_available || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">To Apply</p>
                  <p className="text-lg font-bold text-blue-400">
                    {formatCurrencyUSD(summary.credit_to_apply || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Will Settle</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {willSettleCount} part{willSettleCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Settlement Preview */}
              <ScrollArea className="h-[280px]">
                <div className="space-y-4">
                  {/* Parts to be fully settled */}
                  {toSettle.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-400">
                          Will be marked PAID ({toSettle.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {toSettle.map((c) => (
                          <div 
                            key={c.commitment_id}
                            className="flex items-center justify-between p-2 bg-emerald-900/20 border border-emerald-800/30 rounded text-sm"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-300 truncate block font-medium">
                                {c.part_name || (c.part_id ? `Part ${c.part_id.slice(-6)}` : c.commitment_id.slice(-8))}
                              </span>
                              {c.part_number && (
                                <span className="text-xs text-gray-500">{c.part_number}</span>
                              )}
                              {c.description && c.description !== c.part_name && (
                                <span className="text-xs text-gray-500 block truncate">{c.description}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs flex-shrink-0">
                              <span className="text-gray-500">
                                {formatCurrencyUSD(c.gross || c.outstanding_retail_amount || 0)}
                              </span>
                              <ArrowRight className="w-3 h-3 text-emerald-500" />
                              <Badge className="bg-emerald-600/20 text-emerald-400 text-xs">
                                PAID
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Partially covered parts */}
                  {partial.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-sm font-medium text-amber-400">
                          Partially covered - NOT settled ({partial.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {partial.map((c) => (
                          <div 
                            key={c.commitment_id}
                            className="flex items-center justify-between p-2 bg-amber-900/20 border border-amber-800/30 rounded text-sm"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-300 truncate block font-medium">
                                {c.part_name || (c.part_id ? `Part ${c.part_id.slice(-6)}` : c.commitment_id.slice(-8))}
                              </span>
                              {c.part_number && (
                                <span className="text-xs text-gray-500">{c.part_number}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs flex-shrink-0">
                              <span className="text-gray-500">
                                {formatCurrencyUSD(c.gross || c.outstanding_retail_amount || 0)}
                              </span>
                              <span className="text-amber-400">
                                -{formatCurrencyUSD(c.credit_applied_new)}
                              </span>
                              <Badge className="bg-amber-600/20 text-amber-400 text-xs">
                                {formatCurrencyUSD(c.net)} remaining
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-amber-500 mt-1">
                        These parts will receive credit but remain NOT_INVOICED (insufficient credit to fully settle).
                      </p>
                    </div>
                  )}

                  {/* No credit applied */}
                  {noCredit.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-500">
                          No credit applied ({noCredit.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {noCredit.map((c) => (
                          <div 
                            key={c.commitment_id}
                            className="flex items-center justify-between p-2 bg-gray-800/50 border border-gray-700 rounded text-sm"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-400 truncate block">
                                {c.part_name || (c.part_id ? `Part ${c.part_id.slice(-6)}` : c.commitment_id.slice(-8))}
                              </span>
                              {c.part_number && (
                                <span className="text-xs text-gray-500">{c.part_number}</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0">
                              {formatCurrencyUSD(c.net || c.outstanding_retail_amount || 0)} outstanding
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Credit was exhausted before reaching these parts.
                      </p>
                    </div>
                  )}

                  {/* No allocations possible */}
                  {!hasCredit && (
                    <div className="flex flex-col items-center justify-center py-6 text-gray-500">
                      <Wallet className="w-8 h-8 mb-2 text-gray-600" />
                      <p>No credit available to apply</p>
                      <p className="text-xs mt-1">
                        Available: {formatCurrencyUSD(summary.credit_available || 0)}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* PART 3: Credit Application Summary */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-gray-800/30 rounded-lg border border-gray-700 text-xs">
                <div className="text-center">
                  <p className="text-gray-500">Credit Used</p>
                  <p className="font-bold text-blue-400">{formatCurrencyUSD(summary.credit_to_apply || 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Commitments Settled</p>
                  <p className="font-bold text-emerald-400">{willSettleCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Credit Remaining</p>
                  <p className="font-bold text-gray-300">
                    {formatCurrencyUSD((summary.credit_available || 0) - (summary.credit_to_apply || 0))}
                  </p>
                </div>
              </div>

              {/* Confirmation checkbox for settlements */}
              {willSettleCount > 0 && (
                <div className="p-3 bg-emerald-900/20 border border-emerald-800/30 rounded-lg">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={confirmChecked}
                      onCheckedChange={setConfirmChecked}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <p className="text-emerald-300 font-medium">
                        I understand that {willSettleCount} part(s) will be marked as PAID
                      </p>
                      <p className="text-gray-400 text-xs mt-1">
                        These parts will be settled using project credit without generating an invoice.
                        This action cannot be easily undone.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !hasCredit || 
              isConfirming || 
              executeMutation.isPending ||
              (willSettleCount > 0 && !confirmChecked)
            }
            className={cn(
              "gap-2",
              willSettleCount > 0 
                ? "bg-emerald-600 hover:bg-emerald-700" 
                : "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {(isConfirming || executeMutation.isPending) && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            {willSettleCount > 0 
              ? `Settle ${willSettleCount} Part${willSettleCount !== 1 ? 's' : ''}`
              : 'Apply Credit'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}