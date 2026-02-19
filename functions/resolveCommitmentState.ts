import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * resolveCommitmentState - Authoritative State Resolver for Commitments
 * 
 * This is the SINGLE SOURCE OF TRUTH for commitment state.
 * All UI components MUST use this resolver instead of computing state locally.
 * 
 * Returns derived state including:
 * - coverage_total, gap, overage
 * - lifecycle_state (INSTALLED, COVERED, NEEDS_ORDER, PLANNED)
 * - invariant_status (valid, warning, error)
 * 
 * Invariants enforced:
 * - reserved_from_stock <= required_total
 * - qty_installed <= required_total
 * - covered_from_po >= 0
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commitment_id, commitment_ids } = await req.json();

    // Support both single and batch resolution
    const idsToResolve = commitment_ids || (commitment_id ? [commitment_id] : []);
    
    if (idsToResolve.length === 0) {
      return Response.json({ error: 'commitment_id or commitment_ids required' }, { status: 400 });
    }

    // Fetch all commitments
    const commitments = await base44.entities.PartCommitment.filter({
      id: { $in: idsToResolve }
    });

    if (commitments.length === 0) {
      return Response.json({ error: 'No commitments found' }, { status: 404 });
    }

    // Resolve each commitment
    const results = commitments.map(commitment => resolveState(commitment));

    // Return single or batch result
    if (commitment_id && !commitment_ids) {
      return Response.json(results[0]);
    }

    return Response.json({ commitments: results });

  } catch (error) {
    console.error("resolveCommitmentState error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Core state resolution logic
 */
function resolveState(commitment) {
  // Extract canonical fields (with fallback to legacy fields for migration)
  const required_total = commitment.required_total ?? commitment.qty_committed ?? 0;
  const reserved_from_stock = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
  const covered_from_po = commitment.covered_from_po ?? 
    Math.max(0, (commitment.qty_ordered ?? 0) - (commitment.qty_received ?? 0)) ?? 0;
  const qty_installed = commitment.qty_installed ?? 0;
  const supply_source_type = commitment.supply_source_type ?? 'VENDOR';

  // Compute derived values
  const coverage_total = reserved_from_stock + covered_from_po;
  const gap = Math.max(0, required_total - coverage_total);
  const overage = Math.max(0, coverage_total - required_total);

  // Determine lifecycle state
  let lifecycle_state;
  if (qty_installed >= required_total && required_total > 0) {
    lifecycle_state = 'INSTALLED';
  } else if (coverage_total >= required_total && required_total > 0) {
    lifecycle_state = 'COVERED';
  } else if (gap > 0) {
    lifecycle_state = 'NEEDS_ORDER';
  } else {
    lifecycle_state = 'PLANNED';
  }

  // Determine coverage status (derived)
  let coverage_status;
  if (coverage_total >= required_total && required_total > 0) {
    coverage_status = 'FULLY_COVERED';
  } else if (coverage_total > 0) {
    coverage_status = 'PARTIALLY_COVERED';
  } else {
    coverage_status = 'NOT_COVERED';
  }

  // Validate invariants
  const invariants = [];
  
  if (reserved_from_stock > required_total) {
    invariants.push({
      rule: 'RESERVED_EXCEEDS_REQUIRED',
      severity: 'error',
      message: `reserved_from_stock (${reserved_from_stock}) > required_total (${required_total})`
    });
  }
  
  if (qty_installed > required_total) {
    invariants.push({
      rule: 'INSTALLED_EXCEEDS_REQUIRED',
      severity: 'error',
      message: `qty_installed (${qty_installed}) > required_total (${required_total})`
    });
  }
  
  if (covered_from_po < 0) {
    invariants.push({
      rule: 'NEGATIVE_PO_COVERAGE',
      severity: 'error',
      message: `covered_from_po (${covered_from_po}) is negative`
    });
  }

  if (overage > 0) {
    invariants.push({
      rule: 'OVERAGE_DETECTED',
      severity: 'warning',
      message: `Coverage exceeds required by ${overage}`
    });
  }

  // Determine overall invariant status
  let invariant_status = 'valid';
  if (invariants.some(i => i.severity === 'error')) {
    invariant_status = 'error';
  } else if (invariants.some(i => i.severity === 'warning')) {
    invariant_status = 'warning';
  }

  // Compute available quantity for installation
  const available_for_install = Math.min(
    reserved_from_stock + (commitment.qty_received ?? 0),
    required_total
  ) - qty_installed;

  // Compute what actions are allowed
  const allowed_actions = [];
  
  if (gap > 0 && supply_source_type === 'VENDOR') {
    allowed_actions.push('CREATE_PO');
  }
  
  if (reserved_from_stock < required_total && supply_source_type === 'STOCK') {
    allowed_actions.push('AUTO_RESERVE');
  }
  
  if (available_for_install > 0) {
    allowed_actions.push('INSTALL');
  }
  
  if (qty_installed > 0) {
    allowed_actions.push('REVERSE_INSTALL');
  }
  
  if (commitment.billing_status !== 'paid' && gap === 0) {
    allowed_actions.push('ALLOCATE_POOL');
  }
  
  if (commitment.commitment_status !== 'cancelled') {
    allowed_actions.push('CANCEL_COMMITMENT');
  }

  allowed_actions.push('ADJUST_REQUIRED');

  return {
    commitment_id: commitment.id,
    project_id: commitment.project_id,
    part_id: commitment.part_id,
    
    // Canonical fields
    required_total,
    reserved_from_stock,
    covered_from_po,
    qty_installed,
    supply_source_type,
    
    // Derived calculations
    coverage_total,
    gap,
    overage,
    available_for_install: Math.max(0, available_for_install),
    
    // Derived states
    lifecycle_state,
    coverage_status,
    invariant_status,
    invariants,
    
    // Allowed actions
    allowed_actions,
    
    // Billing context
    billing_status: commitment.billing_status,
    unit_cost_snapshot: commitment.unit_cost_snapshot,
    unit_retail_snapshot: commitment.unit_retail_snapshot,
    planned_cost_total: commitment.planned_cost_total ?? (commitment.unit_cost_snapshot ?? 0) * required_total,
    planned_retail_total: commitment.planned_retail_total ?? (commitment.unit_retail_snapshot ?? 0) * required_total,
    
    // Legacy field mapping (for UI compatibility during migration)
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