/**
 * previewResponseAdapter — Canonical preview response normalizer
 * 
 * Standardizes ALL preview/dry-run responses into a single schema
 * so modal UI code never accesses raw backend shapes directly.
 * 
 * SCHEMA:
 * {
 *   canProceed: boolean,
 *   current:  { qty, cost_total, retail_total },
 *   proposed: { qty, cost_total, retail_total },
 *   delta:    { qty, cost_total, retail_total, margin },
 *   meta:     { warnings: string[] }
 * }
 */

const EMPTY_BUCKET = { qty: 0, cost_total: 0, retail_total: 0 };

const EMPTY_PREVIEW = {
  canProceed: false,
  current: { ...EMPTY_BUCKET },
  proposed: { ...EMPTY_BUCKET },
  delta: { qty: 0, cost_total: 0, retail_total: 0, margin: 0 },
  meta: { warnings: [] },
};

/**
 * normalizePreviewResponse(data)
 * 
 * Accepts any backend preview/dry-run response shape and returns the canonical schema.
 * Handles:
 *   - executeSupplyAction dry_run responses (data.preview.*)
 *   - Legacy shapes (old_qty, new_qty, financialImpact.*)
 *   - Raw { old_required, new_required, delta } shapes
 *   - Empty / null input (returns safe defaults)
 */
export function normalizePreviewResponse(data) {
  if (!data) return { ...EMPTY_PREVIEW };

  // Extract the preview payload — backend may nest under .preview or return flat
  const p = data.preview || data;

  // ── Resolve quantities ──
  const currentQty = p.old_required ?? p.old_qty ?? p.current?.required_total ?? p.current?.qty ?? 0;
  const proposedQty = p.new_required ?? p.new_qty ?? p.proposed?.required_total ?? p.proposed?.qty ?? 0;
  const deltaQty = p.delta ?? (proposedQty - currentQty);

  // ── Resolve financials ──
  const currentCost = p.current?.cost_total ?? p.current_cost_total ?? 0;
  const currentRetail = p.current?.retail_total ?? p.current_retail_total ?? 0;
  const proposedCost = p.proposed?.cost_total ?? p.proposed_cost_total ?? 0;
  const proposedRetail = p.proposed?.retail_total ?? p.proposed_retail_total ?? 0;

  const deltaCost = p.financialImpact?.cost_delta ?? p.delta_cost ?? (proposedCost - currentCost);
  const deltaRetail = p.financialImpact?.retail_delta ?? p.delta_retail ?? (proposedRetail - currentRetail);
  const deltaMargin = p.financialImpact?.margin_impact ?? p.delta_margin ?? (deltaRetail - deltaCost);

  // ── Resolve proceed gate ──
  // canProceed: explicit field, or true if there's an actual qty change, or fallback
  const canProceed = p.canProceed ?? p.can_proceed ?? (deltaQty !== 0);

  // ── Warnings ──
  const warnings = p.warnings || p.meta?.warnings || [];
  if (p.blockingIssues?.length) {
    warnings.push(...p.blockingIssues);
  }
  if (p.coverage_status && p.to_order > 0) {
    warnings.push(`${p.to_order} unit(s) still need ordering`);
  }

  return {
    canProceed,
    current: { qty: currentQty, cost_total: currentCost, retail_total: currentRetail },
    proposed: { qty: proposedQty, cost_total: proposedCost, retail_total: proposedRetail },
    delta: { qty: deltaQty, cost_total: deltaCost, retail_total: deltaRetail, margin: deltaMargin },
    meta: { warnings },
  };
}

export { EMPTY_PREVIEW };