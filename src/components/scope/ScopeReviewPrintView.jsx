import React, { useMemo, useEffect, useRef } from "react";
import { format } from "date-fns";
import { buildScopeHierarchy, DECISION_LABELS, formatHoursRange } from "./scopeHelpers";
import {
  computeScopeItemPricing,
  computeScopePricingRollup,
  formatDollarRange,
} from "./scopePricingHelpers";

/* ──────────────────────────────────────────────
   Utility: format helpers for print
   ────────────────────────────────────────────── */

const fmtDate = (d) => {
  if (!d) return null;
  try { return format(new Date(d), "MMMM d, yyyy"); } catch { return d; }
};

const PRINT_DECISION_COLORS = {
  approved: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
  not_now: { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" },
  needs_review: { bg: "#fefce8", text: "#854d0e", border: "#fde68a" },
  request_changes: { bg: "#fff7ed", text: "#9a3412", border: "#fdba74" },
  reapproval_required: { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
};

/* ──────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────── */

function PrintBadge({ status }) {
  const c = PRINT_DECISION_COLORS[status] || PRINT_DECISION_COLORS.needs_review;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.05em",
      backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {DECISION_LABELS[status] || status}
    </span>
  );
}

function PrintItemImages({ images }) {
  if (!images || images.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {images.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          style={{
            width: images.length === 1 ? 200 : images.length === 2 ? 160 : 120,
            height: "auto",
            maxHeight: 140,
            objectFit: "cover",
            borderRadius: 4,
            border: "1px solid #e5e7eb",
          }}
        />
      ))}
    </div>
  );
}

function PricingBlock({ pricing }) {
  const { pricing_model, total_estimate_min, total_estimate_max, estimate_complete,
    hard_cost_min, hard_cost_max, hard_cost_tbd, hard_cost_note,
    ak_labor_min, ak_labor_max, ak_hours_min, ak_hours_max, labor_estimated,
    legacy_budget_min, legacy_budget_max, legacy_budget_tbd } = pricing;

  if (pricing_model === "legacy_estimate") {
    const budgetLabel = legacy_budget_tbd ? "TBD" : formatDollarRange(legacy_budget_min, legacy_budget_max);
    const hoursLabel = formatHoursRange(ak_hours_min, ak_hours_max);
    return (
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 6 }}>
        {budgetLabel && <PricingPill label="Estimate" value={budgetLabel} primary />}
        {hoursLabel && <PricingPill label="AK Hours" value={hoursLabel} />}
      </div>
    );
  }

  const totalLabel = estimate_complete
    ? formatDollarRange(total_estimate_min, total_estimate_max)
    : null;
  const hcLabel = hard_cost_tbd ? "TBD" : formatDollarRange(hard_cost_min, hard_cost_max);
  const laborLabel = labor_estimated ? formatDollarRange(ak_labor_min, ak_labor_max) : null;
  const hoursLabel = formatHoursRange(ak_hours_min, ak_hours_max);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {totalLabel && <PricingPill label="Total Estimate" value={totalLabel} primary />}
        {hoursLabel && <PricingPill label="AK Hours" value={hoursLabel} />}
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 4 }}>
        {hcLabel && <PricingPill label="Hard Cost" value={hcLabel} secondary />}
        {laborLabel && <PricingPill label="AK Labor" value={laborLabel} secondary />}
      </div>
    </div>
  );
}

function PricingPill({ label, value, primary, secondary }) {
  return (
    <div>
      <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af" }}>{label}</div>
      <div style={{
        fontSize: primary ? 14 : secondary ? 11 : 12,
        fontWeight: primary ? 700 : 500,
        color: primary ? "#111827" : "#374151",
      }}>{value}</div>
    </div>
  );
}

