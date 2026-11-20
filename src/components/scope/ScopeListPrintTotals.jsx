import React from "react";

/** Grand-total footer for the scope list print. Labels come from the canonical rollup. */
export default function ScopeListPrintTotals({ totals: t, showStatus, label = "TOTAL", asBody = false }) {
  const tbd = t.hard_cost_tbd_count + t.legacy_budget_tbd_count + (t.labor_tbd_count || 0);
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
        <td className="num hc" style={cell}>{t.hard_cost_label || "—"}</td>
        <td className="num lab" style={cell}>{t.ak_hours_label || "—"}</td>
        <td className="num lab" style={cell}>{t.ak_labor_label || "—"}</td>
        <td className="num" style={cell}>{t.total_label || "—"}</td>
      </tr>
    </Wrapper>
  );
}