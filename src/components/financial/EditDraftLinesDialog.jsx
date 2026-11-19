import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { toast } from "@/lib/notify";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Edit a draft by removing lines. Uses the secured removeDraftInvoiceLines action: kept lines keep their
// historical draft prices, credit is never recalculated, and the server re-checks everything under the billing lock.
export default function EditDraftLinesDialog({ invoice, open, onOpenChange, onSaved }) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState(null);
  const [selected, setSelected] = useState({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !invoice) return;
    setLines(null); setSelected({}); setReason(""); setError(null);
    base44.entities.ProjectInvoiceLine.filter({ invoice_id: invoice.id }, "sort_order", 500).then(setLines);
  }, [open, invoice?.id]);

  if (!invoice) return null;
  const ids = Object.keys(selected).filter((k) => selected[k]);
  const removing = (lines || []).filter((l) => selected[l.id]);
  const remaining = r2((lines || []).reduce((a, l) => a + (selected[l.id] ? 0 : l.line_total || 0), 0));

  const run = async () => {
    setBusy(true); setError(null);
    const res = await base44.functions.invoke("removeDraftInvoiceLines", {
      invoice_id: invoice.id, line_ids: ids, reason: reason.trim(), expected_remaining_total: remaining,
      expected_line_totals: Object.fromEntries(removing.map((l) => [l.id, l.line_total])),
    }).catch((e) => ({ data: e.response?.data || { error: e.message } }));
    setBusy(false);
    if (!res.data?.success) { setError(res.data?.error || res.data?.blockers?.[0]?.message || "Could not update this draft."); return; }
    toast.success(`Removed ${ids.length} line(s). Draft total is now ${formatCurrencyUSD(remaining)}.`);
    queryClient.invalidateQueries({ queryKey: ["openDollars"] });
    queryClient.invalidateQueries({ queryKey: ["billableItems"] });
    queryClient.invalidateQueries({ queryKey: ["projectFinancialOverview"] });
    await forceAppRefresh(queryClient, { projectIds: invoice.project_id ? [invoice.project_id] : [] });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit draft lines</DialogTitle>
          <DialogDescription>Select lines to remove. Remaining lines keep their draft prices. To add items, delete the draft and create a new one.</DialogDescription>
        </DialogHeader>
        {!lines ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div> : (
          <div className="max-h-[45vh] overflow-y-auto divide-y divide-gray-800 rounded-lg border border-gray-800">
            {lines.map((l) => (
              <label key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-800/40">
                <Checkbox checked={!!selected[l.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [l.id]: !!v }))} />
                <span className="text-[10px] uppercase text-gray-500 w-12 shrink-0">{l.type}</span>
                <span className="flex-1 min-w-0 truncate text-gray-200">{l.description}</span>
                <span className="text-gray-400 shrink-0">{l.qty}</span>
                <span className="font-mono text-white shrink-0 w-20 text-right">{formatCurrencyUSD(l.line_total || 0)}</span>
              </label>
            ))}
          </div>
        )}
        <Textarea placeholder="Reason for removing these lines (required)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        <div className="text-sm text-gray-400 flex justify-between"><span>New draft total</span><span className="font-mono text-white">{formatCurrencyUSD(remaining)}</span></div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || !ids.length || !reason.trim()} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}Remove {ids.length || ""} line(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}