import React from "react";
import { computeScopeItemPricing, formatDollarRange } from "./scopePricingHelpers";
import { getComponentDetailRows } from "./scopeItemDisplay";

const TONES = { approved: ["#dcfce7", "#166534"], needs_review: ["#fef9c3", "#854d0e"], not_now: ["#e5e7eb", "#374151"], request_changes: ["#ffedd5", "#9a3412"], reapproval_required: ["#fee2e2", "#991b1b"] };

const hardCostLabel = (p) => (p.pricing_model === "legacy_estimate" ? "—" : p.hard_cost_label || "—");
const totalLabel = (p) => {
  if (p.pricing_model === "legacy_estimate") {
    if (p.legacy_budget_tbd) return "TBD";
    const v = formatDollarRange(p.legacy_budget_min, p.legacy_budget_max);
    return v ? `${v} (legacy)` : "—";
  }
  if (p.estimate_format === "legacy" && p.hard_cost_tbd) return "TBD";
  return p.total_label || "—";
};

/** One deliverable row. Status lives in the Status column / decision section, not in the Item cell. */
export default function ScopeListPrintItemRow({ item, laborEstimates, showStatus, statusLabels }) {
  const labor = laborEstimates.filter(le => le.scope_item_id === item.id);
  const p = computeScopeItemPricing(item, labor);
  const note = item.hard_cost_lines?.length ? "" : [item.hard_cost_note, item.budget_note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
  const { hardRows, laborRows } = getComponentDetailRows(item, labor);
  const detailLines = [
    ...hardRows.map(r => "Hard · " + r.description + (r.value ? ": " + r.value : "")),
    ...laborRows.map(r => "Labor · " + (r.description || r.category) + (r.hours ? " (" + r.hours + ")" : "")),
  ];
  const status = item.decision_status || "needs_review";
  const tone = TONES[status] || TONES.needs_review;
  const statusText = status === "needs_review" ? "Pending" : status === "not_now" ? "Later" : (statusLabels[status] || status);

  return (
    <tr className="sl-item">
      <td style={{ backgroundColor: tone[0], borderLeft: "3px solid " + tone[1] }}>
        <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{item.title}</div>
        {note && <div style={{ color: "#6b7280", fontSize: "7.5pt", whiteSpace: "pre-wrap" }}>{note}</div>}
        {detailLines.length > 0 && (
          <div style={{ marginTop: 3, paddingTop: 3, borderTop: "1px solid #dbe2ea" }}>
            {detailLines.map((line, i) => <div key={i} style={{ color: "#475569", fontSize: "7.5pt", marginTop: 1, lineHeight: 1.3, whiteSpace: "pre-wrap" }}>{line}</div>)}
          </div>
        )}
      </td>
      {showStatus && <td style={{ fontSize: "8pt", fontWeight: 700, color: tone[1], whiteSpace: "nowrap" }}>{statusText}</td>}
      <td className="num hc">{hardCostLabel(p)}</td>
      <td className="num lab">{p.ak_hours_label || "—"}</td>
      <td className="num lab">{p.ak_labor_label || "—"}</td>
      <td className="num" style={{ fontWeight: 600 }}>{totalLabel(p)}</td>
    </tr>
  );
}