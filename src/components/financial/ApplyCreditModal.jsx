import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DollarSign,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * ApplyCreditModal - Apply project credits to commitments
 * 
 * PHASE 4: UI for credit allocation
 * - Shows preview with dry_run=true
 * - Confirms and executes with dry_run=false
 * - Supports both auto and selected commitment modes
 */
export default function ApplyCreditModal({
  open,
  onClose,
  projectId,
  projectName,
  selectedCommitmentIds = [],
  creditSummary = {},
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const [previewData, setPreviewData] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const hasSelectedCommitments = selectedCommitmentIds.length > 0;
  const mode = 'auto'; // Always auto for now

  // Preview mutation (dry_run=true)
  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('applyProjectCreditToCommitments', {
        project_id: projectId,
        commitment_ids: hasSelectedCommitments ? selectedCommitmentIds : undefined,
        mode,
        dry_run: true,
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

  // Execute mutation (dry_run=false)
  const executeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('applyProjectCreditToCommitments', {
        project_id: projectId,
        commitment_ids: hasSelectedCommitments ? selectedCommitmentIds : undefined,
        mode,
        dry_run: false,
      });
      return response.data;
    },
    onSuccess: async (data) => {
      if (data.success) {
        toast.success(`Applied ${formatCurrencyUSD(data.summary.credit_applied_now)} credit`);
        
        // PHASE 1 UNIFIED: Deterministic refresh - ensures both surfaces update
        await forceAppRefresh(queryClient, { projectIds: [projectId] });
        
        onSuccess?.();
        handleClose();
      } else {
        toast.error(data.error || 'Failed to apply credit');
      }
    },
    onError: (error) => {
      toast.error(`Application failed: ${error.message}`);
    },
  });

  // Load preview when modal opens
  React.useEffect(() => {
    if (open && projectId) {
      setPreviewData(null);
      setIsConfirming(false);
      previewMutation.mutate();
    }
  }, [open, projectId, selectedCommitmentIds.join(',')]);

  const handleClose = () => {
    setPreviewData(null);
    setIsConfirming(false);
    onClose();
  };

  const handleConfirm = () => {
    setIsConfirming(true);
    executeMutation.mutate();
  };

  const summary = previewData?.summary || {};
  const hasCredit = (summary.credit_to_apply || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="w-5 h-5 text-green-400" />
            Apply Credit
            {hasSelectedCommitments && (
              <Badge variant="outline" className="ml-2">
                {selectedCommitmentIds.length} selected
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {hasSelectedCommitments 
              ? `Apply available credit to ${selectedCommitmentIds.length} selected commitment(s)`
              : `Apply available credit to all open commitments for ${projectName}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {previewMutation.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-400">Calculating allocation...</span>
            </div>
          ) : previewData ? (
            <>
              {/* Summary Strip */}
              <div className="grid grid-cols-4 gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Gross Exposure</p>
                  <p className="text-lg font-bold text-white">
                    {formatCurrencyUSD(summary.gross_exposure || 0)}
                  </p>
                </div>
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
                  <p className="text-xs text-gray-500 uppercase">Net Exposure</p>
                  <p className="text-lg font-bold text-amber-400">
                    {formatCurrencyUSD(summary.net_exposure || 0)}
                  </p>
                </div>
              </div>

              {/* Allocation Plan */}
              {previewData.allocation_plan?.length > 0 ? (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2">
                    Allocation Plan ({previewData.allocation_plan.length} allocations)
                  </h4>
                  <ScrollArea className="h-[200px] border border-gray-700 rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-700">
                          <TableHead className="text-gray-400">Commitment</TableHead>
                          <TableHead className="text-right text-gray-400">Gross</TableHead>
                          <TableHead className="text-right text-gray-400">Credit</TableHead>
                          <TableHead className="text-right text-gray-400">Net</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.per_commitment
                          ?.filter(c => c.credit_applied_new > 0 || c.net > 0)
                          .map((c, idx) => (
                          <TableRow key={c.commitment_id || idx} className="border-gray-800">
                            <TableCell className="text-white text-sm">
                              {c.commitment_id?.slice(0, 8)}...
                            </TableCell>
                            <TableCell className="text-right text-gray-300">
                              {formatCurrencyUSD(c.gross)}
                            </TableCell>
                            <TableCell className="text-right">
                              {c.credit_applied_new > 0 ? (
                                <span className="text-green-400">
                                  -{formatCurrencyUSD(c.credit_applied_new)}
                                </span>
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-amber-400">
                              {formatCurrencyUSD(c.net)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  {summary.credit_available === 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="w-8 h-8 text-amber-400" />
                      <p>No credit available to apply</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                      <p>All commitments are fully covered</p>
                    </div>
                  )}
                </div>
              )}

              {/* Credit Sources */}
              {previewData.available_credits?.length > 0 && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Credit Sources: </span>
                  {previewData.available_credits.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ', '}
                      {formatCurrencyUSD(c.remaining_before)}
                      {c.remaining_after !== c.remaining_before && (
                        <span className="text-green-400">
                          {' → '}{formatCurrencyUSD(c.remaining_after)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-400">
              Failed to load preview
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!hasCredit || executeMutation.isPending || isConfirming}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            {executeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Apply {formatCurrencyUSD(summary.credit_to_apply || 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}