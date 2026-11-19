import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { toast } from "@/lib/notify";
import BillableItemsSelector from "./BillableItemsSelector";

// Add parts, services, earned or projected labor to an existing draft. The server validates everything under the
// project billing lock (same rules as a new draft); existing lines and their prices are never changed.
export default function AddDraftLinesDialog({ invoice, open, onOpenChange, onSaved }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { if (open) { setSelected([]); setError(null); } }, [open, invoice?.id]);
  if (!invoice) return null;
  const adding = selected.reduce((s, i) => s + (i.line_total || 0), 0);

  const run = async () => {
    setBusy(true); setError(null);
    const lines = selected.map((i) => ({
      type: i.type, source_entity: i.source_entity, source_id: i.source_id, description: i.description || i.part_name || "Item",
      qty: i.qty ?? 1, unit_price: i.unit_price ?? 0,
      ...(i.type === "labor" ? { labor_basis: i.labor_basis || "earned" } : {}),
      ...(i.type === "service" && i.children?.length ? { expanded_lines: i.children } : {}),
    }));
    const res = await base44.functions.invoke("createProjectInvoiceDraft", { project_id: invoice.project_id, append_to_invoice_id: invoice.id, lines })
      .catch((e) => ({ data: e.response?.data || { error: e.message } }));
    setBusy(false);
    if (!res.data?.success) { setError(res.data?.error || "Could not add these lines."); return; }
    toast.success(`Added ${res.data.lines_added} line(s). Draft total is now ${formatCurrencyUSD(res.data.subtotal)}.`);
    ["openDollars", "billableItems", "projectFinancialOverview", "billingSummary"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    await forceAppRefresh(queryClient, { projectIds: [invoice.project_id] });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add lines to draft</DialogTitle>
          <DialogDescription>Only items not already invoiced or on another draft are shown. Existing lines keep their draft prices.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {open && <BillableItemsSelector projectId={invoice.project_id} selectedItems={selected} onSelectionChange={setSelected} autoSelect={false} />}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || !selected.length} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add {selected.length || ""} line(s) · {formatCurrencyUSD(adding)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}