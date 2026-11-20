import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/components/project/financials/finFormat";
import { depositAction, newKey, useDepositRefresh, useProjectDeposits } from "./useProjectDeposits";

// Apply Available Deposit: up to the lesser of the invoice outstanding and the available balance. Checked again on the server.
export default function ApplyDepositDialog({ open, onOpenChange, projectId, invoiceId = null, sources = "deposit", onDone }) {
  const { data, isLoading } = useProjectDeposits(open ? projectId : null);
  const refresh = useDepositRefresh(projectId);
  const [target, setTarget] = useState(invoiceId);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const invoices = data?.open_invoices || [];
  const available = sources === "all" ? data?.totals?.available_all_credit ?? 0 : data?.totals?.available_to_apply ?? 0;
  const inv = invoices.find((i) => i.id === target);
  const max = inv ? Math.min(inv.outstanding, available) : 0;

  useEffect(() => { if (open) { setTarget(invoiceId); setNote(""); setError(""); setKey(newKey()); } }, [open, invoiceId]);
  useEffect(() => { setAmount(max > 0 ? max.toFixed(2) : ""); }, [target, max]);

  const submit = async () => {
    setSaving(true); setError("");
    const r = await depositAction({ action: "apply", invoice_id: target, amount: parseFloat(amount), note, sources, idempotency_key: key });
    setSaving(false);
    if (!r.success) { setError(r.error || "Could not apply deposit."); setKey(newKey()); return; }
    await refresh(); onDone?.(r); onOpenChange(false);
  };
  const amt = parseFloat(amount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{sources === "all" ? "Apply client credit" : "Apply available deposit"}</DialogTitle>
          <DialogDescription>Reduces what the client owes on the invoice. Record the same application in QuickBooks.</DialogDescription></DialogHeader>
        {isLoading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div> : (
          <div className="space-y-3 py-2">
            <div className="flex justify-between rounded-lg bg-gray-800/50 p-3 text-sm"><span className="text-gray-400">Available to apply</span><span className="tabular-nums text-amber-300">{money(available)}</span></div>
            <div className="space-y-1"><Label>Invoice</Label>
              <Select value={target || ""} onValueChange={setTarget}><SelectTrigger><SelectValue placeholder={invoices.length ? "Choose an invoice" : "No open invoices"} /></SelectTrigger>
                <SelectContent>{invoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.label} · {i.invoice_type} · {money(i.outstanding)} outstanding</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Amount (max {money(max)})</Label><Input type="number" step="0.01" min="0" max={max} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !inv || !(amt > 0) || amt > max + 0.0001} className="bg-red-600 hover:bg-red-700">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}