import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Wallet, Loader2, Package, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { billingKeys, creditKeys } from "./queryKeyFactories";
import SettlementPartRow from "./settlement/SettlementPartRow";
import SettlementSummaryStrip from "./settlement/SettlementSummaryStrip";
import { previewSettlement, executeSettlement, errorMessage, settlementKeys } from "./settlement/settlementApi";

/**
 * Settle selected parts with GENERAL project credit (no invoice). The server decides every amount:
 * eligible = part total − invoiced − amounts on active drafts − earlier credit settlements, limited by
 * available general credit (net of draft reservations). One request key per opening makes retries safe.
 */
export default function SettlePartsWithCreditModal({ open, onClose, projectId, selectedCommitmentIds = [], onSuccess }) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [requestKey, setRequestKey] = useState(null);
  const pid = projectId ? String(projectId) : "";
  const ids = selectedCommitmentIds;

  const previewMutation = useMutation({
    mutationFn: () => previewSettlement(pid, ids),
    onSuccess: setPreview,
    onError: (e) => toast({ title: "Preview failed", description: errorMessage(e), variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: () => executeSettlement(pid, ids, requestKey),
    onSuccess: async (data) => {
      const n = data.settled_commitments?.length || 0;
      toast({ title: data.duplicate ? "Settlement already recorded" : `Applied ${formatCurrencyUSD(data.summary?.credit_applied_now || 0)} credit`,
        description: data.duplicate ? "Nothing was applied twice." : n ? `${n} part(s) fully settled.` : "Remaining part amounts stay billable." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: billingKeys.project(pid) }),
        queryClient.invalidateQueries({ queryKey: creditKeys.project(pid) }),
        queryClient.invalidateQueries({ queryKey: settlementKeys.history(pid) }),
      ]);
      onSuccess?.();
      onClose();
    },
    onError: (e) => {
      queryClient.invalidateQueries({ queryKey: settlementKeys.history(pid) });
      toast({ title: "Settlement not completed", description: errorMessage(e), variant: "destructive" });
    },
  });

  useEffect(() => {
    if (open && pid && ids.length) {
      setPreview(null);
      setConfirmed(false);
      setRequestKey(crypto.randomUUID());
      previewMutation.mutate();
    }
  }, [open, pid, ids.join(",")]);

  const summary = preview?.summary || {};
  const rows = preview?.per_commitment || [];
  const toApply = summary.credit_to_apply || 0;
  const settleCount = summary.commitments_to_settle || 0;
  const incomplete = (summary.incomplete_settlements || 0) > 0;
  const busy = executeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={() => !busy && onClose()}>
      <DialogContent className="max-w-3xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="w-5 h-5 text-green-400" /> Apply Credit Without Invoice
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Uses general project credit only. Amounts already invoiced or on draft invoices cannot be settled.
          </DialogDescription>
        </DialogHeader>

        {!ids.length ? (
          <div className="flex flex-col items-center py-8 text-gray-500"><Package className="w-10 h-10 mb-2" /><p>Select parts to settle with credit.</p></div>
        ) : previewMutation.isPending || !preview ? (
          <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Calculating settlement…</div>
        ) : (
          <div className="space-y-3">
            <SettlementSummaryStrip summary={summary} />
            {incomplete && (
              <div className="flex items-start gap-2 p-2 rounded border border-amber-700/50 bg-amber-900/20 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" /> An earlier settlement did not finish. It will be completed first; no credit is spent twice.
              </div>
            )}
            <ScrollArea className="h-[300px]">
              <div className="space-y-1.5 pr-2">{rows.map((r) => <SettlementPartRow key={r.commitment_id} row={r} />)}</div>
            </ScrollArea>
            {toApply > 0 && (
              <label className="flex items-start gap-3 p-3 bg-emerald-900/20 border border-emerald-800/30 rounded-lg cursor-pointer">
                <Checkbox checked={confirmed} onCheckedChange={setConfirmed} className="mt-0.5" />
                <span className="text-sm text-emerald-300">
                  Apply {formatCurrencyUSD(toApply)} of general credit{settleCount ? ` and mark ${settleCount} part(s) PAID` : ""}.
                  <span className="block text-xs text-gray-400 mt-0.5">An admin can reverse a settlement later with a reason.</span>
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => executeMutation.mutate()} disabled={!(toApply > 0) || !confirmed || busy} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {toApply > 0 ? `Apply ${formatCurrencyUSD(toApply)}` : "Nothing eligible"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}