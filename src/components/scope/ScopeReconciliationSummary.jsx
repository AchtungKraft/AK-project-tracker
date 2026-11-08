import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import ReconciliationRow from "./ReconciliationRow";
import { errorText } from "./baselineFormat";

// Read-only: approved estimate vs task commitments/actuals. Does not feed any financial report.
export default function ScopeReconciliationSummary({ requestId, projectId }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["scopeBaselineReconciliation", requestId],
    queryFn: async () => (await base44.functions.invoke("scopeEstimateBaseline", { action: "request_reconciliation", requestId, projectId })).data,
    enabled: open,
  });
  const c = data?.coverage;

  return (
    <div className="rounded-md border border-gray-700 bg-black/30">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Estimate vs. actual reconciliation <span className="text-[10px] uppercase tracking-wider text-gray-500">Read-only</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {error && <p className="text-xs text-red-400">{errorText(error)}</p>}
          {c && (
            <p className="text-xs text-gray-400">
              {c.approved_items} approved · {c.baselined} baselined · {c.converted_without_baseline} converted without baseline · {c.approved_not_converted} not converted
              {c.duplicate_baseline_records > 0 && <span className="text-amber-400"> · {c.duplicate_baseline_records} duplicate records</span>}
            </p>
          )}
          {data && (data.rows.length === 0 ? (
            <p className="text-xs text-gray-500">No baselined items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="py-1 pr-3 font-medium">Item</th>
                    <th className="py-1 pr-3 font-medium">Est. hard cost</th>
                    <th className="py-1 pr-3 font-medium">Est. labor</th>
                    <th className="py-1 pr-3 font-medium">Committed</th>
                    <th className="py-1 pr-3 font-medium">Actual</th>
                    <th className="py-1 pr-3 font-medium">Billed (parts)</th>
                    <th className="py-1 font-medium">Labor logged</th>
                  </tr>
                </thead>
                <tbody>{data.rows.map((r) => <ReconciliationRow key={r.baseline_id} r={r} />)}</tbody>
              </table>
            </div>
          ))}
          {data?.estimate_billing && !data.estimate_billing.enabled && (
            <p className="text-[11px] text-gray-500">{data.estimate_billing.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}