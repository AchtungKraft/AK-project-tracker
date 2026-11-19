import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { toast } from "@/lib/notify";

// Confirms and runs the server-enforced draft deletion. The server rejects anything that is not an unused draft.
export default function DeleteDraftInvoiceDialog({ invoice, projectName, clientName, open, onOpenChange, onDeleted }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!invoice) return null;

  const run = async () => {
    setBusy(true); setError(null);
    const res = await base44.functions.invoke("deleteDraftInvoice", { invoice_id: invoice.id })
      .catch((e) => ({ data: e.response?.data || { error: e.message } }));
    setBusy(false);
    if (!res.data?.success) { setError(res.data?.error || "Could not delete this draft."); return; }
    toast.success("Draft invoice deleted. Its items are available to invoice again.");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["billingSummary"] }),
      queryClient.invalidateQueries({ queryKey: ["billableItems"] }),
      queryClient.invalidateQueries({ queryKey: ["projectFinancialOverview"] }),
      queryClient.invalidateQueries({ queryKey: ["openDollars"] }),
    ]);
    await forceAppRefresh(queryClient, { projectIds: invoice.project_id ? [invoice.project_id] : [] });
    onOpenChange(false);
    onDeleted?.();
  };

  const Row = ({ label, value }) => (
    <div className="flex justify-between gap-4 text-sm"><span className="text-gray-400">{label}</span><span className="text-white text-right">{value}</span></div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setError(null); onOpenChange(v); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete draft invoice?</DialogTitle>
          <DialogDescription>The draft and its lines are removed. Parts, services and labor are not touched and become available to invoice again. A record of this deletion is kept.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-lg bg-gray-800/50 p-3">
          <Row label="Invoice #" value={invoice.qb_invoice_number || "Not assigned (draft)"} />
          <Row label="Type" value={<span className="capitalize">{invoice.invoice_type || "—"}</span>} />
          <Row label="Project" value={projectName || "—"} />
          <Row label="Client" value={clientName || "—"} />
          <Row label="Amount" value={<span className="font-mono">{formatCurrencyUSD(invoice.total ?? invoice.subtotal ?? 0)}</span>} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Keep draft</Button>
          <Button onClick={run} disabled={busy} className="bg-red-700 hover:bg-red-800 gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Delete draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}