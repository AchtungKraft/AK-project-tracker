import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * resolveCommitmentState - Authoritative State Resolver
 * PHASE 1 CANONICAL ALIGNMENT:
 * - ALL derived state from canonical fields ONLY
 * - No fallback to deprecated fields (legacy block returned for UI compat)
 * - Validation: reserved_from_stock <= Part.physical_stock
 * - Validation: reserved + covered + gap = required_total
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { commitment_id, commitment_ids } = await req.json();
    const ids = commitment_ids || (commitment_id ? [commitment_id] : []);
    if (!ids.length) return Response.json({ error: 'commitment_id or commitment_ids required' }, { status: 400 });

    const commitments = await base44.entities.PartCommitment.filter({ id: { $in: ids } });
    if (!commitments.length) return Response.json({ error: 'No commitments found' }, { status: 404 });

    // PHASE 1: Fetch parts for cross-validation
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const parts = partIds.length > 0 ? await base44.entities.Part.filter({ id: { $in: partIds } }) : [];
    const partMap = new Map(parts.map(p => [p.id, p]));

    const results = commitments.map(c => resolveState(c, partMap.get(c.part_id)));

    if (commitment_id && !commitment_ids) return Response.json(results[0]);
    return Response.json({ commitments: results });
  } catch (error) {
    console.error("resolveCommitmentState error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function resolveState(commitment, part) {
  // PHASE 1: CANONICAL FIELDS ONLY — no fallback to deprecated
  const required_total = commitment.required_total ?? 0;
  const reserved_from_stock = commitment.reserved_from_stock ?? 0;
  const covered_from_po = commitment.covered_from_po ?? 0;
  const qty_installed = commitment.qty_installed ?? 0;
  const supply_source_type = commitment.supply_source_type ?? 'VENDOR';

  // Derived
  const coverage_total = reserved_from_stock + covered_from_po;
  const gap = Math.max(0, required_total - coverage_total);
  const overage = Math.max(0, coverage_total - required_total);

  // Lifecycle
  let lifecycle_state;
  if (qty_installed >= required_total && required_total > 0) lifecycle_state = 'INSTALLED';
  else if (coverage_total >= required_total && required_total > 0) lifecycle_state = 'COVERED';
  else if (gap > 0) lifecycle_state = 'NEEDS_ORDER';
  else lifecycle_state = 'PLANNED';

  // Coverage status
  let coverage_status;
  if (coverage_total >= required_total && required_total > 0) coverage_status = 'FULLY_COVERED';
  else if (coverage_total > 0) coverage_status = 'PARTIALLY_COVERED';
  else coverage_status = 'NOT_COVERED';

  // Invariants
  const invariants = [];

  if (reserved_from_stock > required_total)
    invariants.push({ rule: 'RESERVED_EXCEEDS_REQUIRED', severity: 'error', message: `reserved(${reserved_from_stock}) > required(${required_total})` });
  if (qty_installed > required_total)
    invariants.push({ rule: 'INSTALLED_EXCEEDS_REQUIRED', severity: 'error', message: `installed(${qty_installed}) > required(${required_total})` });
  if (covered_from_po < 0)
    invariants.push({ rule: 'NEGATIVE_PO_COVERAGE', severity: 'error', message: `covered_from_po(${covered_from_po}) negative` });
  if (overage > 0)
    invariants.push({ rule: 'OVERAGE_DETECTED', severity: 'warning', message: `Coverage exceeds required by ${overage}` });

  // PHASE 1: Cross-validate reserved_from_stock against Part.physical_stock
  if (part) {
    const phys = part.physical_stock ?? 0;
    if (reserved_from_stock > phys)
      invariants.push({ rule: 'RESERVED_EXCEEDS_PHYSICAL', severity: 'warning', message: `reserved(${reserved_from_stock}) > physical_stock(${phys})` });
  }

  // PHASE 1: Validate allocation + PO + gap = required_total
  const allocation_sum = reserved_from_stock + covered_from_po + gap;
  if (required_total > 0 && Math.abs(allocation_sum - required_total) > 0.01) {
    invariants.push({ rule: 'ALLOCATION_SUM_MISMATCH', severity: 'error', message: `reserved(${reserved_from_stock})+covered(${covered_from_po})+gap(${gap})=${allocation_sum} != required(${required_total})` });
  }

  // PHASE 1: Detect canonical vs deprecated mismatches
  if (commitment.qty_committed !== undefined && commitment.qty_committed !== required_total)
    invariants.push({ rule: 'DEPRECATED_MISMATCH_QTY_COMMITTED', severity: 'warning', message: `qty_committed(${commitment.qty_committed}) != required_total(${required_total})` });
  if (commitment.qty_reserved !== undefined && commitment.qty_reserved !== reserved_from_stock)
    invariants.push({ rule: 'DEPRECATED_MISMATCH_QTY_RESERVED', severity: 'warning', message: `qty_reserved(${commitment.qty_reserved}) != reserved_from_stock(${reserved_from_stock})` });

  let invariant_status = 'valid';
  if (invariants.some(i => i.severity === 'error')) invariant_status = 'error';
  else if (invariants.some(i => i.severity === 'warning')) invariant_status = 'warning';

  // Available for install
  const available_for_install = Math.max(0, Math.min(reserved_from_stock, required_total) - qty_installed);

  // Allowed actions
  const allowed_actions = [];
  if (gap > 0 && supply_source_type === 'VENDOR') allowed_actions.push('CREATE_PO');
  if (reserved_from_stock < required_total && supply_source_type === 'STOCK') allowed_actions.push('AUTO_RESERVE');
  if (available_for_install > 0) allowed_actions.push('INSTALL');
  if (qty_installed > 0) allowed_actions.push('REVERSE_INSTALL');
  if (commitment.commitment_status !== 'cancelled') allowed_actions.push('CANCEL_COMMITMENT');
  allowed_actions.push('ADJUST_REQUIRED');

  return {
    commitment_id: commitment.id,
    project_id: commitment.project_id,
    part_id: commitment.part_id,

    // Canonical
    required_total, reserved_from_stock, covered_from_po, qty_installed, supply_source_type,

    // Derived
    coverage_total, gap, overage, available_for_install,

    // States
    lifecycle_state, coverage_status, invariant_status, invariants,

    // Actions
    allowed_actions,

    // Billing
    billing_status: commitment.billing_status,
    unit_cost_snapshot: commitment.unit_cost_snapshot,
    unit_retail_snapshot: commitment.unit_retail_snapshot,
    planned_cost_total: commitment.planned_cost_total ?? (commitment.unit_cost_snapshot ?? 0) * required_total,
    planned_retail_total: commitment.planned_retail_total ?? (commitment.unit_retail_snapshot ?? 0) * required_total,

    // Legacy (read-only, for UI compat during migration)
    legacy: {
      qty_committed: commitment.qty_committed,
      qty_reserved: commitment.qty_reserved,
      qty_to_order: commitment.qty_to_order,
      qty_ordered: commitment.qty_ordered,
      qty_received: commitment.qty_received,
      qty_allocated: commitment.qty_allocated
    }
  };
}