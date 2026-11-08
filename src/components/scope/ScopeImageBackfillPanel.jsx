import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import BaselineResultsList from "./BaselineResultsList";
import { errorText, reasonText } from "./baselineFormat";

// Admin-only: attach original ScopeItem images to already-converted tasks that have none.
// Never edits task descriptions; tasks that already have images are skipped.
export default function ScopeImageBackfillPanel({ requestId, projectId }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["scopeImageBackfill", requestId],
    queryFn: async () => (await base44.functions.invoke("scopeEstimateBaseline", { action: "image_backfill_preview", requestId, projectId })).data,
    enabled: open,
  });
  const rows = data?.rows || [];
  const ready = rows.filter(r => r.status === "ready");
  const toggle = (id) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const apply = async () => {
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.invoke("scopeEstimateBaseline", { action: "image_backfill_apply", requestId, projectId, confirm: true, scopeItemIds: [...picked] });
      setResults(res.data?.results || []);
    } catch (e) { setError(errorText(e)); }
    finally {
      setBusy(false); setPicked(new Set()); setConfirm(false);
      qc.invalidateQueries({ queryKey: ["scopeImageBackfill", requestId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projectTasks", projectId] });
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-300">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Task image backfill (admin)
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {results && <BaselineResultsList results={results} titleFor={id => rows.find(r => r.scope_item_id === id)?.title || id} />}
          {rows.map(r => (
            <label key={r.scope_item_id} className="flex items-center gap-2 text-sm">
              <Checkbox disabled={r.status !== "ready"} checked={picked.has(r.scope_item_id)} onCheckedChange={() => toggle(r.scope_item_id)} />
              <span className="text-white truncate flex-1 min-w-0">{r.task_name || r.title}</span>
              <span className="text-xs text-gray-500 shrink-0">
                {r.status === "ready" ? `${r.images.length} image${r.images.length === 1 ? "" : "s"} to attach` : reasonText(r.status)}
              </span>
            </label>
          ))}
          {data && !ready.length && <p className="text-xs text-gray-500">No converted tasks need images.</p>}
          {ready.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <Checkbox checked={confirm} onCheckedChange={v => setConfirm(!!v)} /> Attach images to selected tasks (descriptions unchanged)
              </label>
              <Button size="sm" onClick={apply} disabled={busy || !confirm || !picked.size} className="bg-red-600 hover:bg-red-700 h-7">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Attach to ${picked.size}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}