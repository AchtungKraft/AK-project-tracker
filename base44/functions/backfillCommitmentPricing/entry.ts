import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Migration Script: Backfill commitment pricing
 * 
 * If unit_retail_snapshot missing:
 *   1. Copy from PartBuildAssignment.unit_retail
 *   2. Else copy from Part.default_retail
 * 
 * DO NOT overwrite existing snapshots.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { dry_run = true, project_id } = body;

    // Fetch data
    const [commitments, parts, assignments] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartBuildAssignment.list(),
    ]);

    // Build lookups
    const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const assignmentsMap = {};
    assignments.forEach(a => {
      const key = `${a.project_id}_${a.part_id}`;
      assignmentsMap[key] = a;
    });

    // Filter commitments
    const targetCommitments = project_id
      ? commitments.filter(c => c.project_id === project_id)
      : commitments;

    const activeCommitments = targetCommitments.filter(c => c.commitment_status !== 'cancelled');

    const results = {
      total_checked: activeCommitments.length,
      already_has_retail: 0,
      backfilled_from_assignment: 0,
      backfilled_from_part: 0,
      no_source_found: 0,
      cost_backfilled: 0,
      updates: [],
    };

    for (const commitment of activeCommitments) {
      const part = partsMap[commitment.part_id];
      const assignmentKey = `${commitment.project_id}_${commitment.part_id}`;
      const assignment = assignmentsMap[assignmentKey];

      const updates = {};
      let source = null;

      // Backfill retail if missing
      if (!commitment.unit_retail_snapshot) {
        if (assignment?.unit_retail) {
          updates.unit_retail_snapshot = assignment.unit_retail;
          source = 'assignment';
          results.backfilled_from_assignment++;
        } else if (part?.default_retail) {
          updates.unit_retail_snapshot = part.default_retail;
          source = 'part';
          results.backfilled_from_part++;
        } else {
          results.no_source_found++;
        }
      } else {
        results.already_has_retail++;
      }

      // Backfill cost if missing
      if (!commitment.unit_cost_snapshot && !commitment.actual_unit_cost) {
        if (assignment?.default_cost) {
          updates.unit_cost_snapshot = assignment.default_cost;
          results.cost_backfilled++;
        } else if (part?.default_cost) {
          updates.unit_cost_snapshot = part.default_cost;
          results.cost_backfilled++;
        }
      }

      // Calculate margin if we have both values
      if (updates.unit_retail_snapshot || commitment.unit_retail_snapshot) {
        const retail = updates.unit_retail_snapshot || commitment.unit_retail_snapshot;
        const cost = commitment.actual_unit_cost || updates.unit_cost_snapshot || commitment.unit_cost_snapshot;
        
        if (retail && cost) {
          updates.margin_pct = ((retail - cost) / retail) * 100;
          updates.pricing_integrity_status = updates.margin_pct < 0 ? 'margin_negative' : 
            (commitment.actual_unit_cost ? 'ok' : 'estimated_cost');
        } else if (retail && !cost) {
          updates.pricing_integrity_status = 'estimated_cost';
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.commitment_version = (commitment.commitment_version || 1) + 1;

        if (!dry_run) {
          await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
        }

        results.updates.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          part_name: part?.part_name,
          source,
          updates,
        });
      }
    }

    return Response.json({
      success: true,
      dry_run,
      results,
      summary: {
        total_updated: results.updates.length,
        coverage_after: results.total_checked > 0
          ? Math.round(((results.already_has_retail + results.backfilled_from_assignment + results.backfilled_from_part) / results.total_checked) * 100)
          : 100,
      }
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});