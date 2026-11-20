import React from "react";

const h = (v) => (v == null ? "—" : `${Math.round(v * 100) / 100}h`);
const range = (o) => (!o ? "—" : o.min != null && o.max != null && o.min !== o.max ? `${o.min}–${o.max}h` : h(o.max ?? o.min));

// Tasks with advance (projected) billing or hours above the estimate. Tracking only: time entries and task status
// are never changed, and hours above the estimate stay earned and invoiceable.
export default function LaborReconciliationTable({ rows }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Hours billed in advance are applied first against hours logged later. Overruns stay visible and billable as earned labor.</p>
      {!rows.length ? <p className="text-xs text-gray-500">No tasks with advance billing or hours over estimate.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead><tr className="text-left text-gray-500 border-b border-gray-800">
              {["Task", "Original est.", "Revised est.", "Logged", "Billed in advance", "Applied to logged", "Still ahead of work", "Over estimate", "Earned available"].map((t) => <th key={t} className="py-1.5 pr-2 font-medium">{t}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.task_id} className="border-b border-gray-900 text-gray-300">
                  <td className="py-1.5 pr-2 text-white max-w-[14rem] truncate">{r.task_name}</td>
                  <td className="pr-2">{range(r.original_estimate_hours)}</td>
                  <td className="pr-2">{h(r.revised_estimate_hours)}</td>
                  <td className="pr-2">{h(r.hours_logged)}</td>
                  <td className="pr-2 text-violet-300">{h(r.projected_billed_hours)}</td>
                  <td className="pr-2">{h(r.projected_applied_hours)}</td>
                  <td className="pr-2">{h(r.projected_unapplied_hours)}</td>
                  <td className={r.overrun_hours > 0 ? "pr-2 text-amber-400" : "pr-2"}>{h(r.overrun_hours)}</td>
                  <td className="pr-2 text-sky-300">{h(r.earned_available_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}