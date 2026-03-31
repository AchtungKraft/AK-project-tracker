import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * SUPPLY INVARIANT GUARD
 * 
 * Centralized enforcement of the fundamental supply invariant:
 *   reserved_from_stock + covered_from_po ≤ required_total
 * 
 * Actions:
 *   - validate: Check a single commitment for invariant violation
 *   - validateBatch: Check multiple commitments
 *   - audit: Scan ALL commitments and report violations
 *   - enforce: Auto-correct violations (reduce reserved_from_stock to fit)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, commitment_id, commitment_ids, dry_run = true, proposed_update } = await req.json();

    switch (action) {
      case 'validate':
        return Response.json(await validateSingle(base44, commitment_id, proposed_update));
      case 'validateBatch':
        return Response.json(await validateBatch(base44, commitment_ids));
      case 'audit':
        if (user.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });
        return Response.json(await auditAll(base44));
      case 'enforce':
        if (user.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });
        return Response.json(await enforceAll(base44, user.email, dry_run));
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('supplyInvariantGuard error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── INVARIANT CHECK ──

function checkInvariant(c, proposedUpdate = null) {
  const required = proposedUpdate?.required_total ?? c.required_total ?? 0;
  const reserved = proposedUpdate?.reserved_from_stock ?? c.reserved_from_stock ?? 0;
  const covered = proposedUpdate?.covered_from_po ?? c.covered_from_po ?? 0;
  const installed = proposedUpdate?.qty_installed ?? c.qty_installed ?? 0;

  const coverage = reserved + covered;
  const overallocation = coverage - required;
  const violated = overallocation > 0.001; // tolerance for floating point

  const result = {
    commitment_id: c.id,
    project_id: c.project_id,
    part_id: c.part_id,
    required_total: required,
    reserved_from_stock: reserved,
    covered_from_po: covered,
    qty_installed: installed,
    total_coverage: coverage,
    overallocation: violated ? Math.round(overallocation * 100) / 100 : 0,
    violated,
  };

  if (violated) {
    // Correction strategy: prefer keeping covered_from_po, reduce reserved_from_stock
    const max_reservable = Math.max(0, required - covered);
    result.correction = {
      strategy: 'REDUCE_RESERVED_FROM_STOCK',
      current_reserved: reserved,
      corrected_reserved: max_reservable,
      delta: reserved - max_reservable,
    };
  }

  return result;
}

// ── ACTIONS ──

async function validateSingle(base44, commitment_id, proposedUpdate) {
  if (!commitment_id) return { error: 'commitment_id required' };
  const [c] = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
  if (!c) return { error: 'Commitment not found' };
  return { ok: true, ...checkInvariant(c, proposedUpdate) };
}

async function validateBatch(base44, commitment_ids) {
  if (!commitment_ids?.length) return { error: 'commitment_ids required' };
  const results = [];
  for (const id of commitment_ids) {
    const [c] = await base44.asServiceRole.entities.PartCommitment.filter({ id });
    if (c) results.push(checkInvariant(c));
  }
  const violations = results.filter(r => r.violated);
  return { total_checked: results.length, violations_found: violations.length, violations, all_clear: violations.length === 0 };
}

async function auditAll(base44) {
  const commitments = await base44.asServiceRole.entities.PartCommitment.list('-created_date', 10000);
  const active = commitments.filter(c => c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed');
  
  const violations = [];
  for (const c of active) {
    const check = checkInvariant(c);
    if (check.violated) violations.push(check);
  }

  return {
    total_scanned: active.length,
    total_skipped: commitments.length - active.length,
    violations_found: violations.length,
    violations,
    scanned_at: new Date().toISOString(),
  };
}

async function enforceAll(base44, userEmail, dry_run) {
  const audit = await auditAll(base44);
  if (audit.violations_found === 0) return { ...audit, corrections_applied: 0, message: 'No violations found' };

  const corrections = [];
  for (const v of audit.violations) {
    const correction = {
      commitment_id: v.commitment_id,
      part_id: v.part_id,
      project_id: v.project_id,
      before: { reserved_from_stock: v.reserved_from_stock, covered_from_po: v.covered_from_po, required_total: v.required_total },
      after: { reserved_from_stock: v.correction.corrected_reserved },
      delta: v.correction.delta,
      strategy: v.correction.strategy,
    };

    if (!dry_run) {
      await base44.asServiceRole.entities.PartCommitment.update(v.commitment_id, {
        reserved_from_stock: v.correction.corrected_reserved,
        qty_reserved: v.correction.corrected_reserved,
        integrity_warning: true,
        integrity_warning_details: `INVARIANT_CORRECTED: reserved reduced by ${v.correction.delta} (was ${v.reserved_from_stock}, po=${v.covered_from_po}, required=${v.required_total})`,
        last_recomputed_at: new Date().toISOString(),
      });

      await base44.asServiceRole.entities.CommitmentAuditLog.create({
        commitment_id: v.commitment_id,
        action_type: 'validation_error',
        previous_values: { reserved_from_stock: v.reserved_from_stock },
        new_values: { reserved_from_stock: v.correction.corrected_reserved },
        trigger_source: 'sync',
        triggered_by: userEmail,
        actor_email: userEmail,
        notes: `INVARIANT_ENFORCEMENT: reserved(${v.reserved_from_stock}) + covered_po(${v.covered_from_po}) = ${v.total_coverage} > required(${v.required_total}). Corrected reserved to ${v.correction.corrected_reserved}.`,
      });
    }

    corrections.push(correction);
  }

  return {
    ...audit,
    dry_run,
    corrections_applied: dry_run ? 0 : corrections.length,
    corrections,
  };
}