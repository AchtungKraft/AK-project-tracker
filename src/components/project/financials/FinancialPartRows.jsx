import React from "react";
import { money } from "./finFormat";
import FlagChips from "./FlagChips";
import CostStateLabel from "./CostStateLabel";

// Only material discrepancies show per row; harmless stale totals are summarized at section level.
const rowFlags = (r) => r.flags.filter((f) => f !== "stale_stored_total" || r.stale_detail?.kind !== "price_entered_later");

export default function FinancialPartRows({ rows }) {
  return (
    <table className="w-full text-xs text-gray-300 min-w-[900px]">
      <thead className="text-gray-500 uppercase text-[10px]">
        <tr>
          <th className="text-left py-1">Part</th><th className="text-right">Required</th><th className="text-right">Finalized</th>
          <th className="text-right">On drafts</th><th className="text-right">Available</th><th className="text-right">Unit price</th>
          <th className="text-right">Billable</th><th className="text-right">Cost</th><th className="text-left pl-2">Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const avail = Math.max(0, r.available_qty - r.allocated_qty);
          const priceDiff = r.allocated_qty > 0 && Math.abs(r.draft_amount - r.allocated_current_value) > 0.01;
          return (
            <tr key={r.id} className="border-t border-gray-800 align-top">
              <td className="py-1.5 pr-2 text-white min-w-[220px]">
                {r.part_name || "Unknown part"}
                <div className="text-[10px] text-gray-500">{[r.part_number, r.source, r.qty_removed ? `${r.qty_removed} removed` : null].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="text-right tabular-nums">{r.qty}</td>
              <td className="text-right tabular-nums">{r.invoiced_qty || <span className="text-gray-600">0</span>}</td>
              <td className="text-right tabular-nums">
                {r.allocated_qty ? <span className="text-blue-300">{r.allocated_qty}</span> : <span className="text-gray-600">0</span>}
                {r.draft_qty > r.allocated_qty && <span className="text-amber-400"> / {r.draft_qty}</span>}
                {r.allocated_qty > 0 && <div className={`text-[10px] ${priceDiff ? "text-amber-400" : "text-gray-500"}`}>{money(r.draft_amount)}{priceDiff && " on draft"}</div>}
              </td>
              <td className={`text-right tabular-nums ${avail ? "text-green-400" : "text-gray-600"}`}>{avail}</td>
              <td className="text-right tabular-nums">{money(r.unit_retail)}{r.retail_override && " *"}</td>
              <td className="text-right tabular-nums">{money(r.billable)}</td>
              <td className="text-right tabular-nums">
                <CostStateLabel state={r.cost_state} actual={r.actual_unit_cost != null ? r.actual_unit_cost * r.qty : null} estimate={r.est_cost} />
              </td>
              <td className="pl-2"><FlagChips flags={rowFlags(r)} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}