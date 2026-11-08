import React from "react";
import { money } from "../finFormat";
import { REASON_LABEL } from "./fundingFormat";
import ReconPartsTable from "./ReconPartsTable";

// Everything on the project that could not be explicitly tied to one approved scope item.
export default function UnattributedPanel({ data }) {
  const u = data.unattributed, p = data.unmatched_purchasing;
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-gray-300 font-semibold mb-1">Unattributed parts ({u.commitments.length})</div>
        <div className="flex flex-wrap gap-x-3 text-gray-400 mb-1">{Object.entries(u.count_by_reason).map(([k, n]) => <span key={k}>{REASON_LABEL[k] || k}: {n}</span>)}</div>
        <ReconPartsTable rows={u.commitments} showReason reasonLabel={REASON_LABEL} />
      </div>
      <div>
        <div className="text-gray-300 font-semibold mb-1">Services ({u.services.length}) — {u.services_reason}</div>
        {u.services.map((s) => <div key={s.id} className="text-gray-400">{s.description} · {s.status} · planned cost {money(s.planned_cost)} · billable {money(s.total_billable)}{s.is_billed ? " · billed" : ""}</div>)}
      </div>
      <div>
        <div className="text-gray-300 font-semibold mb-1">Unmatched purchasing records</div>
        <ul className="text-gray-400 space-y-0.5 list-disc pl-4">
          <li>PO quantity beyond what the project needs (not counted): {p.po_quantity_beyond_commitment.length ? p.po_quantity_beyond_commitment.map((x) => `${x.part_name} +${x.excess_qty} (${x.po_numbers.join(", ")})`).join("; ") : "none"}</li>
          <li>Open PO lines on cancelled commitments: {p.po_lines_on_cancelled_commitments.length || "none"}</li>
          <li>Scope task links to another project's commitment: {p.scope_task_links_to_other_project_commitments.length || "none"}</li>
          <li>Scope task links with no commitment: {p.scope_task_links_without_commitment.length ? p.scope_task_links_without_commitment.map((l) => l.part_name || "part").join(", ") : "none"}</li>
          <li>PO lines with no commitment (all projects): {p.global_po_lines_without_commitment ?? "unknown"} — {p.note}</li>
        </ul>
      </div>
    </div>
  );
}