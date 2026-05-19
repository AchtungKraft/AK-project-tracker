/**
 * canonicalSupplyMath.js — SINGLE SOURCE OF TRUTH for supply quantity formulas
 * 
 * ALL read models (backend + frontend) MUST use these exact formulas.
 * NO inline re-derivation allowed anywhere.
 * 
 * Backend functions inline these same formulas (Deno can't share imports).
 * This file is the canonical reference AND the frontend import target.
 * 
 * CANONICAL FIELDS (inputs):
 *   required_total, qty_removed, reserved_from_stock, covered_from_po, qty_installed
 * 
 * DERIVED OUTPUTS:
 *   effective_required, to_order, available_to_install, coverage_total, is_satisfied
 */

/**
 * Read canonical quantities from a commitment record.
 * Normalizes legacy field names to canonical ones.
 */
export function readCanonicalQty(c) {
  const required_total = c.required_total ?? 0;
  const qty_removed = c.qty_removed ?? 0;
  const effective_required = Math.max(0, required_total - qty_removed);
  const reserved_from_stock = c.reserved_from_stock ?? 0;
  const covered_from_po = c.covered_from_po ?? 0;
  const qty_installed = c.qty_installed ?? 0;

  const coverage_total = reserved_from_stock + covered_from_po + qty_installed;
  const to_order = Math.max(0, effective_required - coverage_total);
  const available_to_install = Math.max(0, Math.min(
    reserved_from_stock + covered_from_po - qty_installed,
    effective_required - qty_installed
  ));
  const is_satisfied = coverage_total >= effective_required && effective_required > 0;

  return {
    required_total,
    qty_removed,
    effective_required,
    reserved_from_stock,
    covered_from_po,
    qty_installed,
    coverage_total,
    to_order,
    available_to_install,
    is_satisfied,
  };
}

/**
 * Determine if a commitment is funding-blocked.
 * AK STOCK / not_billable / system-project commitments are NEVER blocked.
 */
export function isFundingBlocked(commitment, project, poolBalance = 0) {
  if (commitment.billing_status === 'not_billable') return false;
  if (project?.is_system_project === true) return false;
  const exposureGap = commitment.exposure_gap || 0;
  return exposureGap > poolBalance && exposureGap > 0;
}

/**
 * Aggregate canonical supply state across multiple commitments for a single part.
 * Used by getPartsInventoryView and any part-level summary.
 */
export function aggregatePartSupply(commitments) {
  let reserved_total = 0;
  let required_total = 0;
  let on_order = 0;
  let to_order = 0;
  let installed_total = 0;

  for (const c of commitments) {
    const q = readCanonicalQty(c);
    reserved_total += q.reserved_from_stock;
    required_total += q.required_total;
    on_order += q.covered_from_po;
    to_order += q.to_order;
    installed_total += q.qty_installed;
  }

  return { reserved_total, required_total, on_order, to_order, installed_total };
}

/**
 * Runtime assertion — logs structured warnings for impossible states.
 * Returns array of violation objects (empty = clean).
 */
export function assertSupplyInvariants(q, context = {}) {
  const violations = [];
  const TOL = 0.001;
  const { commitment_id, part_id } = context;

  if (q.to_order < -TOL) {
    violations.push({ field: 'to_order', value: q.to_order, message: 'Negative to_order', commitment_id, part_id });
  }
  if (!Number.isFinite(q.to_order)) {
    violations.push({ field: 'to_order', value: q.to_order, message: 'NaN/Infinity to_order', commitment_id, part_id });
  }
  if (q.coverage_total > q.effective_required + TOL && q.effective_required > 0) {
    violations.push({ field: 'coverage_total', value: q.coverage_total, limit: q.effective_required, message: 'Over-covered', commitment_id, part_id });
  }

  return violations;
}