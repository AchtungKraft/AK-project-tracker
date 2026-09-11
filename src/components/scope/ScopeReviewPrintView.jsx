import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { format } from "date-fns";
import { buildScopeHierarchy, DECISION_LABELS, formatHoursRange } from "./scopeHelpers";
import {
  computeScopeItemPricing,
  computeScopePricingRollup,
  formatDollarRange,
} from "./scopePricingHelpers";

/* ══════════════════════════════════════════════
   Utility helpers
   ══════════════════════════════════════════════ */

const fmtDate = (d) => {
  if (!d) return null;
  try { return format(new Date(d), "MMMM d, yyyy"); } catch { return d; }
};

const fmtDateShort = (d) => {
  if (!d) return null;
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
};

const DECISION_BADGE_STYLES = {
  approved:             { bg: "#dcfce7", color: "#166534", border: "#86efac" },
  not_now:              { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db" },
  needs_review:         { bg: "#fefce8", color: "#854d0e", border: "#fde68a" },
  request_changes:      { bg: "#fff7ed", color: "#9a3412", border: "#fdba74" },
  reapproval_required:  { bg: "#fef2f2", color: "#991b1b", border: "#fca5a5" },
};

/* Helper: build category rollup summary text parts */
function buildCatSummary(rollup) {
  const { count, total_estimate_min, total_estimate_max, has_incomplete, hard_cost_tbd_count,
    ak_hours_min, ak_hours_max, legacy_count, classified_count,
    legacy_budget_min, legacy_budget_max, legacy_budget_tbd_count } = rollup;

  const hoursLabel = formatHoursRange(ak_hours_min, ak_hours_max);
  const incompleteCount = (has_incomplete ? 1 : 0) + hard_cost_tbd_count + legacy_budget_tbd_count;

  let totalLabel = null;
  if (classified_count > 0 && legacy_count === 0 && !has_incomplete && hard_cost_tbd_count === 0) {
    totalLabel = formatDollarRange(total_estimate_min, total_estimate_max);
  } else if (legacy_count > 0 && classified_count === 0 && legacy_budget_tbd_count === 0) {
    totalLabel = formatDollarRange(legacy_budget_min, legacy_budget_max);
  }

  return { count, totalLabel, incompleteCount, hoursLabel };
}

/* ══════════════════════════════════════════════
   Print CSS (injected once)
   ══════════════════════════════════════════════ */

const PRINT_STYLES = `
@media print {
  #root { display: none !important; }
  #scope-print-portal { display: block !important; }
  #scope-print-root {
    display: block !important;
    position: static !important;
    width: 100% !important;
    max-width: none !important;
    height: auto !important;
    overflow: visible !important;
    background: white !important;
    color: #111 !important;
    transform: none !important;
    padding: 32px 0 0 0 !important;
    margin: 0 !important;
  }
  /* Force background printing for hierarchy elements */
  #scope-print-root .sp-cat-band,
  #scope-print-root .sp-overview-row,
  #scope-print-root .sp-grp-band,
  #scope-print-root .sp-status-badge {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .scope-print-close-bar { display: none !important; }
  html, body {
    background: #fff !important;
    color: #111 !important;
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
    transform: none !important;
  }
  @page {
    margin: 0.55in 0.6in 0.7in 0.6in;
    size: letter;
  }
  .sp-page-break { page-break-before: always; }
  .sp-avoid-break { break-inside: avoid; page-break-inside: avoid; }
  .sp-keep-with-next { break-after: avoid; page-break-after: avoid; }
  .sp-cat-band + div { break-before: avoid; page-break-before: avoid; }

  /* ── CATEGORY BAND — robust print fallback ──
     When background-graphics is ON: dark fill + white text.
     When OFF: dark borders + dark text still communicate hierarchy. */
  .sp-cat-band {
    background: #1e293b !important;
    border-top: 3px solid #111827 !important;
    border-bottom: 3px solid #111827 !important;
    border-radius: 0 !important;
    color: #111827 !important;
  }
  .sp-cat-band .sp-cat-title { color: white !important; }
  .sp-cat-band .sp-cat-meta { color: #94a3b8 !important; }
  .sp-cat-band .sp-cat-pending { color: #fbbf24 !important; }
  /* Fallback: if background stripped, text must still be dark/readable */
  @supports not (print-color-adjust: exact) {
    .sp-cat-band .sp-cat-title { color: #111827 !important; }
    .sp-cat-band .sp-cat-meta { color: #6b7280 !important; }
    .sp-cat-band .sp-cat-pending { color: #b45309 !important; }
  }

  /* ── OVERVIEW ROW — same dual strategy ── */
  .sp-overview-row {
    background: #1e293b !important;
    border-bottom: 2px solid #111827 !important;
    border-radius: 0 !important;
    color: #111827 !important;
  }
  .sp-overview-row .sp-cat-title { color: white !important; }
  .sp-overview-row .sp-cat-meta { color: #94a3b8 !important; }
  .sp-overview-row .sp-cat-pending { color: #fbbf24 !important; }
  @supports not (print-color-adjust: exact) {
    .sp-overview-row .sp-cat-title { color: #111827 !important; }
    .sp-overview-row .sp-cat-meta { color: #6b7280 !important; }
    .sp-overview-row .sp-cat-pending { color: #b45309 !important; }
  }

  /* ── GROUP BAND — accent border always prints, pale fill when available ── */
  .sp-grp-band {
    background: #f1f5f9 !important;
    border-left: 4px solid #475569 !important;
    border-bottom: 1px solid #d1d5db !important;
    border-radius: 0 !important;
    color: #1e293b !important;
  }

  /* ── Running header/footer ── */
  .sp-running-header {
    position: fixed;
    top: 0; left: 0; right: 0;
    padding: 0 0.6in;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 7.5pt;
    color: #9ca3af;
    border-bottom: 0.5px solid #e5e7eb;
  }
  .sp-running-footer {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    padding: 0 0.6in;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 7pt;
    color: #9ca3af;
    border-top: 0.5px solid #e5e7eb;
  }
}

@media screen {
  #scope-print-portal {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #e5e7eb;
    overflow-y: auto;
  }
  #scope-print-root {
    max-width: 816px;
    margin: 0 auto;
    padding: 48px 40px 64px;
    background: white;
    color: #111;
    min-height: 100vh;
    box-shadow: 0 0 40px rgba(0,0,0,0.12);
  }
  .scope-print-close-bar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #1e293b;
    padding: 10px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #334155;
  }
  .sp-running-header, .sp-running-footer { display: none; }
}
`;

/* ══════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════ */

function StatusBadge({ status }) {
  const s = DECISION_BADGE_STYLES[status] || DECISION_BADGE_STYLES.needs_review;
  return (
    <span className="sp-status-badge" style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 3,
      fontSize: "7.5pt", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
      backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: "nowrap",
    }}>
      {DECISION_LABELS[status] || status}
    </span>
  );
}

