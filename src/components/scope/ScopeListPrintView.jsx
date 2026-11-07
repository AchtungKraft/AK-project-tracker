import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { buildScopeHierarchy, DECISION_LABELS } from "./scopeHelpers";
import { computeScopePricingRollup } from "./scopePricingHelpers";
import ScopeListPrintRows from "./ScopeListPrintRows";
import ScopeListPrintTotals from "./ScopeListPrintTotals";

const STYLES = `
@media print {
  #root { display: none !important; }
  .sl-bar { display: none !important; }
  @page { margin: 0.5in; }
  #scope-list-root { padding: 0 !important; box-shadow: none !important; max-width: none !important; }
  #scope-list-root tr { break-inside: avoid; }
  #scope-list-root thead { display: table-header-group; }
  #scope-list-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
@media screen {
  #scope-print-portal { position: fixed; inset: 0; z-index: 9999; background: #e5e7eb; overflow-y: auto; }
  #scope-list-root { max-width: 1040px; margin: 0 auto; padding: 36px 32px 56px; background: white; min-height: 100vh; }
  .sl-bar { position: sticky; top: 0; z-index: 10; background: #1e293b; padding: 10px 24px; display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .sl-btn { padding: 6px 14px; border-radius: 5px; font-size: 13px; cursor: pointer; border: 1px solid #475569; background: #334155; color: #e2e8f0; }
  .sl-btn.on { background: #2563eb; border-color: #2563eb; color: white; font-weight: 600; }
}
#scope-list-root { font-family: 'Segoe UI', system-ui, sans-serif; color: #111827; font-size: 9pt; }
#scope-list-root table { width: 100%; border-collapse: collapse; }
#scope-list-root th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; color: #475569 !important; border-bottom: 2px solid #111827; padding: 5px 6px; }
#scope-list-root td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
#scope-list-root .num { text-align: right; white-space: nowrap; }
#scope-list-root .hc { background: #fff7ed; }
#scope-list-root .lab { background: #eff6ff; }
`;

/** Compact list-style print of a scope review: hard cost/parts vs labor per item. */
export default function ScopeListPrintView({ request, project, categories, groups, items, laborEstimates, onClose }) {
  const hasApproved = items.some(i => i.decision_status === "approved");
  const [filter, setFilter] = useState(hasApproved ? "approved" : "all");

  const visible = useMemo(
    () => (filter === "approved" ? items.filter(i => i.decision_status === "approved") : items),
    [items, filter]
  );
  const hierarchy = useMemo(() => buildScopeHierarchy(categories, groups, visible), [categories, groups, visible]);
  const totals = useMemo(() => computeScopePricingRollup(visible, laborEstimates), [visible, laborEstimates]);

  return (
    <>
      <style>{STYLES}</style>
      <div className="sl-bar">
        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>Scope List — Print Preview</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`sl-btn ${filter === "approved" ? "on" : ""}`} onClick={() => setFilter("approved")}>Approved only</button>
          <button className={`sl-btn ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All items</button>
          <button className="sl-btn on" onClick={() => window.print()}>Print / Save PDF</button>
          <button className="sl-btn" onClick={onClose}>Close</button>
        </div>
      </div>
      <div id="scope-list-root">
        <div style={{ fontSize: "7.5pt", letterSpacing: ".15em", color: "#6b7280", fontWeight: 700 }}>ÄCHTUNG KRAFT</div>
        <div style={{ fontSize: "16pt", fontWeight: 700, marginTop: 2 }}>{request?.title || "Scope Review"}</div>
        <div style={{ color: "#6b7280", marginBottom: 14 }}>
          {project?.name || "—"} · {filter === "approved" ? "Approved items" : "All items"} ({visible.length}) · {format(new Date(), "MMM d, yyyy")}
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              {filter === "all" && <th>Status</th>}
              <th className="num hc">Hard Cost / Parts</th>
              <th className="num lab">Labor Hrs</th>
              <th className="num lab">Labor $</th>
              <th className="num">Total Est.</th>
            </tr>
          </thead>
          <tbody>
            <ScopeListPrintRows hierarchy={hierarchy} laborEstimates={laborEstimates} showStatus={filter === "all"} statusLabels={DECISION_LABELS} />
          </tbody>
          <ScopeListPrintTotals totals={totals} showStatus={filter === "all"} />
        </table>
        <p style={{ color: "#6b7280", fontSize: "7.5pt", marginTop: 12 }}>
          Estimates are ranges. Hard cost covers parts, materials and outside services; labor is Ächtung Kraft shop time. TBD items are not included in totals.
        </p>
      </div>
    </>
  );
}