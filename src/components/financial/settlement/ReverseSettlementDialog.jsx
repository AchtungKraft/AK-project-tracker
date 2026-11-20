import React, { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { reverseSettlement, errorMessage } from "./settlementApi";

export default function ReverseSettlementDialog({ settlement, projectId, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (settlement) { setAmount(String(settlement.net_amount)); setReason(""); setError(null); setRequestKey(crypto.randomUUID()); }
  }, [settlement?.allocation_id]);

  const mutation = useMutation({
    mutationFn: () => reverseSettlement({ projectId, allocationId: settlement.allocation_id, amount: Number(amount), reason, requestKey }),
    onSuccess: (data) => onDone(data),
    onError: (e) => setError(errorMessage(e)),
  });

  const value = Number(amount);
  const valid = value > 0 && value <= (settlement?.net_amount || 0) && reason.trim().length >= 3;

  return (
    <Dialog open={!!settlement} onOpenChange={() => !mutation.isPending && onClose()}>
      <DialogContent className="max-w-md bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Reverse credit settlement</DialogTitle>
          <DialogDescription className="text-gray-400">
            Returns credit to the original general credit record and reopens that part amount for billing. The original settlement stays in the history.
          </DialogDescription>
        </DialogHeader>
        {settlement && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">{settlement.part_name || "Part"}: {formatCurrencyUSD(settlement.net_amount)} still settled</p>
            <div className="space-y-1">
              <Label className="text-gray-300">Amount to reverse</Label>
              <Input type="number" step="0.01" min="0.01" max={settlement.net_amount} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-300">Reason</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this settlement was incorrect" />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={() => { setError(null); mutation.mutate(); }} disabled={!valid || mutation.isPending} className="gap-2">
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Reverse {value > 0 ? formatCurrencyUSD(value) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}