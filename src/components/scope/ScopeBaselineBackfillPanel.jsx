import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import BackfillRow from "./BackfillRow";
import BaselineResultsList from "./BaselineResultsList";
import { invalidateBaselineCaches } from "./scopeBaselineCache";
import { errorText } from "./baselineFormat";

const ORDER = { needs_confirmation: 0, ready: 1, blocked: 2, baselined: 3 };

// Admin-only: attach approved-estimate baselines to tasks converted before baselines existed.
export default function ScopeBaselineBackfillPanel({ requestId, projectId }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState({});
  const [results, setResults] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["scopeBaselinePreview", requestId],
    queryFn: async () => (await base44.functions.invoke("scopeEstimateBaseline", { action: "backfill_preview", requestId, projectId })).data,
    enabled: open,
  });

  const rows = (data?.rows || []).filter((r) => r.status !== "not_converted").sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const setPick = (id, patch) => setPicks((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const selected = rows.filter((r) => (r.status === "ready" || r.status === "needs_confirmation") && picks[r.scope_item_id]?.selected);
  const incomplete = selected.some((r) => {
    if (r.status !== "needs_confirmation") return false;
    const p = picks[r.scope_item_id];
    return !p.confirm || (p.note || "").trim().length < 5 || (r.candidate_tasks.length > 1 && !p.task_id);
  });

  const apply = async () => {
    setApplying(true);
    setApplyError(null);
    const items = selected.map((r) => {
      const p = picks[r.scope_item_id];
      return {
        scope_item_id: r.scope_item_id,
        ...(r.status === "needs_confirmation" ? { confirm: true, note: p.note.trim() } : {}),
        ...(r.candidate_tasks.length > 1 ? { task_id: p.task_id } : {}),
      };
    });
    try {
      const res = await base44.functions.invoke("scopeEstimateBaseline", { action: "backfill_apply", requestId, projectId, items });
      setResults(res.data?.results || []);
      setPicks({});
    } catch (e) {
      setApplyError(errorText(e));
    } finally {
      invalidateBaselineCaches(qc, requestId, projectId);
      setApplying(false);
    }
  };

  const titleFor = (id) => (data?.rows || []).find((r) => r.scope_item_id === id)?.title || id;

  return (
    <div className="rounded-md border border-gray-700 bg-black/30">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Estimate baseline backfill <span className="text-[10px] uppercase tracking-wider text-gray-500">Admin</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {error && <p className="text-xs text-red-400">{errorText(error)}</p>}
          {data && (
            <>
              <p className="text-xs text-gray-400">
                {Object.entries(data.counts || {}).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(" · ") || "No items"}
              </p>
              {rows.length === 0 ? (
                <p className="text-xs text-gray-500">No converted items need a baseline.</p>
              ) : (
                <div className="border border-gray-800 rounded-md divide-y divide-gray-800 max-h-[50vh] overflow-y-auto">
                  {rows.map((r) => <BackfillRow key={r.scope_item_id} row={r} pick={picks[r.scope_item_id]} onChange={(p) => setPick(r.scope_item_id, p)} />)}
                </div>
              )}
              {applyError && <p className="text-xs text-red-400">{applyError}</p>}
              {results && <BaselineResultsList results={results} titleFor={titleFor} />}
              <div className="flex justify-end">
                <Button size="sm" onClick={apply} disabled={applying || !selected.length || incomplete} className="bg-emerald-700 hover:bg-emerald-600">
                  {applying && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  Attach {selected.length} baseline{selected.length === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}