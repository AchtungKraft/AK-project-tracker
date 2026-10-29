import React from "react";
import { money } from "./finFormat";
import FlagChips from "./FlagChips";

export default function FinancialPartRows({ rows }) {
  return (
    <table className="w-full text-xs text-gray-300 min-w-[720px]">
      <thead className="text-gray-500 uppercase text-[10px]">
        <tr>
          <th className="text-left py-1">Source</th><th className="text-right">Qty</th><th className="text-right">Removed</th>
          <th className="text-right">Unit price</th><th className="text-right">Billable</th><th className="text-right">Est. cost</th>
          <th className="text-right">Invoiced qty</th><th className="text-right">On drafts</th><th className="text-left pl-2">Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-gray-800">
            <td className="py-1.5">{r.source || "—"}</td>
            <td className="text-right tabular-nums">{r.qty}</td>
            <td className="text-right tabular-nums">{r.qty_removed}</td>
            <td className="text-right tabular-nums">{money(r.unit_retail)}{r.retail_override && " *"}</td>
            <td className="text-right tabular-nums">{money(r.billable)}</td>
            <td className="text-right tabular-nums">{r.unit_cost == null ? "—" : money(r.est_cost)}</td>
            <td className="text-right tabular-nums">{r.invoiced_qty} <span className="text-gray-500">({money(r.invoiced_amount)})</span></td>
            <td className="text-right tabular-nums">{r.allocated_qty}{r.draft_qty > r.allocated_qty && <span className="text-amber-400"> / {r.draft_qty}</span>}</td>
            <td className="pl-2"><FlagChips flags={r.flags} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}