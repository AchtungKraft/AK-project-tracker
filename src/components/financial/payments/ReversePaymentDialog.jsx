import React, { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

// Admin reversal of one recorded payment. The payment record is kept and marked reversed.
export default function ReversePaymentDialog({ payment, onOpenChange, onReversed }) {
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payment) { setReason(""); setError(""); setKey(crypto.randomUUID()); }
  }, [payment?.id]);

  const submit = async () => {
    setSaving(true); setError("");
    const res = await base44.functions.invoke("recordInvoicePayment", {
      action: "reverse", payment_id: payment.id, reason: reason.trim(), idempotency_key: key,
    }).catch((e) => e.response || { data: { error: e.message } });
    setSaving(false);
    if (res.data?.success) { onReversed(res.data); onOpenChange(false); } else setError(res.data?.error || "Could not reverse payment.");
  };

  return (
    <Dialog open={!!payment} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse payment</DialogTitle>
          <DialogDescription>
            The payment stays in the history marked as reversed, and the invoice balance is recalculated.
          </DialogDescription>
        </DialogHeader>
        {payment && (
          <div className="space-y-3 py-2">
            <div className="flex justify-between rounded-lg bg-gray-800/50 p-3 text-sm">
              <span className="text-gray-400">
                {format(parseISO(payment.payment_date), "MMM d, yyyy")} · <span className="uppercase">{payment.method}</span>{payment.reference ? ` · ${payment.reference}` : ""}
              </span>
              <span className="font-mono text-white">{formatCurrencyUSD(payment.amount_cents / 100)}</span>
            </div>
            <div className="space-y-1">
              <Label>Reason *</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered on the wrong invoice, check bounced" rows={3} />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || reason.trim().length < 3} className="bg-red-700 hover:bg-red-800">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Reverse payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}