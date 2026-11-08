import React from "react";
import BaselineStatusBadge from "./BaselineStatusBadge";
import { reasonText } from "./baselineFormat";

// Per-item results from scopeEstimateBaseline convert / backfill_apply.
export default function BaselineResultsList({ results, titleFor }) {
  if (!results?.length) return null;
  return (
    <div className="border border-gray-800 rounded-md divide-y divide-gray-800 max-h-[45vh] overflow-y-auto">
      {results.map((r) => (
        <div key={r.scope_item_id} className="flex items-start gap-2 px-3 py-2">
          <BaselineStatusBadge status={r.status} />
          <div className="min-w-0 text-sm">
            <div className="text-white truncate">{titleFor(r.scope_item_id)}</div>
            {r.reason && <div className="text-xs text-gray-400">{reasonText(r.reason)}</div>}
            {r.reasons?.length > 0 && <div className="text-xs text-gray-500">{r.reasons.map(reasonText).join(" · ")}</div>}
            {r.ambiguity_reasons?.length > 0 && <div className="text-xs text-amber-400">Captured with: {r.ambiguity_reasons.map(reasonText).join(" · ")}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}