function CategoryRollupLine({ rollup }) {
  const { count, total_estimate_min, total_estimate_max, has_incomplete, hard_cost_tbd_count,
    ak_hours_min, ak_hours_max, legacy_count, classified_count,
    legacy_budget_min, legacy_budget_max, legacy_budget_tbd_count } = rollup;

  const hoursLabel = formatHoursRange(ak_hours_min, ak_hours_max);
  const incompleteCount = (has_incomplete ? 1 : 0) + hard_cost_tbd_count + legacy_budget_tbd_count;

  // Determine the total line
  let totalLabel = null;
  if (classified_count > 0 && legacy_count === 0 && !has_incomplete && hard_cost_tbd_count === 0) {
    totalLabel = formatDollarRange(total_estimate_min, total_estimate_max);
  } else if (legacy_count > 0 && classified_count === 0 && legacy_budget_tbd_count === 0) {
    totalLabel = formatDollarRange(legacy_budget_min, legacy_budget_max);
  }

  return (
    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
      {count} item{count !== 1 ? "s" : ""}
      {totalLabel && <> · <span style={{ fontWeight: 600, color: "#374151" }}>{totalLabel}</span> estimated</>}
      {incompleteCount > 0 && !totalLabel && <> · {incompleteCount} item{incompleteCount > 1 ? "s" : ""} pending final pricing</>}
      {hoursLabel && <> · {hoursLabel.replace(/ hrs$/, "")} AK hrs</>}
    </div>
  );
}

/* ──────────────────────────────────────────────
   MAIN PRINT VIEW
   ────────────────────────────────────────────── */

