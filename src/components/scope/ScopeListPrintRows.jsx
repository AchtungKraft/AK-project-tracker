import React from "react";
import { buildFinancialSummarySections } from "./scopeFinancialSummaryModel";
import ScopeListPrintItemRow from "./ScopeListPrintItemRow";
import ScopeListPrintTotals from "./ScopeListPrintTotals";

const plural = (n) => `${n} deliverable${n === 1 ? "" : "s"}`;
const DARK = { background: "#1e293b", color: "white", fontWeight: 700, fontSize: "9.5pt", padding: "5px 7px" };
const LIGHT = { background: "#f1f5f9", color: "#1e293b", fontWeight: 700, fontSize: "8.5pt", padding: "4px 7px 4px 14px", borderBottom: "1px solid #cbd5e1" };

/** Category → Group → deliverables, closed by group subtotals and (multi-group) category subtotals. */
export default function ScopeListPrintRows({ hierarchy, laborEstimates, showStatus, statusLabels }) {
  const cols = showStatus ? 6 : 5;
  return buildFinancialSummarySections(hierarchy, laborEstimates).map(cat => {
    const single = cat.groups.length === 1;
    return (
      <React.Fragment key={cat.id}>
        <tr className="sl-heading">
          <td colSpan={cols} style={DARK}>
            {cat.name}{single && <span style={{ fontWeight: 400, color: "#cbd5e1" }}> · {cat.groups[0].name}</span>}
            <span style={{ float: "right", fontWeight: 400, color: "#cbd5e1", fontSize: "8pt" }}>{plural(cat.count)}</span>
          </td>
        </tr>
        {cat.groups.map(g => (
          <React.Fragment key={g.id}>
            {!single && (
              <tr className="sl-heading">
                <td colSpan={cols} style={LIGHT}>
                  {g.name}<span style={{ float: "right", fontWeight: 400, color: "#64748b" }}>{plural(g.items.length)}</span>
                </td>
              </tr>
            )}
            {g.items.map(item => (
              <ScopeListPrintItemRow key={item.id} item={item} laborEstimates={laborEstimates} showStatus={showStatus} statusLabels={statusLabels} />
            ))}
            <ScopeListPrintTotals totals={g.totals} showStatus={showStatus} variant="group" label={`${g.name} subtotal`} />
          </React.Fragment>
        ))}
        {cat.showCategorySubtotal && (
          <ScopeListPrintTotals totals={cat.totals} showStatus={showStatus} variant="category" label={`${cat.name.toUpperCase()} — CATEGORY SUBTOTAL`} />
        )}
      </React.Fragment>
    );
  });
}