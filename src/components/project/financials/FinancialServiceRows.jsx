import React from "react";
import { money } from "./finFormat";
import FlagChips from "./FlagChips";
import MobileLineCard from "./MobileLineCard";

const est = (r) => (r.est_cost == null ? <span className="text-amber-400">Not recorded</span> : money(r.est_cost));
const act = (r) => (r.actual_cost == null ? <span className="text-gray-500">Not recorded</span> : money(r.actual_cost));
const differs = (r) => r.allocated && Math.abs(r.draft_amount - r.billable) > 0.01;

function Status({ r }) {
  return (
    <div className="text-[11px] leading-tight">
      {r.invoiced ? <span className="text-green-400">Finalized</span>
        : r.allocated ? <span className="text-blue-300">On {r.draft_count} draft{r.draft_count > 1 && "s"}</span>
        : <span className="text-gray-300">Available</span>}
      {r.status && <div className="text-gray-500">Work: {r.status}</div>}
      <FlagChips flags={r.flags} />
    </div>
  );
}

const draftCell = (r) => (r.allocated
  ? <span className={differs(r) ? "text-amber-400" : ""}>{money(r.draft_amount)}{differs(r) && <div className="text-[10px]">current {money(r.billable)}</div>}</span>
  : <span className="text-gray-600">—</span>);

export default function FinancialServiceRows({ rows }) {
  return (
    <>
      <table className="hidden md:table w-full text-xs text-gray-300">
        <thead className="text-gray-500 uppercase text-[10px]">
          <tr>
            <th className="text-left py-1">Service</th><th className="text-right">Qty</th><th className="text-right">Est. cost</th>
            <th className="text-right">Actual cost</th><th className="text-right">Billable</th><th className="text-right">On draft</th>
            <th className="text-left pl-3">Billing status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-800 align-top">
              <td className="py-1.5 pr-2 text-white min-w-[220px]">{r.description || "—"}</td>
              <td className="text-right tabular-nums px-1">1</td>
              <td className="text-right tabular-nums px-1">{est(r)}</td>
              <td className="text-right tabular-nums px-1">{act(r)}</td>
              <td className="text-right tabular-nums px-1 text-white">{money(r.billable)}</td>
              <td className="text-right tabular-nums px-1">{draftCell(r)}</td>
              <td className="pl-3 min-w-[130px]"><Status r={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="md:hidden">
        {rows.map((r) => (
          <MobileLineCard key={r.id} title={r.description || "—"}
            fields={[["Est. cost", est(r)], ["Actual", act(r)], ["Billable", money(r.billable)], ["On draft", draftCell(r)]]}
            status={<Status r={r} />} />
        ))}
      </div>
    </>
  );
}