export default function ScopeReviewPrintView({
  request,
  project,
  categories,
  groups,
  items,
  laborEstimates,
  confirmations,
  onClose,
}) {
  const printRef = useRef(null);

  // Build hierarchy
  const hierarchy = useMemo(() => buildScopeHierarchy(categories, groups, items), [categories, groups, items]);

  // Pricing helpers: per-item lookup
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

  // Determine if confirmation is stale
  const isConfStale = useMemo(() => {
    if (!lastConfirmation) return false;
    const currentApproved = items.filter(i => i.decision_status === "approved").map(i => i.id).sort();
    const snapIds = (lastConfirmation.approved_item_ids || []).slice().sort();
    if (currentApproved.length !== snapIds.length) return true;
    return currentApproved.some((id, idx) => id !== snapIds[idx]);
  }, [lastConfirmation, items]);

  // Statuses
  const hasDecisions = items.some(i => i.decision_status && i.decision_status !== "needs_review");
  const allNeedsReview = items.every(i => !i.decision_status || i.decision_status === "needs_review");

  // Selection summary
  const selectionSummary = useMemo(() => {
    if (!hasDecisions) return null;
    const statuses = ["approved", "not_now", "needs_review", "request_changes", "reapproval_required"];
    const result = {};
    for (const s of statuses) {
      const si = items.filter(i => (i.decision_status || "needs_review") === s);
      if (si.length > 0) {
        result[s] = { count: si.length, rollup: computeScopePricingRollup(si, laborEstimates) };
      }
    }
    return result;
  }, [items, laborEstimates, hasDecisions]);

  // Category rollups
  const catRollups = useMemo(() => {
    const m = new Map();
    for (const cat of hierarchy) {
      m.set(cat.id, computeScopePricingRollup(cat.allItems, laborEstimates));
    }
    return m;
  }, [hierarchy, laborEstimates]);

  // Auto-trigger print
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Item number generator
  let globalItemCounter = 0;
  const getItemNumber = (catIdx, grpIdx, itemIdx) => `${catIdx + 1}.${grpIdx + 1}.${itemIdx + 1}`;

  return (
    <>
      {/* Print-only CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #scope-print-root, #scope-print-root * { visibility: visible !important; }
          #scope-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }
          @page {
            margin: 0.6in 0.65in 0.75in 0.65in;
            size: letter;
          }
          .print-page-break { page-break-before: always; }
          .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .print-footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 0 0.65in 0.35in; }
        }

        @media screen {
          #scope-print-root {
            max-width: 850px;
            margin: 0 auto;
            padding: 40px 32px;
            background: white;
            color: #111;
            min-height: 100vh;
          }
          .print-close-bar {
            position: sticky;
            top: 0;
            z-index: 100;
            background: #1f2937;
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #374151;
          }
        }
      `}</style>

      {/* Screen-only close bar */}
      <div className="print-close-bar" style={{ display: "flex" }}>
        <span style={{ color: "#e5e7eb", fontSize: 14, fontWeight: 600 }}>Scope Review — Print Preview</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ padding: "6px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Print / Save PDF
          </button>
          <button
            onClick={onClose}
            style={{ padding: "6px 16px", background: "#374151", color: "#e5e7eb", border: "1px solid #4b5563", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            Close
          </button>
        </div>
      </div>

      <div id="scope-print-root" ref={printRef} style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", lineHeight: 1.5 }}>

        {/* ── DRAFT WATERMARK ── */}
        {isDraft && (
          <div style={{
            textAlign: "center", padding: "6px 0", marginBottom: 16,
            background: "#fefce8", border: "1px solid #fde68a", borderRadius: 6,
            fontSize: 11, fontWeight: 700, color: "#854d0e", textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            DRAFT — FOR REVIEW
          </div>
        )}

        {/* ── DOCUMENT HEADER ── */}
        <div style={{ borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "#6b7280", fontWeight: 600 }}>
            ÄCHTUNG KRAFT
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 8px", color: "#111" }}>
            PROJECT SCOPE REVIEW
          </h1>
          <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.7 }}>
            {project?.client_name && <div><span style={{ color: "#9ca3af" }}>Client:</span> {project.client_name}</div>}
            <div><span style={{ color: "#9ca3af" }}>Project:</span> {project?.name || "—"}</div>
            <div><span style={{ color: "#9ca3af" }}>Scope Review:</span> {request?.title || "—"}</div>
            <div><span style={{ color: "#9ca3af" }}>Date:</span> {fmtDate(request?.posted_at) || fmtDate(request?.created_date) || fmtDate(new Date())}</div>
          </div>
        </div>

        {/* ── REQUEST DESCRIPTION ── */}
        {(request?.body || request?.content_html) && (
          <div style={{ marginBottom: 20, padding: "10px 14px", background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>
              Description
            </div>
            <div style={{ fontSize: 11, color: "#374151" }}>
              {request.body || request.content_html?.replace(/<[^>]+>/g, "") || ""}
            </div>
          </div>
        )}

        {/* ── SCOPE ESTIMATE NOTICE ── */}
        <div style={{
          marginBottom: 24, padding: "10px 14px", background: "#f0fdf4", borderRadius: 6,
          border: "1px solid #bbf7d0", fontSize: 9.5, color: "#374151", lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, fontSize: 10, color: "#166534", marginBottom: 4 }}>Scope Estimate Notice</div>
          The costs and labor shown in this Scope Review are estimates intended to help define the anticipated scope of work for the project. They are not intended to be all-inclusive or a guarantee of final cost. Actual parts, materials, labor, outside services, and project requirements may be higher or lower as work progresses and additional conditions are discovered. The purpose of this review is to establish which areas Ächtung Kraft should investigate, develop, source, and build as part of the project.
          <div style={{ marginTop: 6, fontStyle: "italic" }}>
            Approving an item confirms that it is part of the agreed project scope to pursue; it does not constitute acceptance of a fixed final price.
          </div>
        </div>

        {/* ── SCOPE OVERVIEW ── */}
        <div className="print-avoid-break" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#111", borderBottom: "1px solid #d1d5db", paddingBottom: 4, marginBottom: 10 }}>
            Scope Overview
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hierarchy.map((cat, catIdx) => {
              const rollup = catRollups.get(cat.id);
              return (
                <div key={cat.id} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#111", minWidth: 180 }}>
                    {catIdx + 1}. {cat.name}
                  </div>
                  <CategoryRollupLine rollup={rollup} />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CURRENT SELECTION SUMMARY ── */}
        {selectionSummary && hasDecisions && !allNeedsReview && (
          <div className="print-avoid-break" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#111", borderBottom: "1px solid #d1d5db", paddingBottom: 4, marginBottom: 10 }}>
              Current Selection
            </h2>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {["approved", "not_now", "needs_review", "request_changes", "reapproval_required"].map(status => {
                const entry = selectionSummary[status];
                if (!entry) return null;
                const r = entry.rollup;
                const hoursLabel = formatHoursRange(r.ak_hours_min, r.ak_hours_max);
                const c = PRINT_DECISION_COLORS[status];
                let dollarLabel = null;
                if (r.classified_count > 0 && r.legacy_count === 0 && !r.has_incomplete && r.hard_cost_tbd_count === 0) {
                  dollarLabel = formatDollarRange(r.total_estimate_min, r.total_estimate_max);
                } else if (r.legacy_count > 0 && r.classified_count === 0) {
                  dollarLabel = formatDollarRange(r.legacy_budget_min, r.legacy_budget_max);
                }
                return (
                  <div key={status} style={{
                    padding: "8px 14px", borderRadius: 6, border: `1px solid ${c.border}`,
                    background: c.bg, minWidth: 140,
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: c.text, letterSpacing: "0.05em" }}>
                      {DECISION_LABELS[status]}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginTop: 2 }}>
                      {entry.count} item{entry.count !== 1 ? "s" : ""}
                    </div>
                    {dollarLabel && <div style={{ fontSize: 11, color: "#374151" }}>{dollarLabel}</div>}
                    {hoursLabel && <div style={{ fontSize: 10, color: "#6b7280" }}>{hoursLabel.replace(/ hrs$/, "")} AK hrs</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CATEGORY → GROUP → ITEM HIERARCHY ── */}
        {hierarchy.map((cat, catIdx) => {
          const catRollup = catRollups.get(cat.id);
          return (
            <div key={cat.id} style={{ marginBottom: 0 }}>
              {/* Category page break for second+ categories */}
              {catIdx > 0 && <div className="print-page-break" />}

              {/* Category Header */}
              <div className="print-avoid-break" style={{
                borderBottom: "2px solid #111", paddingBottom: 6, marginBottom: 14,
                marginTop: catIdx > 0 ? 0 : 0,
              }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", color: "#111", margin: 0 }}>
                  {catIdx + 1}. {cat.name}
                </h2>
                <CategoryRollupLine rollup={catRollup} />
              </div>

              {/* Groups */}
              {cat.groups.map((grp, grpIdx) => (
                <div key={grp.id} style={{ marginBottom: 16 }}>
                  {/* Group Header */}
                  <div className="print-avoid-break" style={{
                    borderBottom: "1px solid #d1d5db", paddingBottom: 4, marginBottom: 10,
                  }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#374151", margin: 0 }}>
                      {catIdx + 1}.{grpIdx + 1} {grp.name}
                    </h3>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      {grp.items.length} item{grp.items.length !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Items */}
                  {grp.items.map((item, itemIdx) => {
                    const itemNumber = getItemNumber(catIdx, grpIdx, itemIdx);
                    const pricing = computeScopeItemPricing(item, laborByItem.get(item.id) || []);
                    const showStatus = !allNeedsReview && hasDecisions;
                    const status = item.decision_status || "needs_review";

                    return (
                      <div key={item.id} className="print-avoid-break" style={{
                        padding: "10px 14px", marginBottom: 10, borderRadius: 6,
                        border: "1px solid #e5e7eb", background: "#fafafa",
                      }}>
                        {/* Item header */}
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>Item {itemNumber}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginTop: 1 }}>
                              {item.title}
                            </div>
                          </div>
                          {showStatus && <PrintBadge status={status} />}
                        </div>

                        {/* Pricing */}
                        <PricingBlock pricing={pricing} />

                        {/* Description */}
                        {item.description && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>
                              Description
                            </div>
                            <div style={{ fontSize: 10, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                              {item.description}
                            </div>
                          </div>
                        )}

                        {/* Client-facing note */}
                        {item.budget_note && (
                          <div style={{ marginTop: 6, fontStyle: "italic", fontSize: 10, color: "#6b7280" }}>
                            {item.budget_note}
                          </div>
                        )}
                        {item.hard_cost_note && (
                          <div style={{ marginTop: 6, fontStyle: "italic", fontSize: 10, color: "#6b7280" }}>
                            {item.hard_cost_note}
                          </div>
                        )}

                        {/* Images */}
                        <PrintItemImages images={item.images} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}

        {/* ── CONFIRMATION SECTION ── */}
        {lastConfirmation && (
          <>
            <div className="print-page-break" />
            <div className="print-avoid-break" style={{ marginTop: 0 }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", color: "#111", borderBottom: "2px solid #111", paddingBottom: 4, marginBottom: 12 }}>
                Scope Confirmation
              </h2>

              {isConfStale && (
                <div style={{
                  padding: "8px 12px", background: "#fefce8", border: "1px solid #fde68a",
                  borderRadius: 6, marginBottom: 12, fontSize: 10, color: "#854d0e",
                }}>
                  <strong>Current scope has changed since last confirmation.</strong><br />
                  The selections shown in this document differ from the scope confirmed on {fmtDate(lastConfirmation.confirmed_at)}.
                </div>
              )}

              <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#166534", marginBottom: 4 }}>
                  Last Confirmed Scope
                </div>
                <div style={{ fontSize: 11, color: "#374151" }}>
                  <div>Confirmed: {fmtDate(lastConfirmation.confirmed_at)}</div>
                  {lastConfirmation.confirmed_by_name && <div>By: {lastConfirmation.confirmed_by_name}</div>}
                  {lastConfirmation.revision > 1 && <div>Revision: {lastConfirmation.revision}</div>}
                </div>

                {/* Historical snapshot values */}
                {lastConfirmation.summary_snapshot && (
                  <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {lastConfirmation.summary_snapshot.approved_item_count != null && (
                      <div>
                        <div style={{ fontSize: 8, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600 }}>Approved</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
                          {lastConfirmation.summary_snapshot.approved_item_count} items
                        </div>
                        {lastConfirmation.summary_snapshot.approved_total_estimate_min != null && (
                          <div style={{ fontSize: 10, color: "#374151" }}>
                            {formatDollarRange(lastConfirmation.summary_snapshot.approved_total_estimate_min, lastConfirmation.summary_snapshot.approved_total_estimate_max)}
                          </div>
                        )}
                        {(lastConfirmation.summary_snapshot.approved_ak_hours_min > 0 || lastConfirmation.summary_snapshot.approved_ak_hours_max > 0) && (
                          <div style={{ fontSize: 10, color: "#6b7280" }}>
                            {formatHoursRange(lastConfirmation.summary_snapshot.approved_ak_hours_min, lastConfirmation.summary_snapshot.approved_ak_hours_max)?.replace(/ hrs$/, "")} AK hrs
                          </div>
                        )}
                      </div>
                    )}
                    {lastConfirmation.summary_snapshot.not_now_item_count > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600 }}>Not Now</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>
                          {lastConfirmation.summary_snapshot.not_now_item_count} items
                        </div>
                        {lastConfirmation.summary_snapshot.not_now_total_estimate_min != null && (
                          <div style={{ fontSize: 10, color: "#374151" }}>
                            {formatDollarRange(lastConfirmation.summary_snapshot.not_now_total_estimate_min, lastConfirmation.summary_snapshot.not_now_total_estimate_max)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── GENERATED FOOTER ── */}
        <div style={{
          marginTop: 32, paddingTop: 12, borderTop: "1px solid #d1d5db",
          fontSize: 9, color: "#9ca3af", display: "flex", justifyContent: "space-between",
        }}>
          <span>Ächtung Kraft · {project?.name} — Scope Review</span>
          <span>Generated {format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</span>
        </div>
      </div>
    </>
  );
}