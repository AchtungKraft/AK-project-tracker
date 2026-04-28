/**
 * commitmentModalAdapter.js — CANONICAL MODAL ADAPTER
 *
 * Single source of truth for normalizing commitment objects before
 * passing them to any supply modal. Ensures every modal receives
 * a guaranteed-shape object with safe defaults for all fields.
 *
 * NO modal should receive raw data directly.
 * NO modal should access commitment._raw.
 * NO modal should recompute canonical quantities locally.
 */

/**
 * resolveCanonicalCommitment — Resolves an incoming partial/minimal
 * commitment reference into the full enriched canonical commitment
 * from the enrichedCommitments array.
 *
 * Returns null if no canonical match is found.
 */
export function resolveCanonicalCommitment(incoming, enrichedCommitments) {
  if (!incoming || !enrichedCommitments?.length) return null;

  const incomingId = incoming.id || incoming.commitment_id;
  if (!incomingId) return null;

  return enrichedCommitments.find(c =>
    c.id === incomingId || c.commitment_id === incomingId
  ) || null;
}

/**
 * normalizeCommitmentForModal — Produces a guaranteed-shape object
 * with safe defaults for every field any modal might access.
 *
 * Call this at the top of every modal component:
 *   const safe = normalizeCommitmentForModal(commitment);
 *   if (!safe?.id) return null;
 */
export function normalizeCommitmentForModal(commitment) {
  if (!commitment) return null;

  const id = commitment.id || commitment.commitment_id || null;
  if (!id) return null;

  return {
    // Identity
    id,
    commitment_id: commitment.commitment_id || id,
    project_id: commitment.project_id || null,
    part_id: commitment.part_id || null,

    // Part info (nested object)
    part: commitment.part || {
      id: commitment.part_id || null,
      part_name: 'Unknown Part',
      vendor_part_number: null,
      featured_photo: null,
    },

    // Canonical quantities — safe defaults
    required_total: commitment.required_total ?? 0,
    effective_required: commitment.effective_required ?? (commitment.required_total ?? 0) - (commitment.qty_removed ?? 0),
    reserved_from_stock: commitment.reserved_from_stock ?? 0,
    covered_from_po: commitment.covered_from_po ?? 0,
    qty_installed: commitment.qty_installed ?? 0,
    qty_removed: commitment.qty_removed ?? 0,

    // Coverage fields
    coverage_qty: commitment.coverage_qty ?? 0,
    to_order_qty: commitment.to_order_qty ?? commitment.to_order ?? 0,
    on_order_qty: commitment.on_order_qty ?? 0,
    received_qty: commitment.received_qty ?? 0,
    available_to_install: commitment.available_to_install ?? 0,
    coverage_percent: commitment.coverage_percent ?? 0,
    coverage_status: commitment.coverage_status || 'NOT_COVERED',
    needs_order: commitment.needs_order ?? false,
    commitment_fulfilled: commitment.commitment_fulfilled ?? false,

    // Financial
    unit_cost: commitment.unit_cost ?? commitment.unit_cost_snapshot ?? 0,
    unit_retail: commitment.unit_retail ?? commitment.unit_retail_snapshot ?? 0,
    unit_cost_snapshot: commitment.unit_cost_snapshot ?? commitment.unit_cost ?? 0,
    unit_retail_snapshot: commitment.unit_retail_snapshot ?? commitment.unit_retail ?? 0,
    planned_cost_total: commitment.planned_cost_total ?? 0,
    planned_retail_total: commitment.planned_retail_total ?? 0,
    cost_at_risk: commitment.cost_at_risk ?? 0,
    actual_unit_cost: commitment.actual_unit_cost ?? 0,
    actual_margin: commitment.actual_margin ?? 0,
    planned_margin: commitment.planned_margin ?? 0,

    // Billing
    billing_status: commitment.billing_status || 'unbilled',
    billing_state: commitment.billing_state || 'NOT_INVOICED',
    invoiced_qty: commitment.invoiced_qty ?? 0,
    invoiced_amount: commitment.invoiced_amount ?? 0,

    // PO references
    order_id: commitment.order_id ?? null,
    order_number: commitment.order_number ?? null,
    order_line_item_ids: commitment.order_line_item_ids || [],

    // Inventory snapshot
    inventory_snapshot: commitment.inventory_snapshot || {
      physical: 0, reserved: 0, available: 0,
    },

    // Integrity
    integrity: commitment.integrity || {
      quantity_valid: true,
      violations: [],
      quantity_violation: false,
      blocking: false,
      valid: true,
    },

    // Lifecycle
    commitment_status: commitment.commitment_status || 'planned',
    source_type: commitment.source_type || 'requirement',

    // Override flags
    cost_override: commitment.cost_override || false,
    retail_override: commitment.retail_override || false,

    // Vendor
    vendor: commitment.vendor || null,

    // Allowed actions (pass through)
    allowed: commitment.allowed || {},

    // Coverage block (pass through)
    coverage: commitment.coverage || null,

    // Next action
    next_action: commitment.next_action || null,
    block_reason_code: commitment.block_reason_code || null,
    block_reason_message: commitment.block_reason_message || null,
  };
}

/**
 * validateCommitmentForModal — Checks if a normalized commitment
 * has the minimum required fields for a given modal.
 *
 * Returns { valid: boolean, missing: string[] }
 */
export function validateCommitmentForModal(commitment, modalName) {
  const missing = [];

  if (!commitment) {
    return { valid: false, missing: ['commitment is null'] };
  }
  if (!commitment.id) missing.push('id');
  if (!commitment.project_id) missing.push('project_id');
  if (!commitment.part_id) missing.push('part_id');
  if (commitment.required_total === undefined || commitment.required_total === null) {
    missing.push('required_total');
  }

  if (missing.length > 0) {
    console.warn(`[ModalAdapter:${modalName}] Commitment missing fields:`, missing, commitment);
  }

  return { valid: missing.length === 0, missing };
}