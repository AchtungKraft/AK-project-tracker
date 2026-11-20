import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const label = (d) => (d === "NON_BILLABLE" ? "Non-Billable" : "Billable");

// Project billing status (Billable / Non-Billable) with its reason and full change history.
export default function BillingStatusCard({ projectId, lb }) {
  const { data, isLoading } = useQuery({
    queryKey: ["designationHistory", projectId, lb.designation_set_at],
    queryFn: async () => (await base44.functions.invoke("laborBillingAction", { project_id: projectId, action: "designation_history" })).data,
  });
  const history = data?.history || [];
  return (
    <section className="space-y-3 text-sm text-gray-200">
      <p className="text-xs text-gray-400">Current: <span className={lb.billing_designation === "NON_BILLABLE" ? "text-amber-400" : "text-emerald-400"}>{label(lb.billing_designation)}</span>. Change it from the financial header.</p>
      {history[0]?.reason && <p className="text-xs text-gray-400">Reason: {history[0].reason}</p>}
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-gray-500">Change history</p>
        {isLoading ? <p className="text-xs text-gray-500">Loading…</p> : !history.length ? <p className="text-xs text-gray-500">Never changed. Projects are Billable by default.</p> : (
          <ul className="space-y-1">
            {history.map((h, i) => (
              <li key={i} className="text-xs text-gray-400 border-l-2 border-gray-700 pl-2">
                <span className="text-gray-200">{label(h.before)} → {label(h.after)}</span> · {h.by} · {new Date(h.at).toLocaleString()}
                {h.reason && <span className="block text-gray-500">{h.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}