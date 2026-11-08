import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, Info } from "lucide-react";
import ScopeBudgetTotals from "./ScopeBudgetTotals";
import ScopeBudgetBreakdown from "./ScopeBudgetBreakdown";
import { EXCLUDED_LABEL } from "./scopeBudgetFormat";
import { money } from "./finFormat";

// Read-only planning view. Never combined with billable, projected, profitability or invoice figures.
export default function ApprovedScopeBudgetSection({ projectId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["approvedScopeBudget", projectId],
    queryFn: async () => (await base44.functions.invoke("getApprovedScopeBudget", { project_id: projectId })).data,
    enabled: !!projectId, staleTime: 60000, retry: false,
  });
  if (error?.response?.status === 403) return null;
  return (
    <section className="rounded-lg border border-sky-900/50 bg-sky-950/10 p-4 space-y-3" aria-label="Approved Scope Budget">
      <div>
        <h3 className="text-sm font-semibold text-white">Approved Scope Budget <span className="font-normal text-sky-300">(planning, not invoice eligible)</span></h3>
        <p className="text-xs text-gray-400 mt-0.5">Read-only. Not included in current billable, projected value, profitability, invoice availability or purchasing.</p>
      </div>
      {isLoading ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-sky-400" /></div>
        : error || !data?.success ? <p className="text-xs text-red-400">Could not load approved scope budget: {error?.response?.data?.error || error?.message || data?.error}</p>
        : !data.totals.items && !data.excluded.length ? <p className="text-xs text-gray-500">No approved scope items for this project.</p>
        : <>
          <ScopeBudgetTotals t={data.totals} />
          {data.rates.length > 0 && (
            <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-gray-500">Rate snapshots:</span>
              {data.rates.map((r) => <span key={`${r.labor_group_name}${r.rate}`}>{r.labor_group_name} {money(r.rate)}/h · {r.hours_min}–{r.hours_max}h</span>)}
            </div>
          )}
          {data.reviews.length > 0 && <ScopeBudgetBreakdown reviews={data.reviews} />}
          {data.excluded.length > 0 && (
            <div className="text-xs text-amber-300/90 border border-amber-900/40 rounded-md p-2">
              <div className="font-semibold mb-1">Not counted ({data.excluded.length}) — needs review</div>
              {data.excluded.map((e) => <div key={e.scope_item_id}>{e.title} — {EXCLUDED_LABEL[e.reason] || e.reason}</div>)}
            </div>
          )}
          <p className="text-[11px] text-gray-500">Source: converted items use the locked scope baseline; not-yet-converted items use the client-approved values, counted only if unchanged since approval. Hard cost is an allowance (cost basis), not client retail.</p>
        </>}
      <div className="flex items-start gap-2 text-xs text-gray-300 bg-gray-900/60 rounded-md px-3 py-2">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <span><strong>Funding and progress billing: not enabled yet.</strong> This budget can't be invoiced or applied as credit.</span>
      </div>
    </section>
  );
}