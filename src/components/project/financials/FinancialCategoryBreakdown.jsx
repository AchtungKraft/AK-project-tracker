import React from "react";
import { money, pct } from "./finFormat";
import LaborCategoryRow from "./LaborCategoryRow";

function Row({ name, c }) {
  const profit = c.billable - c.estimated_cost;
  const margin = c.billable > 0 ? (profit / c.billable) * 100 : null;
  const costShare = c.billable > 0 ? Math.min(100, (c.estimated_cost / c.billable) * 100) : 0;
  return (
    <tr className="border-t border-gray-800">
      <td className="py-2 pr-2 text-white">{name}{c.missing_cost > 0 && <span className="ml-1 text-amber-400 text-xs">({c.missing_cost} no cost)</span>}</td>
      <td className="py-2 px-2 text-right tabular-nums">{money(c.billable)}</td>
      <td className="py-2 px-2 text-right tabular-nums">{money(c.estimated_cost)}</td>
      <td className="py-2 px-2 text-right tabular-nums hidden md:table-cell">
        {c.actual_cost == null ? <span className="text-gray-500">None recorded</span> : money(c.actual_cost)}
        <div className="text-[10px] text-gray-500">
          {c.actual_cost_lines} of {c.active_lines ?? c.lines} lines actual
          {c.estimated_only_lines > 0 && ` · ${c.estimated_only_lines} est. only`}
          {c.zero_cost_legit_lines > 0 && ` · ${c.zero_cost_legit_lines} $0 client-supplied`}
        </div>
      </td>
      <td className="py-2 px-2 text-right tabular-nums">{pct(margin)}</td>
      <td className="py-2 px-2 hidden md:table-cell w-32">
        <div className="h-2 rounded bg-green-700/60 overflow-hidden"><div className="h-full bg-red-600" style={{ width: `${costShare}%` }} /></div>
      </td>
      <td className="py-2 px-2 text-right tabular-nums">{money(c.remaining_uninvoiced)}</td>
      <td className="py-2 pl-2 text-right tabular-nums hidden md:table-cell">{money(c.allocated_to_drafts)}</td>
    </tr>
  );
}

export default function FinancialCategoryBreakdown({ categories, summary, laborBilling }) {
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 overflow-x-auto">
      <div className="text-sm font-medium text-white mb-1">Parts, Services & Labor — cost vs billable</div>
      <p className="text-[11px] text-gray-500 mb-1">Margin uses estimated cost and covers Parts & Services only — internal labor cost is not configured. Actual cost is shown only where recorded.</p>
      <table className="w-full text-sm text-gray-300">
        <thead className="text-[11px] uppercase text-gray-500">
          <tr>
            <th className="text-left py-1 pr-2">Category</th><th className="text-right px-2">Billable</th>
            <th className="text-right px-2">Est. cost</th><th className="text-right px-2 hidden md:table-cell">Actual cost</th>
            <th className="text-right px-2">Margin</th><th className="px-2 hidden md:table-cell">Cost / billable</th>
            <th className="text-right px-2">Uninvoiced</th><th className="text-right pl-2 hidden md:table-cell">On drafts</th>
          </tr>
        </thead>
        <tbody>
          <Row name="Parts" c={categories.parts} />
          <Row name="Services" c={categories.services} />
          <LaborCategoryRow lb={laborBilling} />
          <tr className="border-t border-gray-700 font-semibold text-white">
            <td className="py-2 pr-2">Total<div className="text-[10px] font-normal text-gray-500">Projected {money(summary.total_projected_billable)}</div></td>
            <td className="py-2 px-2 text-right tabular-nums">{money(summary.total_current_billable)}</td>
            <td className="py-2 px-2 text-right tabular-nums">{money(summary.estimated_cost)}<div className="text-[10px] font-normal text-gray-500">P&S only</div></td>
            <td className="hidden md:table-cell" />
            <td className="py-2 px-2 text-right tabular-nums">{pct(summary.estimated_gross_margin_pct)}<div className="text-[10px] font-normal text-gray-500">P&S only</div></td>
            <td className="hidden md:table-cell" />
            <td className="py-2 px-2 text-right tabular-nums">{money(summary.remaining_uninvoiced)}</td>
            <td className="py-2 pl-2 text-right tabular-nums hidden md:table-cell">{money(summary.allocated_to_drafts)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}