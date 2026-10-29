import React from "react";
import { money } from "./finFormat";
import FlagChips from "./FlagChips";
import CostStateLabel from "./CostStateLabel";
import MobileLineCard from "./MobileLineCard";
import PartBillingStatus from "./PartBillingStatus";

// Only material discrepancies show per row; harmless stale totals are summarized at section level.
const rowFlags = (r) => r.flags.filter((f) => f !== "stale_stored_total" || r.stale_detail?.kind !== "price_entered_later");
const avail = (r) => Math.max(0, r.available_qty - r.allocated_qty);
const estCost = (r) => (r.cost_state === "missing" ? <span className="text-amber-400">Not recorded</span> : r.cost_state === "zero_client_supplied" ? <span className="text-gray-400">$0 client</span> : money(r.est_cost));
const actCost = (r) => (r.actual_unit_cost != null ? money(r.actual_unit_cost * r.qty) : <span className="text-gray-500">Not recorded</span>);
const sub = (r) => [r.part_number, r.source, r.qty_removed ? `${r.qty_removed} removed` : null].filter(Boolean).join(" · ");

export default function FinancialPartRows({ rows }) {
  return (
    <>
      <table className="hidden md:table w-full text-xs text-gray-300">
        <thead className="text-gray-500 uppercase text-[10px]">
          <tr>
            <th className="text-left py-1">Part</th><th className="text-right">Required</th><th className="text-right">Final</th>
            <th className="text-right">Draft</th><th className="text-right">Avail.</th><th className="text-right">Est. cost</th>
            <th className="text-right">Actual cost</th><th className="text-right">Unit price</th><th className="text-right">Billable</th>
            <th className="text-left pl-3">Billing status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-800 align-top">
              <td className="py-1.5 pr-2 text-white min-w-[200px]">{r.part_name || "Unknown part"}<div className="text-[10px] text-gray-500">{sub(r)}</div></td>
              <td className="text-right tabular-nums px-1">{r.qty}</td>
              <td className="text-right tabular-nums px-1">{r.invoiced_qty}</td>
              <td className="text-right tabular-nums px-1">{r.allocated_qty}{r.draft_qty > r.allocated_qty && <span className="text-amber-400"> / {r.draft_qty}</span>}</td>
              <td className="text-right tabular-nums px-1">{avail(r)}</td>
              <td className="text-right tabular-nums px-1 whitespace-nowrap">{estCost(r)}</td>
              <td className="text-right tabular-nums px-1 whitespace-nowrap">{actCost(r)}</td>
              <td className="text-right tabular-nums px-1">{money(r.unit_retail)}{r.retail_override && " *"}</td>
              <td className="text-right tabular-nums px-1 text-white">{money(r.billable)}</td>
              <td className="pl-3 min-w-[130px]"><PartBillingStatus r={r} /><FlagChips flags={rowFlags(r)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="md:hidden">
        {rows.map((r) => (
          <MobileLineCard key={r.id} title={r.part_name || "Unknown part"} sub={sub(r)}
            fields={[["Required", r.qty], ["Final", r.invoiced_qty], ["Draft", r.allocated_qty], ["Avail.", avail(r)],
              ["Est. cost", estCost(r)], ["Actual", actCost(r)], ["Unit", money(r.unit_retail)], ["Billable", money(r.billable)]]}
            status={<><PartBillingStatus r={r} /><FlagChips flags={rowFlags(r)} /></>} />
        ))}
      </div>
    </>
  );
}