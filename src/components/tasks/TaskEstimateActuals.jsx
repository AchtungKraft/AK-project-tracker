import React from "react";
import { Link } from "react-router-dom";
import { aggText, laborLoggedText, laborChargeText } from "@/components/scope/baselineFormat";

const Row = ({ label, children, hint }) => (
  <div className="flex justify-between gap-3 text-xs">
    <span className="text-gray-500 shrink-0">{label}</span>
    <span className="text-gray-200 text-right" title={hint}>{children}</span>
  </div>
);

// Read-only actuals attributable to this task (TaskPartLink → PartCommitment, TaskTimeEntry).
export default function TaskEstimateActuals({ fin, servicesHref, onLinkParts }) {
  const parts = fin?.parts;
  const n = parts?.link_count || 0;
  const shared = (parts?.lines || []).some((l) => l.shared_commitment);
  return (
    <div className="space-y-1 pt-2 border-t border-gray-800">
      <Row label="Parts linked">
        {n ? `${n}${parts.cancelled_excluded ? ` (${parts.cancelled_excluded} cancelled excluded)` : ""}` : "None linked"}
      </Row>
      <Row label="Committed cost">{aggText(parts?.committed_cost, n)}</Row>
      <Row label="Actual cost">{aggText(parts?.actual_cost, n)}</Row>
      <Row label="Billed retail (parts)" hint={shared ? "Commitments shared with other tasks cannot be attributed" : undefined}>
        {aggText(parts?.billed, n)}{shared ? " · shared" : ""}
      </Row>
      <Row label="Labor logged">{laborLoggedText(fin?.labor)}</Row>
      <Row label="Labor at rate">{laborChargeText(fin?.labor)}</Row>
      <Row label="Services">Project-level · not attributed to task</Row>
      <div className="flex flex-wrap gap-3 pt-1 text-[11px]">
        <button type="button" onClick={onLinkParts} className="text-blue-400 hover:text-blue-300">Link parts (Parts section)</button>
        <Link to={servicesHref} className="text-blue-400 hover:text-blue-300">Open project services</Link>
      </div>
    </div>
  );
}