function ItemImages({ images }) {
  if (!images || images.length === 0) return null;
  const size = images.length === 1 ? 180 : images.length === 2 ? 150 : 120;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: "7pt", textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>
        Reference Images
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {images.slice(0, 4).map((url, i) => (
          <img key={i} src={url} alt=""
            style={{
              width: size, height: size * 0.75, objectFit: "cover",
              borderRadius: 3, border: "1px solid #e5e7eb",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN PRINT VIEW
   ══════════════════════════════════════════════ */

export default function ScopeReviewPrintView({
  request, project, categories, groups, items, laborEstimates, confirmations, onClose,
}) {
  const printRef = useRef(null);

  const hierarchy = useMemo(() => buildScopeHierarchy(categories, groups, items), [categories, groups, items]);

  const laborByItem = useMemo(() => {
    const m = new Map();
    for (const le of laborEstimates) {
      if (!m.has(le.scope_item_id)) m.set(le.scope_item_id, []);
      m.get(le.scope_item_id).push(le);
    }
    return m;
  }, [laborEstimates]);

  const isDraft = request?.status === "draft";

  const lastConfirmation = useMemo(() => {
    if (!confirmations || confirmations.length === 0) return null;
    return [...confirmations].sort((a, b) => new Date(b.confirmed_at) - new Date(a.confirmed_at))[0];
  }, [confirmations]);

  const isConfStale = useMemo(() => {
    if (!lastConfirmation) return false;
    const currentApproved = items.filter(i => i.decision_status === "approved").map(i => i.id).sort();
    const snapIds = (lastConfirmation.approved_item_ids || []).slice().sort();
    if (currentApproved.length !== snapIds.length) return true;
    return currentApproved.some((id, idx) => id !== snapIds[idx]);
  }, [lastConfirmation, items]);

  const hasDecisions = items.some(i => i.decision_status && i.decision_status !== "needs_review");
  const allNeedsReview = items.every(i => !i.decision_status || i.decision_status === "needs_review");
  const showItemStatus = hasDecisions && !allNeedsReview;

  const selectionSummary = useMemo(() => {
    if (!hasDecisions) return null;
    const statuses = ["approved", "not_now", "needs_review", "request_changes", "reapproval_required"];
    const result = {};
    for (const s of statuses) {
      const si = items.filter(i => (i.decision_status || "needs_review") === s);
      if (si.length > 0) result[s] = { count: si.length, rollup: computeScopePricingRollup(si, laborEstimates) };
    }
    return result;
  }, [items, laborEstimates, hasDecisions]);

  const catRollups = useMemo(() => {
    const m = new Map();
    for (const cat of hierarchy) m.set(cat.id, computeScopePricingRollup(cat.allItems, laborEstimates));
    return m;
  }, [hierarchy, laborEstimates]);

  // Auto-trigger print after render
  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    });
    return () => { cancelled = true; };
  }, []);

  const handlePrint = useCallback(() => window.print(), []);

  const projectName = project?.name || "—";
  const generatedDate = format(new Date(), "MMMM d, yyyy");

  /* ── FONT / SPACING TOKENS ── */
  const T = {
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    brandSize: "8pt",
    docTitleSize: "20pt",
    projectSize: "13pt",
    metaSize: "9pt",
    sectionHeadSize: "11pt",
    catSize: "13pt",
    grpSize: "10.5pt",
    itemTitleSize: "10.5pt",
    bodySize: "9.5pt",
    smallSize: "8pt",
    tinySize: "7pt",
    lineHeight: "1.4",
    colorPrimary: "#111827",
    colorBody: "#374151",
    colorMuted: "#6b7280",
    colorLight: "#9ca3af",
    colorRule: "#d1d5db",
    colorRuleHeavy: "#111827",
    colorAccentBg: "#f8fafc",
    colorNoticeBg: "#f8fafb",
    colorNoticeBorder: "#e2e8f0",
    /* Hierarchy tokens */
    catBandBg: "#1e293b",
    catBandText: "#ffffff",
    catBandMeta: "#94a3b8",
    grpBandBg: "#f1f5f9",
    grpAccent: "#475569",
    grpText: "#1e293b",
    itemIndent: 16,
    itemDivider: "#e5e7eb",
  };

  return (
    <>
      <style>{PRINT_STYLES}</style>

      {/* ── Screen-only toolbar ── */}
      <div className="scope-print-close-bar">
        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>Scope Review — Print Preview</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handlePrint}
            style={{ padding: "6px 18px", background: "#2563eb", color: "white", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Print / Save PDF
          </button>
          <button onClick={onClose}
            style={{ padding: "6px 18px", background: "#334155", color: "#e2e8f0", border: "1px solid #475569", borderRadius: 5, cursor: "pointer", fontSize: 13 }}>
            Close
          </button>
        </div>
      </div>

      {/* ── Running header/footer (print only, position:fixed) ── */}
      <div className="sp-running-header">
        <span>ÄCHTUNG KRAFT</span>
        <span>{projectName} — Scope Review</span>
      </div>
      <div className="sp-running-footer">
        <span>Ächtung Kraft · {projectName} · Scope Review</span>
        <span>Generated {generatedDate}</span>
      </div>

      {/* ════════════════════════════════════════
           DOCUMENT BODY
         ════════════════════════════════════════ */}
      <div id="scope-print-root" ref={printRef} style={{ fontFamily: T.fontFamily, lineHeight: T.lineHeight, color: T.colorPrimary }}>

        {/* ── DRAFT WATERMARK ── */}
        {isDraft && (
          <div style={{
            textAlign: "center", padding: "5px 0", marginBottom: 20,
            background: "#fefce8", border: "1px solid #fde68a", borderRadius: 4,
            fontSize: "8pt", fontWeight: 700, color: "#854d0e", textTransform: "uppercase", letterSpacing: "0.12em",
          }}>
            DRAFT — FOR INTERNAL REVIEW
          </div>
        )}

        {/* ═══════════════════════════════════════
            1 — DOCUMENT HEADER
           ═══════════════════════════════════════ */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: T.brandSize, textTransform: "uppercase", letterSpacing: "0.2em", color: T.colorMuted, fontWeight: 600 }}>
            ÄCHTUNG KRAFT
          </div>
          <h1 style={{ fontSize: T.docTitleSize, fontWeight: 800, margin: "2px 0 6px", color: T.colorPrimary, letterSpacing: "-0.01em" }}>
            PROJECT SCOPE REVIEW
          </h1>
          <div style={{ fontSize: T.projectSize, fontWeight: 700, color: T.colorPrimary, marginBottom: 14 }}>
            {projectName}
          </div>

          <div style={{ borderTop: `2px solid ${T.colorRuleHeavy}`, paddingTop: 10, display: "flex", gap: 40, flexWrap: "wrap" }}>
            {project?.client_name && (
              <div>
                <div style={{ fontSize: T.tinySize, textTransform: "uppercase", letterSpacing: "0.08em", color: T.colorLight, fontWeight: 600 }}>Client</div>
                <div style={{ fontSize: T.metaSize, color: T.colorBody, marginTop: 1 }}>{project.client_name}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: T.tinySize, textTransform: "uppercase", letterSpacing: "0.08em", color: T.colorLight, fontWeight: 600 }}>Prepared</div>
              <div style={{ fontSize: T.metaSize, color: T.colorBody, marginTop: 1 }}>
                {fmtDateShort(request?.posted_at) || fmtDateShort(request?.created_date) || fmtDateShort(new Date())}
              </div>
            </div>
          </div>

          {/* Description */}
          {(request?.body || request?.content_html) && (
            <div style={{ marginTop: 12, fontSize: T.bodySize, color: T.colorBody, lineHeight: "1.45" }}>
              {request.body || request.content_html?.replace(/<[^>]+>/g, "") || ""}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════
            2 — SCOPE ESTIMATE NOTICE
           ═══════════════════════════════════════ */}
        <div className="sp-avoid-break" style={{
          marginBottom: 24, padding: "12px 16px",
          background: T.colorNoticeBg, borderRadius: 4, border: `1px solid ${T.colorNoticeBorder}`,
        }}>
          <div style={{ fontSize: T.smallSize, fontWeight: 700, color: T.colorBody, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            Scope Estimate Notice
          </div>
          <div style={{ fontSize: T.bodySize, color: T.colorBody, lineHeight: "1.5" }}>
            The costs and labor shown in this Scope Review are estimates intended to help define the anticipated scope of work for the project. They are not intended to be all-inclusive or a guarantee of final cost. Actual parts, materials, labor, outside services, and project requirements may be higher or lower as work progresses and additional conditions are discovered. The purpose of this review is to establish which areas Ächtung Kraft should investigate, develop, source, and build as part of the project.
          </div>
          <div style={{ marginTop: 6, fontStyle: "italic", fontSize: T.bodySize, color: T.colorMuted }}>
            Approving an item confirms that it is part of the agreed project scope to pursue; it does not constitute acceptance of a fixed final price.
          </div>
        </div>

        {/* ═══════════════════════════════════════
            3 — SCOPE OVERVIEW
           ═══════════════════════════════════════ */}
        <div className="sp-avoid-break" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: T.sectionHeadSize, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.colorPrimary, borderBottom: `1.5px solid ${T.colorRule}`, paddingBottom: 4, marginBottom: 12 }}>
            Scope Overview
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hierarchy.map((cat, catIdx) => {
              const s = buildCatSummary(catRollups.get(cat.id));
              return (
                <div key={cat.id} className="sp-overview-row" style={{
                  padding: "8px 14px", borderRadius: 3,
                  background: T.catBandBg,
                  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
                  flexWrap: "wrap",
                }}>
                  <div className="sp-cat-title" style={{ fontSize: T.smallSize, fontWeight: 700, textTransform: "uppercase", color: T.catBandText, letterSpacing: "0.04em" }}>
                    {catIdx + 1}. {cat.name}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span className="sp-cat-meta" style={{ fontSize: T.smallSize, color: T.catBandMeta }}>
                      {s.count} item{s.count !== 1 ? "s" : ""}
                    </span>
                    {s.totalLabel && (
                      <span className="sp-cat-title" style={{ fontSize: T.bodySize, fontWeight: 700, color: T.catBandText }}>{s.totalLabel}</span>
                    )}
                    {s.incompleteCount > 0 && !s.totalLabel && (
                      <span className="sp-cat-pending" style={{ fontSize: T.smallSize, color: "#fbbf24" }}>
                        {s.incompleteCount} pending pricing
                      </span>
                    )}
                    {s.hoursLabel && (
                      <span className="sp-cat-meta" style={{ fontSize: T.smallSize, color: T.catBandMeta }}>{s.hoursLabel}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════
            4 — CURRENT SELECTION SUMMARY
           ═══════════════════════════════════════ */}
        {selectionSummary && showItemStatus && (
          <div className="sp-avoid-break" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: T.sectionHeadSize, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.colorPrimary, borderBottom: `1.5px solid ${T.colorRule}`, paddingBottom: 4, marginBottom: 12 }}>
              Current Selection
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["approved", "not_now", "needs_review", "request_changes", "reapproval_required"].map(status => {
                const entry = selectionSummary[status];
                if (!entry) return null;
                const r = entry.rollup;
                const hoursLabel = formatHoursRange(r.ak_hours_min, r.ak_hours_max);
                const c = DECISION_BADGE_STYLES[status];
                let dollarLabel = null;
                if (r.classified_count > 0 && r.legacy_count === 0 && !r.has_incomplete && r.hard_cost_tbd_count === 0) {
                  dollarLabel = formatDollarRange(r.total_estimate_min, r.total_estimate_max);
                } else if (r.legacy_count > 0 && r.classified_count === 0) {
                  dollarLabel = formatDollarRange(r.legacy_budget_min, r.legacy_budget_max);
                }
                return (
                  <div key={status} style={{
                    padding: "8px 14px", borderRadius: 4, border: `1px solid ${c.border}`,
                    background: c.bg, minWidth: 130,
                  }}>
                    <div style={{ fontSize: T.tinySize, fontWeight: 700, textTransform: "uppercase", color: c.color, letterSpacing: "0.04em" }}>
                      {DECISION_LABELS[status]}
                    </div>
                    <div style={{ fontSize: "12pt", fontWeight: 700, color: T.colorPrimary, marginTop: 2 }}>
                      {entry.count} item{entry.count !== 1 ? "s" : ""}
                    </div>
                    {dollarLabel && <div style={{ fontSize: T.bodySize, color: T.colorBody }}>{dollarLabel}</div>}
                    {hoursLabel && <div style={{ fontSize: T.smallSize, color: T.colorMuted }}>{hoursLabel}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            5 — CATEGORY → GROUP → ITEM
           ═══════════════════════════════════════ */}
        {hierarchy.map((cat, catIdx) => {
          const catSummary = buildCatSummary(catRollups.get(cat.id));
          return (
            <div key={cat.id}>
              {/* Page break before 2nd+ categories */}
              {catIdx > 0 && <div className="sp-page-break" />}

              {/* ── CATEGORY BAND — dark full-width header ── */}
              <div className="sp-avoid-break sp-keep-with-next sp-cat-band" style={{
                marginTop: catIdx > 0 ? 0 : 12,
                marginBottom: 16,
                background: T.catBandBg,
                padding: "12px 16px",
                borderRadius: 3,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <h2 className="sp-cat-title" style={{
                    fontSize: T.catSize, fontWeight: 800, textTransform: "uppercase",
                    color: T.catBandText, margin: 0, letterSpacing: "0.03em",
                  }}>
                    {catIdx + 1}{"\u2003"}{cat.name}
                  </h2>
                  <span className="sp-cat-meta" style={{ fontSize: T.smallSize, fontWeight: 600, color: T.catBandMeta, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {catSummary.count} item{catSummary.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="sp-cat-meta" style={{ fontSize: T.smallSize, color: T.catBandMeta, marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
                  {catSummary.incompleteCount > 0 && (
                    <span className="sp-cat-pending" style={{ color: "#fbbf24" }}>
                      {catSummary.incompleteCount} item{catSummary.incompleteCount > 1 ? "s" : ""} pending final pricing
                    </span>
                  )}
                  {catSummary.incompleteCount > 0 && catSummary.hoursLabel && (
                    <span style={{ color: T.catBandMeta }}>·</span>
                  )}
                  {catSummary.hoursLabel && (
                    <span>{catSummary.hoursLabel}</span>
                  )}
                </div>
              </div>

              {/* ── Groups ── */}
              {cat.groups.map((grp, grpIdx) => {
                const grpRollup = computeScopePricingRollup(grp.items, laborEstimates);
                const gs = buildCatSummary(grpRollup);
                return (
                  <div key={grp.id} style={{ marginBottom: 22 }}>
                    {/* GROUP BAND — light subsection with left accent */}
                    <div className="sp-avoid-break sp-keep-with-next sp-grp-band" style={{
                      marginTop: grpIdx > 0 ? 18 : 0,
                      background: T.grpBandBg,
                      borderLeft: `3px solid ${T.grpAccent}`,
                      padding: "7px 12px",
                      borderRadius: "0 3px 3px 0",
                      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
                      marginBottom: 10,
                    }}>
                      <h3 style={{ fontSize: T.grpSize, fontWeight: 700, textTransform: "uppercase", color: T.grpText, margin: 0, letterSpacing: "0.02em" }}>
                        {catIdx + 1}.{grpIdx + 1}{"\u2003"}{grp.name}
                      </h3>
                      <span style={{ fontSize: T.smallSize, color: T.colorMuted, whiteSpace: "nowrap" }}>
                        {gs.count} item{gs.count !== 1 ? "s" : ""}
                        {gs.totalLabel && <> · {gs.totalLabel}</>}
                      </span>
                    </div>

                    {/* ── Items — indented under group ── */}
                    <div style={{ paddingLeft: T.itemIndent }}>
                      {grp.items.map((item, itemIdx) => {
                        const num = `${catIdx + 1}.${grpIdx + 1}.${itemIdx + 1}`;
                        const pricing = computeScopeItemPricing(item, laborByItem.get(item.id) || []);
                        const status = item.decision_status || "needs_review";
                        const isLast = itemIdx === grp.items.length - 1;

                        return (
                          <div key={item.id} className="sp-avoid-break" style={{
                            padding: "8px 0 10px",
                            borderBottom: isLast ? "none" : `1px solid ${T.itemDivider}`,
                          }}>
                            {/* Item title row — muted number, bold title */}
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: T.itemTitleSize, fontWeight: 700, color: T.colorPrimary }}>
                                  <span style={{ color: T.colorLight, fontWeight: 400, fontSize: T.bodySize }}>{num}</span>
                                  {"\u2003"}{item.title}
                                </div>
                              </div>
                              {showItemStatus && <StatusBadge status={status} />}
                            </div>

                            {/* Pricing */}
                            <ItemPricing pricing={pricing} T={T} />

                            {/* Description */}
                            {item.description && (
                              <div style={{ marginTop: 8, fontSize: T.bodySize, color: T.colorBody, lineHeight: "1.45", whiteSpace: "pre-wrap" }}>
                                {item.description}
                              </div>
                            )}

                            {/* Client-facing notes */}
                            {item.budget_note && (
                              <div style={{ marginTop: 5, fontStyle: "italic", fontSize: T.bodySize, color: T.colorMuted }}>
                                {item.budget_note}
                              </div>
                            )}
                            {item.hard_cost_note && !item.budget_note && (
                              <div style={{ marginTop: 5, fontStyle: "italic", fontSize: T.bodySize, color: T.colorMuted }}>
                                {item.hard_cost_note}
                              </div>
                            )}

                            {/* Images */}
                            <ItemImages images={item.images} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* ═══════════════════════════════════════
            6 — ESTIMATE REMINDER
           ═══════════════════════════════════════ */}
        <div style={{
          marginTop: 28, padding: "10px 16px",
          background: T.colorNoticeBg, border: `1px solid ${T.colorNoticeBorder}`, borderRadius: 4,
          fontSize: T.bodySize, color: T.colorMuted, lineHeight: "1.45", fontStyle: "italic",
        }}>
          Estimates shown are planning estimates, not fixed-price quotations. Actual project costs may be higher or lower as work is investigated, developed, sourced, and completed.
        </div>

        {/* ═══════════════════════════════════════
            7 — CONFIRMATION SECTION
           ═══════════════════════════════════════ */}
        {lastConfirmation && (
          <div style={{ marginTop: 28 }}>
            <div className="sp-avoid-break">
              <div style={{ fontSize: T.sectionHeadSize, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.colorPrimary, borderBottom: `1.5px solid ${T.colorRule}`, paddingBottom: 4, marginBottom: 12 }}>
                Last Confirmed Scope
              </div>

              {isConfStale && (
                <div style={{
                  padding: "8px 14px", background: "#fefce8", border: "1px solid #fde68a",
                  borderRadius: 4, marginBottom: 12, fontSize: T.bodySize, color: "#854d0e",
                }}>
                  <strong>Current scope has changed since last confirmation.</strong><br />
                  The selections shown above differ from the scope confirmed on {fmtDate(lastConfirmation.confirmed_at)}.
                </div>
              )}

              <div style={{ fontSize: T.bodySize, color: T.colorBody, lineHeight: "1.6" }}>
                <div>Confirmed: <strong>{fmtDate(lastConfirmation.confirmed_at)}</strong></div>
                {lastConfirmation.confirmed_by_name && <div>By: {lastConfirmation.confirmed_by_name}</div>}
                {lastConfirmation.revision > 1 && <div>Revision: {lastConfirmation.revision}</div>}
              </div>

              {lastConfirmation.summary_snapshot && (
                <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {lastConfirmation.summary_snapshot.approved_item_count != null && (
                    <ConfirmationBlock
                      label="Approved" color="#166534" T={T}
                      count={lastConfirmation.summary_snapshot.approved_item_count}
                      dollars={formatDollarRange(lastConfirmation.summary_snapshot.approved_total_estimate_min, lastConfirmation.summary_snapshot.approved_total_estimate_max)}
                      hours={formatHoursRange(lastConfirmation.summary_snapshot.approved_ak_hours_min, lastConfirmation.summary_snapshot.approved_ak_hours_max)}
                    />
                  )}
                  {lastConfirmation.summary_snapshot.not_now_item_count > 0 && (
                    <ConfirmationBlock
                      label="Not Now" color="#6b7280" T={T}
                      count={lastConfirmation.summary_snapshot.not_now_item_count}
                      dollars={formatDollarRange(lastConfirmation.summary_snapshot.not_now_total_estimate_min, lastConfirmation.summary_snapshot.not_now_total_estimate_max)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            8 — DOCUMENT FOOTER
           ═══════════════════════════════════════ */}
        <div style={{
          marginTop: 36, paddingTop: 10, borderTop: `1px solid ${T.colorRule}`,
          fontSize: T.smallSize, color: T.colorLight, display: "flex", justifyContent: "space-between",
        }}>
          <span>Ächtung Kraft · {projectName} — Scope Review</span>
          <span>Generated {generatedDate}</span>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════
   Item Pricing — clear hierarchy
   ══════════════════════════════════════════════ */

function ItemPricing({ pricing, T }) {
  const { pricing_model, total_estimate_min, total_estimate_max, estimate_complete,
    hard_cost_min, hard_cost_max, hard_cost_tbd,
    ak_labor_min, ak_labor_max, ak_hours_min, ak_hours_max, labor_estimated,
    legacy_budget_min, legacy_budget_max, legacy_budget_tbd } = pricing;

  if (pricing_model === "legacy_estimate") {
    const budgetLabel = legacy_budget_tbd ? "TBD" : formatDollarRange(legacy_budget_min, legacy_budget_max);
    const hoursLabel = formatHoursRange(ak_hours_min, ak_hours_max);
    return (
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginTop: 6 }}>
        {budgetLabel && (
          <div>
            <div style={{ fontSize: T.tinySize, textTransform: "uppercase", letterSpacing: "0.06em", color: T.colorLight, fontWeight: 600 }}>Estimate</div>
            <div style={{ fontSize: "12pt", fontWeight: 700, color: T.colorPrimary }}>{budgetLabel}</div>
          </div>
        )}
        {hoursLabel && (
          <div>
            <div style={{ fontSize: T.tinySize, textTransform: "uppercase", letterSpacing: "0.06em", color: T.colorLight, fontWeight: 600 }}>AK Hours</div>
            <div style={{ fontSize: T.bodySize, fontWeight: 600, color: T.colorBody }}>{hoursLabel}</div>
          </div>
        )}
      </div>
    );
  }

  const totalLabel = estimate_complete ? formatDollarRange(total_estimate_min, total_estimate_max) : null;
  const hcLabel = hard_cost_tbd ? "TBD" : formatDollarRange(hard_cost_min, hard_cost_max);
  const laborLabel = labor_estimated ? formatDollarRange(ak_labor_min, ak_labor_max) : null;
  const hoursLabel = formatHoursRange(ak_hours_min, ak_hours_max);

  return (
    <div style={{ marginTop: 6 }}>
      {/* Primary row: Total Estimate + AK Hours */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {totalLabel && (
          <div>
            <div style={{ fontSize: T.tinySize, textTransform: "uppercase", letterSpacing: "0.06em", color: T.colorLight, fontWeight: 600 }}>Total Estimate</div>
            <div style={{ fontSize: "12pt", fontWeight: 700, color: T.colorPrimary }}>{totalLabel}</div>
          </div>
        )}
        {hoursLabel && (
          <div>
            <div style={{ fontSize: T.tinySize, textTransform: "uppercase", letterSpacing: "0.06em", color: T.colorLight, fontWeight: 600 }}>AK Hours</div>
            <div style={{ fontSize: T.bodySize, fontWeight: 600, color: T.colorBody }}>{hoursLabel}</div>
          </div>
        )}
      </div>
      {/* Secondary row: Hard Cost · AK Labor */}
      {(hcLabel || laborLabel) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3, fontSize: T.smallSize, color: T.colorMuted }}>
          {hcLabel && <span>Hard Cost {hcLabel}</span>}
          {hcLabel && laborLabel && <span style={{ color: T.colorLight }}>·</span>}
          {laborLabel && <span>AK Labor {laborLabel}</span>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   Confirmation snapshot block
   ══════════════════════════════════════════════ */

function ConfirmationBlock({ label, color, count, dollars, hours, T }) {
  return (
    <div>
      <div style={{ fontSize: T.tinySize, textTransform: "uppercase", letterSpacing: "0.06em", color: T.colorLight, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "12pt", fontWeight: 700, color }}>{count} items</div>
      {dollars && <div style={{ fontSize: T.bodySize, color: T.colorBody }}>{dollars}</div>}
      {hours && <div style={{ fontSize: T.smallSize, color: T.colorMuted }}>{hours}</div>}
    </div>
  );
}