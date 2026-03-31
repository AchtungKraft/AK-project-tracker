import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * PHASE 2: Safe Admin Data Correction
 * Applies fixes to align deprecated fields with canonical values.
 * Supports dry_run for preview, requires admin role, logs all changes.
 * 
 * fix_type:
 *  - ALIGN_DEPRECATED: Set deprecated fields to match canonical
 *  - FIX_NEGATIVE_COVERED: Set covered_from_po to 0 if negative
 *  - RECOMPUTE_QUANTITIES: Recompute qty_to_order from canonical formula
 *  - BATCH_ALIGN: Align all deprecated fields for selected commitments
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });

    const { fix_type, commitment_ids, dry_run = true } = await req.json();
    if (!fix_type) return Response.json({ error: 'fix_type required' }, { status: 400 });
    if (!commitment_ids?.length) return Response.json({ error: 'commitment_ids required' }, { status: 400 });

    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: { $in: commitment_ids } });
    if (!commitments.length) return Response.json({ error: 'No commitments found' }, { status: 404 });

    const previews = [];
    const applied = [];
    const errors = [];

    for (const c of commitments) {
      const rt = c.required_total ?? 0;
      const rfs = c.reserved_from_stock ?? 0;
      const cfp = c.covered_from_po ?? 0;
      const qi = c.qty_installed ?? 0;
      const gap = Math.max(0, rt - rfs - cfp);

      let updates = {};
      let description = '';

      switch (fix_type) {
        case 'ALIGN_DEPRECATED': {
          updates = { qty_committed: rt, qty_reserved: rfs, qty_to_order: gap };
          description = `Align deprecated fields: qty_committed→${rt}, qty_reserved→${rfs}, qty_to_order→${gap}`;
          break;
        }
        case 'FIX_NEGATIVE_COVERED': {
          if (cfp < 0) {
            updates = { covered_from_po: 0 };
            description = `Fix negative covered_from_po: ${cfp}→0`;
          } else {
            description = `covered_from_po already non-negative (${cfp}), no fix needed`;
          }
          break;
        }
        case 'RECOMPUTE_QUANTITIES': {
          updates = { qty_to_order: gap, qty_committed: rt, qty_reserved: rfs };
          // Also recompute coverage_status
          const covTotal = rfs + cfp;
          let cs = 'NOT_COVERED';
          if (covTotal >= rt && rt > 0) cs = 'FULLY_COVERED';
          else if (covTotal > 0) cs = 'PARTIALLY_COVERED';
          updates.coverage_status = cs;
          description = `Recompute: gap→${gap}, coverage→${cs}`;
          break;
        }
        case 'BATCH_ALIGN': {
          // Full alignment
          const covTotal = rfs + cfp;
          let cs = 'NOT_COVERED';
          if (covTotal >= rt && rt > 0) cs = 'FULLY_COVERED';
          else if (covTotal > 0) cs = 'PARTIALLY_COVERED';
          updates = { qty_committed: rt, qty_reserved: rfs, qty_to_order: gap, coverage_status: cs };
          if (cfp < 0) updates.covered_from_po = 0;
          description = `Full alignment: deprecated→canonical, gap=${gap}, coverage=${cs}`;
          break;
        }
        default:
          errors.push({ commitment_id: c.id, error: `Unknown fix_type: ${fix_type}` });
          continue;
      }

      const preview = {
        commitment_id: c.id,
        project_id: c.project_id,
        part_id: c.part_id,
        description,
        before: {
          required_total: rt, reserved_from_stock: rfs, covered_from_po: cfp, qty_installed: qi,
          qty_committed: c.qty_committed, qty_reserved: c.qty_reserved, qty_to_order: c.qty_to_order,
          coverage_status: c.coverage_status
        },
        updates,
        has_changes: Object.keys(updates).length > 0
      };
      previews.push(preview);

      if (!dry_run && Object.keys(updates).length > 0) {
        await base44.asServiceRole.entities.PartCommitment.update(c.id, {
          ...updates,
          commitment_version: (c.commitment_version ?? 0) + 1,
          last_recomputed_at: new Date().toISOString()
        });
        // Audit log
        await base44.asServiceRole.entities.CommitmentAuditLog.create({
          commitment_id: c.id,
          action_type: 'update',
          previous_values: preview.before,
          new_values: updates,
          trigger_source: 'manual',
          triggered_by: user.email,
          actor_email: user.email,
          notes: `[PHASE2] ${fix_type}: ${description}`,
          timestamp: new Date().toISOString(),
          validation_passed: true
        });
        applied.push(c.id);
      }
    }

    return Response.json({
      ok: true,
      dry_run,
      fix_type,
      total_scanned: commitments.length,
      total_with_changes: previews.filter(p => p.has_changes).length,
      total_applied: applied.length,
      previews,
      applied,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('applyDataAlignmentFix error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});