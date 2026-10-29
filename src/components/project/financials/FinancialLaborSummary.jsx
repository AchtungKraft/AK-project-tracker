import React from "react";
import { hrs } from "./finFormat";

function Row({ label, hint, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}{hint && <span className="block text-[11px] text-gray-500">{hint}</span>}</span>
      <span className="tabular-nums shrink-0">{value}</span>
    </div>
  );
}

export default function FinancialLaborSummary({ labor }) {
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 text-sm">
      <div className="font-medium text-white mb-2">Labor hours <span className="text-xs text-gray-500">(informational, not priced)</span></div>
      <div className="space-y-1.5 text-gray-300">
        <Row label="Logged (all tasks)" hint={labor.hours_logged_unestimated_tasks != null ? `${hrs(labor.hours_logged_estimated_tasks)} on estimated tasks · ${hrs(labor.hours_logged_unestimated_tasks)} on unestimated` : null}
          value={<>{hrs(labor.hours_logged)} <span className="text-gray-500">({labor.entries} entries)</span></>} />
        <Row label="Total estimate" hint="All tasks with an estimate, open or done" value={hrs(labor.hours_estimated)} />
        <Row label="Estimate left on open tasks" hint="Per open task: estimate minus hours logged on it (min 0)" value={hrs(labor.hours_remaining)} />
      </div>
    </div>
  );
}