import React from "react";
import { accMoney, range } from "./fundingFormat";
import { hrs } from "../finFormat";

const Row = ({ label, a, u, p }) => (
  <tr className="border-t border-gray-800">
    <td className="py-1 pr-3 text-gray-400">{label}</td>
    <td className="py-1 pr-3 text-white">{accMoney(a)}</td>
    <td className="py-1 pr-3 text-amber-200">{accMoney(u)}</td>
    <td className="py-1 text-gray-300">{accMoney(p)}</td>
  </tr>
);
const ROWS = [["Planned purchasing cost", "planned_cost"], ["Committed PO cost", "po_committed_cost"], ["Received cost (PO, landed)", "received_cost"], ["Received cost (non-PO)", "external_received_cost"], ["Vendor-invoiced cost", "vendor_invoiced_cost"], ["Planned retail (client)", "planned_retail"], ["Client invoiced", "client_invoiced"]];

export default function ReconTotals({ data }) {
  const { totals: t, approved_totals: ap } = data;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-gray-900/60 px-3 py-2"><div className="text-gray-400">Approved hard-cost allowance</div><div className="text-white font-semibold">{range(ap.hard_cost)}</div><div className="text-[10px] text-gray-500">{ap.hard_cost_tbd} TBD · {ap.hard_cost_not_estimated} not estimated</div></div>
        <div className="rounded-md bg-gray-900/60 px-3 py-2"><div className="text-gray-400">Approved labor</div><div className="text-white font-semibold">{range(ap.labor_dollars)}</div><div className="text-[10px] text-gray-500">{ap.labor_hours?.min ?? "—"}–{ap.labor_hours?.max ?? "—"}h approved</div></div>
        <div className="rounded-md bg-gray-900/60 px-3 py-2"><div className="text-gray-400">Current task labor projection</div><div className="text-white font-semibold">{hrs(t.labor.scope_task_projected_hours)}</div><div className="text-[10px] text-gray-500">{hrs(t.labor.scope_task_logged_hours)} logged on scope tasks · {hrs(t.labor.non_scope_logged_hours)} outside scope</div></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead><tr className="text-left text-gray-500"><th className="py-1 font-normal">Parts</th><th className="font-normal">Attributed to scope</th><th className="font-normal">Unattributed</th><th className="font-normal">Project total</th></tr></thead>
          <tbody>{ROWS.map(([l, k]) => <Row key={k} label={l} a={t.attributed[k]} u={t.unattributed[k]} p={t.project[k]} />)}</tbody>
        </table>
      </div>
      <p className={`text-[11px] ${t.reconciles ? "text-emerald-400" : "text-red-400"}`}>
        {t.reconciles ? "Attributed + unattributed = project total (each commitment counted once)." : "Attributed + unattributed does not equal project total — review."} {t.attributed_commitments} attributed · {t.unattributed_commitments} unattributed · {t.cancelled_commitments_excluded} cancelled excluded.
      </p>
    </div>
  );
}