import React from "react";
import { money } from "../finFormat";
import { accMoney } from "./fundingFormat";

// Explicitly linked parts (commitments) for one scope item, or the unattributed list.
export default function ReconPartsTable({ rows, showReason = false, reasonLabel = {} }) {
  if (!rows.length) return <p className="text-xs text-gray-500">No linked parts.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[720px]">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1 font-normal">Part</th><th className="font-normal">Qty</th><th className="font-normal">Planned cost</th><th className="font-normal">PO committed</th>
            <th className="font-normal">Received</th><th className="font-normal">Vendor-invoiced</th><th className="font-normal">Planned retail</th><th className="font-normal">Client invoiced</th>
            {showReason && <th className="font-normal">Why unattributed</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.commitment_id} className="border-t border-gray-800 text-gray-200 align-top">
              <td className="py-1 pr-2">
                <div className="text-white">{r.part_name}</div>
                <div className="text-[10px] text-gray-500">{r.part_number || "no part #"} · {r.billing_status}{r.po_lines.length ? ` · ${[...new Set(r.po_lines.map((l) => l.po_number).filter(Boolean))].join(", ")}` : " · no PO"}</div>
                {r.po_excess_qty > 0 && <div className="text-[10px] text-amber-300">PO orders {r.po_excess_qty} more than needed — excess not counted</div>}
              </td>
              <td className="pr-2">{r.effective_qty}</td>
              <td className="pr-2">{money(r.planned_cost)}</td>
              <td className="pr-2">{accMoney(r.po_committed_cost)}</td>
              <td className="pr-2">{accMoney(r.received_cost)}{r.external_received_cost.known > 0 && <div className="text-[10px] text-gray-500">+{money(r.external_received_cost.known)} non-PO</div>}</td>
              <td className="pr-2">{accMoney(r.vendor_invoiced_cost)}</td>
              <td className="pr-2 text-sky-200">{money(r.planned_retail)}</td>
              <td className="pr-2 text-sky-200">{money(r.client_invoiced)}</td>
              {showReason && <td className="text-amber-200">{reasonLabel[r.reason] || r.reason}{r.task_names?.filter(Boolean).length ? <div className="text-[10px] text-gray-500">{r.task_names.filter(Boolean).join(", ")}</div> : null}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}