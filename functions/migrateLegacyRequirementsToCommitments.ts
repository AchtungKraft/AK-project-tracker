import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * migrateLegacyRequirementsToCommitments
 * 
 * One-time migration to create PartCommitment records for orphan PartProjectRequirements.
 * An orphan requirement is one where no PartCommitment exists for the same (project_id, part_id).
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
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true, limit = 500, project_id = null } = await req.json();
    const timestamp = new Date().toISOString();

    console.log(`📊 Starting migration: dry_run=${dry_run}, limit=${limit}, project_id=${project_id || 'all'}`);

    // Load requirements
    let requirements;
    if (project_id) {
      requirements = await base44.asServiceRole.entities.PartProjectRequirement.filter({ project_id });
    } else {
      requirements = await base44.asServiceRole.entities.PartProjectRequirement.filter({}, '-created_date', limit);
    }

    // Load all commitments to find orphans
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({}, '-created_date', 2000);
    
    // Build a set of existing commitment keys (project_id:part_id)
    const existingCommitmentKeys = new Set();
    for (const c of commitments) {
      if (c.commitment_status !== 'cancelled') {
        existingCommitmentKeys.add(`${c.project_id}:${c.part_id}`);
      }
    }

    // Load parts for pricing
    const parts = await base44.asServiceRole.entities.Part.filter({}, '-created_date', 1000);
    const partsMap = new Map(parts.map(p => [p.id, p]));

    const report = {
      timestamp,
      dry_run,
      scanned_count: requirements.length,
      orphan_count: 0,
      created_count: 0,
      skipped_count: 0,
      created_commitment_ids: [],
      warnings: [],
      errors: []
    };

    // Find orphan requirements
    const orphans = [];
    for (const req of requirements) {
      // Skip requirements without project_id (general stock)
      if (!req.project_id) {
        report.skipped_count++;
        continue;
      }

      const key = `${req.project_id}:${req.part_id}`;
      if (!existingCommitmentKeys.has(key)) {
        orphans.push(req);
      }
    }

    report.orphan_count = orphans.length;
    console.log(`🔍 Found ${orphans.length} orphan requirements out of ${requirements.length} scanned`);

    // Process orphans
    for (const orphan of orphans) {
      const part = partsMap.get(orphan.part_id);
      
      if (!part) {
        report.warnings.push({
          requirement_id: orphan.id,
          issue: 'Part not found',
          part_id: orphan.part_id
        });
        report.skipped_count++;
        continue;
      }

      // Compute pricing snapshots
      const unit_cost_snapshot = part.cost || part.default_cost || 0;
      const unit_retail_snapshot = part.retail_override || part.retail_matrix_price || part.default_retail || 0;
      const qty_committed = orphan.qty_needed || orphan.qty_required || 1;
      const planned_cost_total = unit_cost_snapshot * qty_committed;
      const planned_retail_total = unit_retail_snapshot * qty_committed;

      // Flag warnings
      if (unit_cost_snapshot <= 0) {
        report.warnings.push({
          requirement_id: orphan.id,
          part_name: part.part_name,
          issue: 'Missing cost',
          part_id: orphan.part_id
        });
      }
      if (unit_retail_snapshot <= 0) {
        report.warnings.push({
          requirement_id: orphan.id,
          part_name: part.part_name,
          issue: 'Missing retail',
          part_id: orphan.part_id
        });
      }

      if (!dry_run) {
        try {
          // Create commitment
          const commitment = await base44.asServiceRole.entities.PartCommitment.create({
            project_id: orphan.project_id,
            part_id: orphan.part_id,
            requirement_id: orphan.id,
            qty_committed,
            qty_ordered: orphan.qty_ordered || 0,
            qty_received: 0,
            qty_allocated: orphan.qty_allocated || 0,
            qty_installed: orphan.qty_installed || 0,
            qty_cancelled: 0,
            commitment_status: determineStatus(orphan),
            source_type: 'requirement',
            allocation_source: 'migrated_requirement',
            billing_status: 'billable',
            unit_cost_snapshot,
            unit_retail_snapshot,
            planned_cost_total,
            planned_retail_total,
            covered_retail_total: 0,
            exposure_gap: planned_retail_total,
            pricing_integrity_status: unit_cost_snapshot <= 0 ? 'missing_cost' : 'ok',
            commitment_version: 1,
            notes: `Migrated from requirement ${orphan.id}`
          });

          report.created_commitment_ids.push(commitment.id);
          report.created_count++;

          // Update requirement to link to commitment
          await base44.asServiceRole.entities.PartProjectRequirement.update(orphan.id, {
            commitment_id: commitment.id
          });

          console.log(`✅ Created commitment for ${part.part_name} (${commitment.id})`);

        } catch (err) {
          report.errors.push({
            requirement_id: orphan.id,
            error: err.message
          });
        }
      } else {
        report.created_count++; // Would be created
        report.created_commitment_ids.push(`[dry_run] ${orphan.part_id}`);
      }

      // Rate limit
      if (!dry_run && report.created_count % 10 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`📊 Migration complete: ${report.created_count} commitments ${dry_run ? 'would be' : ''} created`);

    return Response.json({
      success: true,
      report
    });

  } catch (error) {
    console.error("Migration error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function determineStatus(requirement) {
  if ((requirement.qty_installed || 0) >= (requirement.qty_needed || 1)) {
    return 'installed';
  }
  if ((requirement.qty_installed || 0) > 0) {
    return 'partially_received';
  }
  if ((requirement.qty_ordered || 0) > 0) {
    return 'ordered';
  }
  if ((requirement.qty_allocated || 0) > 0) {
    return 'allocated';
  }
  return 'planned';
}