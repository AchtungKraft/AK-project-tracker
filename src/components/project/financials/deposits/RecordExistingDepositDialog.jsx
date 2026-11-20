import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { depositAction, newKey, useDepositRefresh } from "./useProjectDeposits";

const METHODS = [["check", "Check"], ["ach", "ACH"], ["wire", "Wire"], ["card", "Card"], ["cash", "Cash"], ["other", "Other"]];

// Records a deposit already invoiced and paid in QuickBooks. No new QuickBooks invoice; duplicates are refused on the server.
export default function RecordExistingDepositDialog({ open, onOpenChange, projectId }) {
  const refresh = useDepositRefresh(projectId);
  const [f, setF] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const d = format(new Date(), "yyyy-MM-dd");
    if (open) { setF({ invoice_date: d, payment_date: d, payment_method: "check", key: newKey() }); setError(""); }
  }, [open]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const ok = f.qb_invoice_number?.trim() && parseFloat(f.invoice_amount) > 0 && parseFloat(f.payment_amount) > 0 && f.payment_reference?.trim() && parseFloat(f.payment_amount) <= parseFloat(f.invoice_amount);

  const submit = async () => {
    setSaving(true); setError("");
    const r = await depositAction({ action: "register_existing", project_id: projectId, ...f, invoice_amount: parseFloat(f.invoice_amount), payment_amount: parseFloat(f.payment_amount), idempotency_key: f.key });
    setSaving(false);
    await refresh();
    if (r.success) onOpenChange(false); else setError(r.error || "Could not record the deposit.");
  };

  const field = (k, l, props = {}) => <div className="space-y-1"><Label>{l}</Label><Input value={f[k] || ""} onChange={set(k)} {...props} /></div>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record existing down payment</DialogTitle>
          <DialogDescription>For a deposit already invoiced and paid in QuickBooks. Nothing is created or posted in QuickBooks. Only the amount received becomes deposit credit.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          {field("qb_invoice_number", "QuickBooks deposit invoice # *")}
          {field("invoice_amount", "Deposit invoice amount *", { type: "number", step: "0.01", min: "0" })}
          {field("invoice_date", "Invoice date *", { type: "date" })}
          {field("payment_amount", "Amount received *", { type: "number", step: "0.01", min: "0" })}
          {field("payment_date", "Date received *", { type: "date" })}
          <div className="space-y-1"><Label>Payment method</Label>
            <Select value={f.payment_method} onValueChange={set("payment_method")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2">{field("payment_reference", "QuickBooks payment reference *", { placeholder: "Check #, QuickBooks payment # or transaction ID" })}</div>
          <div className="col-span-2">{field("notes", "Notes")}</div>
        </div>
        {parseFloat(f.payment_amount) > parseFloat(f.invoice_amount) && <p className="text-xs text-amber-400">The amount received can't be more than the deposit invoice.</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !ok} className="bg-red-600 hover:bg-red-700">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Record down payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}