import React from "react";
import { formatHoursRange } from "./scopeHelpers";
import { computeScopeItemPricing, computeScopePricingRollup, formatDollarRange } from "./scopePricingHelpers";

const hardCostLabel = (p) => {
  if (p.pricing_model === "legacy_estimate") return "—";
  if (p.hard_cost_tbd) return "TBD";
  return formatDollarRange(p.hard_cost_min, p.hard_cost_max) || "$0";
};

const totalLabel = (p) => {
  if (p.pricing_model === "legacy_estimate") {
    if (p.legacy_budget_tbd) return "TBD";
    const v = formatDollarRange(p.legacy_budget_min, p.legacy_budget_max);
    return v ? `${v} (legacy)` : "—";
  }
  if (p.hard_cost_tbd) return "TBD";
  return formatDollarRange(p.total_estimate_min, p.total_estimate_max) || "—";
};

/** Category band + item rows for the scope list print. */
export default function ScopeListPrintRows({ hierarchy, laborEstimates, showStatus, statusLabels }) {
  const laborFor = (id) => laborEstimates.filter(le => le.scope_item_id === id);
  const cols = showStatus ? 6 : 5;

  return hierarchy.filter(cat => cat.allItems.length > 0).map(cat => {
    const r = computeScopePricingRollup(cat.allItems, laborEstimates);
    return (
      <React.Fragment key={cat.id}>
        <tr>
          <td colSpan={cols} style={{ background: "#1e293b", color: "white", fontWeight: 700, fontSize: "9.5pt" }}>
            {cat.name}
            <span style={{ float: "right", fontWeight: 400, color: "#cbd5e1", fontSize: "8pt" }}>
              Hard {formatDollarRange(r.hard_cost_min, r.hard_cost_max) || "$0"} · Labor {formatDollarRange(r.ak_labor_min, r.ak_labor_max) || "$0"}
            </span>
          </td>
        </tr>
        {cat.groups.flatMap(g => g.items.map(item => {
          const p = computeScopeItemPricing(item, laborFor(item.id));
          const note = [item.hard_cost_note, item.budget_note].filter(Boolean).join(" · ");
          return (
            <tr key={item.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                <div style={{ color: "#6b7280", fontSize: "7.5pt" }}>{g.name}{note ? ` · ${note}` : ""}</div>
              </td>
              {showStatus && <td style={{ fontSize: "8pt" }}>{statusLabels[item.decision_status || "needs_review"] || item.decision_status}</td>}
              <td className="num hc">{hardCostLabel(p)}</td>
              <td className="num lab">{p.labor_estimated ? formatHoursRange(p.ak_hours_min, p.ak_hours_max) : "—"}</td>
              <td className="num lab">{p.labor_estimated ? formatDollarRange(p.ak_labor_min, p.ak_labor_max) : "—"}</td>
              <td className="num" style={{ fontWeight: 600 }}>{totalLabel(p)}</td>
            </tr>
          );
        }))}
      </React.Fragment>
    );
  });
}