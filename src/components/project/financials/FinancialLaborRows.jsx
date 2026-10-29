import React from "react";
import { money, hrs } from "./finFormat";
import MobileLineCard from "./MobileLineCard";

const TYPE = { BILLABLE: "Billable", INCLUDED_IN_SERVICE: "Included in service", NON_BILLABLE: "Non-billable", UNCLASSIFIED: "Unclassified" };
const NC = <span className="text-gray-500">Not configured</span>;
const isBill = (t) => t.billing_type === "BILLABLE" && !t.cancelled;
const amt = (t, v) => (isBill(t) ? (v == null ? <span className="text-amber-400">Rate not set</span> : money(v)) : <span className="text-gray-600">—</span>);

// Read-only labor detail from the live overview (time entries + classification). Creates nothing.
export default function FinancialLaborRows({ lb }) {
  const rows = (lb.tasks || []).filter((t) => t.logged > 0 || t.remaining_hours > 0);
  const status = (t) => <span className={isBill(t) ? "text-blue-300" : "text-gray-400"}>{t.cancelled ? "Cancelled" : TYPE[t.billing_type] || "Unclassified"}</span>;
  return (
    <>
      <table className="hidden md:table w-full text-xs text-gray-300">
        <thead className="text-gray-500 uppercase text-[10px]">
          <tr>
            <th className="text-left py-1">Task</th><th className="text-right">Billable hrs</th><th className="text-right">Rate</th>
            <th className="text-right">Est. cost</th><th className="text-right">Actual cost</th><th className="text-right">Billable to date</th>
            <th className="text-right">Remaining hrs</th><th className="text-right">Projected add'l</th><th className="text-left pl-3">Billing status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-gray-800 align-top">
              <td className="py-1.5 pr-2 text-white min-w-[200px]">{t.name}{t.logged > 0 && !isBill(t) && <div className="text-[10px] text-gray-500">{hrs(t.logged)} logged, not billed separately</div>}</td>
              <td className="text-right tabular-nums px-1">{isBill(t) ? hrs(t.logged) : "—"}</td>
              <td className="text-right tabular-nums px-1">{isBill(t) && t.effective_rate != null ? `${money(t.effective_rate)}/h` : "—"}</td>
              <td className="text-right px-1">{NC}</td><td className="text-right px-1">{NC}</td>
              <td className="text-right tabular-nums px-1 text-white">{amt(t, t.billable_to_date)}</td>
              <td className="text-right tabular-nums px-1">{isBill(t) ? hrs(t.remaining_hours) : "—"}</td>
              <td className="text-right tabular-nums px-1">{amt(t, t.projected_remaining)}</td>
              <td className="pl-3 text-[11px]">{status(t)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-white font-semibold">
          <tr className="border-t border-gray-700">
            <td className="py-1.5">Totals</td><td className="text-right tabular-nums px-1">{hrs(lb.hours.billable)}</td><td />
            <td /><td /><td className="text-right tabular-nums px-1">{money(lb.billable_to_date)}</td>
            <td className="text-right tabular-nums px-1">{hrs(lb.remaining_billable_hours)}</td>
            <td className="text-right tabular-nums px-1">{money(lb.projected_remaining)}</td>
            <td className="pl-3 text-[11px] font-normal text-gray-400">Projected total {money(lb.projected_total)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="md:hidden">
        {rows.map((t) => (
          <MobileLineCard key={t.id} title={t.name} status={status(t)}
            fields={[["Billable hrs", isBill(t) ? hrs(t.logged) : "—"], ["Rate", isBill(t) && t.effective_rate != null ? money(t.effective_rate) : "—"],
              ["To date", amt(t, t.billable_to_date)], ["Remaining", isBill(t) ? hrs(t.remaining_hours) : "—"], ["Projected", amt(t, t.projected_remaining)], ["Cost", "Not configured"]]} />
        ))}
        <div className="border-t border-gray-700 pt-2 text-xs text-white grid grid-cols-2 gap-1">
          <span>Billable hrs {hrs(lb.hours.billable)}</span><span className="text-right">To date {money(lb.billable_to_date)}</span>
          <span>Remaining {money(lb.projected_remaining)}</span><span className="text-right">Total {money(lb.projected_total)}</span>
        </div>
      </div>
    </>
  );
}