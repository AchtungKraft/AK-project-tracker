import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9.7c — Commitment Quantity Drift Check
 * 
 * Scans commitments for invariant violations and optionally repairs safe issues.
 * Returns worst offenders sorted by severity and gap/overage.
 */

// Inline validator (same logic as lib/validateCommitmentQtyInvariant.js)
function validateCommitmentQtyInvariant(state, options = {}) {
  const { allow_overcoverage = true, allow_overship = true, strict_install_check = false } = options;

  const qty_needed = Math.max(0, Math.floor(state.qty_needed ?? state.qty_committed ?? 0));
  const qty_reserved = Math.max(0, Math.floor(state.qty_reserved ?? 0));
  const qty_ordered = Math.max(0, Math.floor(state.qty_ordered ?? 0));
  const qty_received = Math.max(0, Math.floor(state.qty_received ?? 0));
  const qty_installed = Math.max(0, Math.floor(state.qty_installed ?? 0));
  const qty_to_order_stored = state.qty_to_order ?? null;

  const coverage_total = qty_reserved + Math.max(qty_ordered, qty_received);
  const available_to_install = qty_reserved + qty_received;
  const gap_qty = Math.max(0, qty_needed - coverage_total);
  const overage_qty = Math.max(0, coverage_total - qty_needed);
  const qty_to_order_derived = gap_qty;
  const poAdjustmentRequired = overage_qty > 0 && (qty_ordered > qty_needed || qty_received > qty_needed);

  let coverage_status;
  if (qty_needed === 0) {
    coverage_status = coverage_total > 0 ? 'OVER' : 'FULL';
  } else if (coverage_total === 0) {
    coverage_status = 'NONE';
  } else if (coverage_total < qty_needed) {
    coverage_status = 'PARTIAL';
  } else if (coverage_total === qty_needed) {
    coverage_status = 'FULL';
  } else {
    coverage_status = 'OVER';
  }

  const violations = [];

  const checkNegative = (name, value) => {
    if ((state[name] ?? 0) < 0) {
      violations.push({ code: 'NEGATIVE_QTY', severity: 'BLOCKING', message: `${name} cannot be negative`, fields: [name] });
    }
  };
  ['qty_needed', 'qty_committed', 'qty_reserved', 'qty_ordered', 'qty_received', 'qty_installed', 'qty_to_order'].forEach(f => checkNegative(f, state[f]));

  if (qty_reserved > qty_needed && qty_needed > 0) {
    violations.push({ code: 'RESERVED_GT_NEEDED', severity: allow_overcoverage ? 'WARNING' : 'BLOCKING', message: `Reserved exceeds needed`, fields: ['qty_reserved'] });
  }
  if (coverage_status === 'OVER' && qty_needed > 0) {
    violations.push({ code: 'COVERAGE_OVER_NEEDED', severity: allow_overcoverage ? 'WARNING' : 'BLOCKING', message: `Coverage exceeds needed`, fields: [] });
  }
  if (qty_received > qty_ordered && qty_ordered > 0) {
    violations.push({ code: 'RECEIVED_GT_ORDERED', severity: allow_overship ? 'WARNING' : 'BLOCKING', message: `Received exceeds ordered`, fields: [] });
  }
  if (qty_installed > available_to_install) {
    violations.push({ code: 'INSTALLED_GT_AVAILABLE', severity: strict_install_check ? 'BLOCKING' : 'WARNING', message: `Installed exceeds available`, fields: [] });
  }
  if (qty_installed > qty_needed && qty_needed > 0) {
    violations.push({ code: 'INSTALLED_GT_NEEDED', severity: 'WARNING', message: `Installed exceeds needed`, fields: [] });
  }
  if (poAdjustmentRequired) {
    violations.push({ code: 'PO_ADJUSTMENT_REQUIRED', severity: 'WARNING', message: `PO adjustment required`, fields: [] });
  }
  if (qty_to_order_stored !== null && qty_to_order_stored !== qty_to_order_derived) {
    violations.push({ code: 'QTY_TO_ORDER_DRIFT', severity: 'WARNING', message: `qty_to_order drift`, fields: ['qty_to_order'] });
  }

  const hasBlocking = violations.some(v => v.severity === 'BLOCKING');

  return {
    ok: !hasBlocking,
    coverage: { qty_needed, qty_reserved, qty_ordered, qty_received, qty_installed, coverage_total, qty_to_order: qty_to_order_derived, gap_qty, overage_qty, coverage_status, poAdjustmentRequired },
    violations
  };
}

