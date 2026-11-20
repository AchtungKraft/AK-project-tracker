import React from "react";
import { ShieldCheck } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const M = ({ v, tone = "text-gray-200" }) => <span className={`font-mono ${tone}`}>{formatCurrencyUSD(v || 0)}</span>;

// Every project with a confirmed client budget. A budget is a ceiling, never revenue, so nothing here is added to the totals above.
export default function OpenDollarsAuthorization({ authorization }) {
  const { totals, projects } = authorization || { totals: {}, projects: [] };
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ShieldCheck className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-white">Confirmed client budgets</h3>
        <span className="text-xs text-gray-500">{totals.projects || 0} project(s) · {formatCurrencyUSD(totals.budget || 0)} authorized · {formatCurrencyUSD(totals.remaining || 0)} remaining · not added to expected billing</span>
      </div>
      {!projects.length ? <p className="text-xs text-gray-500">No project has a confirmed client budget.</p> : (
        <div className="divide-y divide-gray-800">
          {projects.map((a) => (
            <div key={a.project_id} className="py-2 grid grid-cols-2 md:grid-cols-6 gap-x-3 gap-y-1 text-xs">
              <div className="col-span-2 md:col-span-2 min-w-0">
                <p className="text-white font-medium truncate" title={a.project_name}>{a.project_name}</p>
                {a.client_name && <p className="text-gray-500 truncate">{a.client_name}</p>}
              </div>
              <div><p className="text-gray-500">Budget</p><M v={a.budget} /></div>
              <div><p className="text-gray-500">Invoiced + drafts (net)</p><M v={a.consumed} /></div>
              <div><p className="text-gray-500">Remaining</p><M v={a.remaining} tone={a.remaining < 0 ? "text-red-400" : "text-emerald-300"} /></div>
              <div><p className="text-gray-500">Projected within budget</p><M v={a.projected_within_budget} tone="text-violet-300" />
                {a.projected_beyond_budget > 0 && <p className="text-amber-400">{formatCurrencyUSD(a.projected_beyond_budget)} beyond</p>}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}