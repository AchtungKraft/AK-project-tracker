import React from "react";
import { formatHoursRange } from "./scopeHelpers";
import { formatDollarRange } from "./scopePricingHelpers";

/** Grand-total footer for the scope list print. */
export default function ScopeListPrintTotals({ totals: t, showStatus, label = "TOTAL", asBody = false }) {
  const tbd = t.hard_cost_tbd_count + t.legacy_budget_tbd_count;
  const cell = { borderTop: "2px solid #111827", fontWeight: 700, fontSize: "9.5pt" };
  // Never use tfoot: browsers repeat it on every printed page.
  const Wrapper = React.Fragment;
  return (
    <Wrapper>
      <tr>
        <td colSpan={showStatus ? 2 : 1} style={cell}>
          {label} ({t.count} items)
          {tbd > 0 && <div style={{ fontWeight: 400, fontSize: "7.5pt", color: "#9a3412" }}>{tbd} item(s) TBD — not included</div>}
        </td>
        <td className="num hc" style={cell}>{formatDollarRange(t.hard_cost_min, t.hard_cost_max) || "$0"}</td>
        <td className="num lab" style={cell}>{formatHoursRange(t.ak_hours_min, t.ak_hours_max) || "—"}</td>
        <td className="num lab" style={cell}>{formatDollarRange(t.ak_labor_min, t.ak_labor_max) || "$0"}</td>
        <td className="num" style={cell}>{formatDollarRange(t.total_estimate_min, t.total_estimate_max) || "—"}</td>
      </tr>
    </Wrapper>
  );
}