function applySafeRepairs(state) {
  const repairs = [];
  const repairedState = { ...state };
  const fields = ['qty_committed', 'qty_reserved', 'qty_ordered', 'qty_received', 'qty_installed', 'qty_to_order'];
  
  for (const field of fields) {
    if ((state[field] ?? 0) < 0) {
      repairs.push({ field, old_value: state[field], new_value: 0 });
      repairedState[field] = 0;
    }
  }
  
  const validated = validateCommitmentQtyInvariant(repairedState);
  if ((repairedState.qty_to_order ?? 0) !== validated.coverage.qty_to_order) {
    repairs.push({ field: 'qty_to_order', old_value: repairedState.qty_to_order, new_value: validated.coverage.qty_to_order });
    repairedState.qty_to_order = validated.coverage.qty_to_order;
  }
  
  return { repairedState, repairs };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { project_id, limit = 200, include_archived = false, repair_safe = false } = body;

    // Build query
    const query = {};
    if (project_id) query.project_id = project_id;
    if (!include_archived) query.commitment_status = { $ne: 'cancelled' };

    // Fetch commitments
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter(query, '-updated_date', limit);

    // Fetch related data for display
    const projectIds = [...new Set(commitments.map(c => c.project_id).filter(Boolean))];
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    
    const [projects, parts] = await Promise.all([
      projectIds.length > 0 ? base44.asServiceRole.entities.Project.filter({ id: { $in: projectIds } }) : [],
      partIds.length > 0 ? base44.asServiceRole.entities.Part.filter({ id: { $in: partIds } }) : []
    ]);
    
    const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
    const partMap = Object.fromEntries(parts.map(p => [p.id, p]));

    // Analyze each commitment
    const results = [];
    const byCode = {};
    let violating = 0, blocking = 0, warning = 0;

    for (const commitment of commitments) {
      const state = {
        qty_needed: commitment.qty_committed,
        qty_committed: commitment.qty_committed,
        qty_reserved: commitment.qty_reserved,
        qty_ordered: commitment.qty_ordered,
        qty_received: commitment.qty_received,
        qty_installed: commitment.qty_installed,
        qty_to_order: commitment.qty_to_order
      };

      const validation = validateCommitmentQtyInvariant(state);
      
      if (validation.violations.length > 0) {
        violating++;
        
        const hasBlocking = validation.violations.some(v => v.severity === 'BLOCKING');
        const hasWarning = validation.violations.some(v => v.severity === 'WARNING');
        if (hasBlocking) blocking++;
        if (hasWarning && !hasBlocking) warning++;
        
        // Count by code
        for (const v of validation.violations) {
          byCode[v.code] = (byCode[v.code] || 0) + 1;
        }

        // Apply safe repairs if requested
        let repaired = false;
        let repairDetails = [];
        if (repair_safe && validation.violations.some(v => v.code === 'NEGATIVE_QTY' || v.code === 'QTY_TO_ORDER_DRIFT')) {
          const { repairedState, repairs } = applySafeRepairs(state);
          
          if (repairs.length > 0) {
            // Persist repairs
            const updates = {};
            for (const r of repairs) {
              if (r.field !== 'qty_needed') {
                updates[r.field] = r.new_value;
              }
            }
            
            if (Object.keys(updates).length > 0) {
              await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
              
              // Log lifecycle event
              await base44.asServiceRole.entities.LifecycleEvent.create({
                commitment_id: commitment.id,
                project_id: commitment.project_id,
                part_id: commitment.part_id,
                event_type: 'DRIFT_REPAIRED',
                old_values: JSON.stringify(state),
                new_values: JSON.stringify(repairedState),
                triggered_by: user.email,
                trigger_source: 'DRIFT_CHECK',
                reason: `Safe repair: ${repairs.map(r => r.field).join(', ')}`,
                event_date: new Date().toISOString()
              });
              
              repaired = true;
              repairDetails = repairs;
            }
          }
        }

        const project = projectMap[commitment.project_id];
        const part = partMap[commitment.part_id];
        
        results.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          project_name: project?.name || 'Unknown',
          part_id: commitment.part_id,
          part_name: part?.part_name || 'Unknown',
          coverage_status: validation.coverage.coverage_status,
          gap_qty: validation.coverage.gap_qty,
          overage_qty: validation.coverage.overage_qty,
          poAdjustmentRequired: validation.coverage.poAdjustmentRequired,
          violations: validation.violations,
          qty_state: validation.coverage,
          repaired,
          repair_details: repairDetails
        });
      }
    }

    // Sort worst offenders: BLOCKING first, then by gap_qty desc, then overage_qty desc
    results.sort((a, b) => {
      const aBlocking = a.violations.some(v => v.severity === 'BLOCKING') ? 1 : 0;
      const bBlocking = b.violations.some(v => v.severity === 'BLOCKING') ? 1 : 0;
      if (bBlocking !== aBlocking) return bBlocking - aBlocking;
      if (b.gap_qty !== a.gap_qty) return b.gap_qty - a.gap_qty;
      if (b.overage_qty !== a.overage_qty) return b.overage_qty - a.overage_qty;
      return b.violations.length - a.violations.length;
    });

    return Response.json({
      scanned: commitments.length,
      violating,
      blocking,
      warning,
      worst_offenders: results.slice(0, 50),
      by_code: byCode,
      last_run_at: new Date().toISOString(),
      repair_safe_enabled: repair_safe
    });
  } catch (error) {
    console.error('Drift check error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});