import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/components/project/financials/finFormat";
import { depositAction, newKey, useDepositRefresh } from "./useProjectDeposits";

const METHODS = [["check", "Check"], ["ach", "ACH"], ["wire", "Wire"], ["card", "Card"], ["cash", "Cash"], ["other", "Other"]];

// Records a refund already issued in QuickBooks. Reduces this deposit's unused credit only.
export default function RefundDepositDialog({ deposit, onOpenChange, projectId }) {
  const refresh = useDepositRefresh(projectId);
  const [f, setF] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (deposit) { setF({ amount: deposit.remaining.toFixed(2), date: format(new Date(), "yyyy-MM-dd"), method: "check", key: newKey() }); setError(""); } }, [deposit]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const amt = parseFloat(f.amount);

  const submit = async () => {
    setSaving(true); setError("");
    const r = await depositAction({ action: "refund", credit_ledger_id: deposit.credit_ledger_id, amount: amt, date: f.date, method: f.method, reference: f.reference, note: f.note, idempotency_key: f.key });
    setSaving(false);
    if (r.success) { await refresh(); onOpenChange(false); } else { setError(r.error || "Could not record the refund."); setF((x) => ({ ...x, key: newKey() })); }
  };

  return (
    <Dialog open={!!deposit} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Refund deposit {deposit?.qb_invoice_number}</DialogTitle>
          <DialogDescription>Record a refund already issued to the client. Unused credit: {money(deposit?.remaining)}.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1"><Label>Amount *</Label><Input type="number" step="0.01" value={f.amount || ""} onChange={set("amount")} /></div>
          <div className="space-y-1"><Label>Refund date *</Label><Input type="date" value={f.date || ""} onChange={set("date")} /></div>
          <div className="space-y-1"><Label>Method</Label>
            <Select value={f.method} onValueChange={set("method")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Reference *</Label><Input value={f.reference || ""} onChange={set("reference")} placeholder="Check # or QuickBooks refund" /></div>
          <div className="col-span-2 space-y-1"><Label>Note</Label><Input value={f.note || ""} onChange={set("note")} /></div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !(amt > 0) || amt > (deposit?.remaining ?? 0) + 0.0001 || !f.reference?.trim()} className="bg-red-700 hover:bg-red-800">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Record refund</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}