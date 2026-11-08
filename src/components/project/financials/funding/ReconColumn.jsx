import React from "react";
import { money } from "../finFormat";
import { accMoney, range } from "./fundingFormat";
import { addAcc } from "./fundingStatus";
import FvrStat from "./FvrStat";

// Shop costs: approved allowance vs explicit purchasing records. Costs only (retail is shown in the detail table).
export default function ReconColumn({ data }) {
  const ap = data.approved_totals, t = data.totals, p = t.project, gap = data.purchasing_gap;
  const hcNote = [ap.hard_cost_tbd && `${ap.hard_cost_tbd} TBD`, ap.hard_cost_not_estimated && `${ap.hard_cost_not_estimated} not estimated`].filter(Boolean).join(" · ");
  return (
    <div className="rounded-md bg-gray-900/50 border border-gray-800 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-300 mb-1">Reconciliation · shop costs</h4>
      <FvrStat label="Approved hard-cost allowance" value={range(ap.hard_cost)} na={!ap.hard_cost || ap.hard_cost.min == null} sub={hcNote ? `Known items only · ${hcNote}` : "Approved scope, known items"} />
      <FvrStat label="Planned purchase requirements" value={accMoney(p.planned_cost)} sub="Part commitments, planned unit cost × qty" />
      <FvrStat label="PO committed cost" value={accMoney(p.po_committed_cost)} sub="AK purchase orders, up to qty needed" />
      <FvrStat label="Received actual cost" value={accMoney(addAcc(p.received_cost, p.external_received_cost))} sub={`PO landed ${accMoney(p.received_cost)} · non-PO ${accMoney(p.external_received_cost)}`} />
      <FvrStat label="Vendor-invoiced cost" value={accMoney(p.vendor_invoiced_cost)} sub="Non-draft vendor invoices" />
      <FvrStat label="Unattributed purchasing" value={accMoney(t.unattributed.planned_cost)} tone={t.unattributed_commitments ? "text-amber-300" : "text-white"} sub={`${t.unattributed_commitments} part(s) not linked to one scope task · ${data.unattributed.services.length} service(s)`} />
      <FvrStat label="Planned purchases not yet on a PO" na={!gap.available} value={money(gap.not_on_po)} sub={gap.available ? (gap.committed_over_planned ? `PO cost exceeds plan by ${money(gap.committed_over_planned)}` : "Planned − PO committed") : `Cost unknown: ${gap.reason}`} />
    </div>
  );
}