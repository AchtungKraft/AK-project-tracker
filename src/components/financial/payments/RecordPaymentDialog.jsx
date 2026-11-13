import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const METHODS = [["check", "Check"], ["ach", "ACH"], ["wire", "Wire"], ["card", "Card"], ["cash", "Cash"], ["other", "Other"]];

export default function RecordPaymentDialog({ open, onOpenChange, invoice, onRecorded }) {
  const due = Math.max(0, Math.round(((invoice?.subtotal ?? 0) - (invoice?.credit_applied ?? 0)) * 100) - Math.round((invoice?.paid_amount ?? 0) * 100)) / 100;
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setForm({ amount: due.toFixed(2), date: format(new Date(), "yyyy-MM-dd"), method: "check", reference: "", note: "", key: crypto.randomUUID() }); setError(""); }
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const amt = parseFloat(form.amount);
  const over = amt > due ? amt - due : 0;

  const submit = async () => {
    setSaving(true); setError("");
    const res = await base44.functions.invoke("recordInvoicePayment", {
      invoice_id: invoice.id, amount: amt, payment_date: form.date, method: form.method,
      reference: form.reference, note: form.note, idempotency_key: form.key,
    }).catch((e) => e.response || { data: { error: e.message } });
    setSaving(false);
    if (res.data?.success) { onRecorded(res.data); onOpenChange(false); } else setError(res.data?.error || "Could not record payment.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex justify-between rounded-lg bg-gray-800/50 p-3 text-sm"><span className="text-gray-400">Remaining due</span><span className="font-mono text-white">{formatCurrencyUSD(due)}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Amount *</Label><Input type="number" step="0.01" min="0" value={form.amount || ""} onChange={set("amount")} /></div>
            <div className="space-y-1"><Label>Payment date *</Label><Input type="date" value={form.date || ""} onChange={set("date")} /></div>
            <div className="space-y-1"><Label>Method</Label>
              <Select value={form.method} onValueChange={set("method")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Reference</Label><Input value={form.reference || ""} onChange={set("reference")} placeholder="Check #, transaction ID" /></div>
          </div>
          <div className="space-y-1"><Label>Note</Label><Input value={form.note || ""} onChange={set("note")} /></div>
          {over > 0 && <p className="text-xs text-amber-400">This is {formatCurrencyUSD(over)} more than is due. The extra becomes client credit.</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !(amt > 0) || !form.date} className="bg-green-600 hover:bg-green-700">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}