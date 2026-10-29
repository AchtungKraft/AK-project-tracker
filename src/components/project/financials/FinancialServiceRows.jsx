import React from "react";
import { money } from "./finFormat";
import FlagChips from "./FlagChips";

export default function FinancialServiceRows({ rows }) {
  return (
    <table className="w-full text-xs text-gray-300 min-w-[600px]">
      <thead className="text-gray-500 uppercase text-[10px]">
        <tr>
          <th className="text-left py-1">Service</th><th className="text-left">Status</th><th className="text-right">Billable</th>
          <th className="text-right">Est. cost</th><th className="text-right">Actual cost</th><th className="text-left pl-2">Billing</th><th className="text-left pl-2">Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-gray-800">
            <td className="py-1.5 max-w-[220px] truncate">{r.description || "—"}</td>
            <td>{r.status || "—"}</td>
            <td className="text-right tabular-nums">{money(r.billable)}</td>
            <td className="text-right tabular-nums">{r.est_cost == null ? <span className="text-amber-400">Not recorded</span> : money(r.est_cost)}</td>
            <td className="text-right tabular-nums">{r.actual_cost == null ? <span className="text-gray-500">Not recorded</span> : money(r.actual_cost)}</td>
            <td className="pl-2">{r.invoiced ? "Invoiced" : r.allocated ? `On ${r.draft_count} draft(s)` : "Uninvoiced"}</td>
            <td className="pl-2"><FlagChips flags={r.flags} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}