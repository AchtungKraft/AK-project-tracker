import React from "react";
import { subtotalNotes } from "./scopeFinancialSummaryModel";

// Visual weight per level: group (light) < category < decision < grand (All Scope).
const VARIANTS = {
  group: { cls: "sl-subtotal sl-subtotal-group", cell: { background: "#f8fafc", borderTop: "1px solid #cbd5e1", fontWeight: 600, fontSize: "8.5pt", color: "#334155" } },
  category: { cls: "sl-subtotal sl-subtotal-category", cell: { background: "#e2e8f0", borderTop: "1.5px solid #475569", fontWeight: 700, fontSize: "9pt" } },
  decision: { cls: "sl-subtotal", cell: { borderTop: "2px solid #111827", fontWeight: 700, fontSize: "9.5pt" } },
  grand: { cls: "sl-subtotal sl-grand", cell: { background: "#f1f5f9", borderTop: "3px double #111827", borderBottom: "2px solid #111827", fontWeight: 800, fontSize: "10.5pt" } },
};

/** One subtotal/total row aligned to the report's financial columns. Labels come from the canonical rollup. */
export default function ScopeListPrintTotals({ totals: t, showStatus, label = "TOTAL", variant = "decision" }) {
  const v = VARIANTS[variant] || VARIANTS.decision;
  const notes = subtotalNotes(t);
  const noun = variant === "group" || variant === "category" ? "deliverable" : "item";
  // Never use tfoot: browsers repeat it on every printed page.
  return (
    <tr className={v.cls}>
      <td colSpan={showStatus ? 2 : 1} style={v.cell}>
        {label} <span style={{ fontWeight: 400, color: "#64748b" }}>· {t.count} {noun}{t.count === 1 ? "" : "s"}</span>
        {notes.map(n => <div key={n} style={{ fontWeight: 400, fontSize: "7.5pt", color: "#9a3412" }}>{n}</div>)}
      </td>
      <td className="num hc" style={v.cell}>{t.hard_cost_label || "—"}</td>
      <td className="num lab" style={v.cell}>{t.ak_hours_label || "—"}</td>
      <td className="num lab" style={v.cell}>{t.ak_labor_label || "—"}</td>
      <td className="num" style={v.cell}>{t.total_label || "—"}</td>
    </tr>
  );
}