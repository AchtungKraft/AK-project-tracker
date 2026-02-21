import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * normalizeLegacyBillingFlags - Phase 9H Step 1
 * 
 * Normalizes all legacy billing flags to ensure requires_prepay is an explicit boolean.
 * Legacy parts default to ORDER WITHOUT INVOICE (requires_prepay = false).
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run === true;
    const timestamp = new Date().toISOString();

    // Fetch all commitments and projects
    const [allCommitments, allProjects] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.Project.list()
    ]);

    // Build project lookup
    const projectMap = new Map(allProjects.map(p => [p.id, p]));

    let updated_count = 0;
    let already_normalized_count = 0;
    const updates = [];

    for (const commitment of allCommitments) {
      // Skip cancelled/closed
      if (commitment.commitment_status === 'cancelled' || commitment.commitment_status === 'closed') {
        continue;
      }

      const project = projectMap.get(commitment.project_id);
      const current_requires_prepay = commitment.requires_prepay;

      // Check if normalization is needed
      let needs_normalization = false;
      let new_requires_prepay = false; // Default to false (ORDER WITHOUT INVOICE)

      // Rule 1: If requires_prepay is null or undefined → set to false
      if (current_requires_prepay === null || current_requires_prepay === undefined) {
        needs_normalization = true;
        new_requires_prepay = false;
      }
      // Rule 2: If project is not forward model → set to false
      else if (project && project.financial_model_version !== 'forward') {
        needs_normalization = true;
        new_requires_prepay = false;
      }
      // Rule 3: If already explicitly boolean, check if it's a legacy commitment
      // Legacy commitments (before forward migration) default to false
      else if (typeof current_requires_prepay === 'boolean') {
        // Check if project was migrated and commitment predates migration
        if (project?.financial_model_migrated_at) {
          const migrationDate = new Date(project.financial_model_migrated_at);
          const commitmentDate = new Date(commitment.created_date);
          if (commitmentDate < migrationDate && current_requires_prepay === true) {
            // Legacy commitment - should default to false
            needs_normalization = true;
            new_requires_prepay = false;
          }
        }
        
        // If already boolean and doesn't need migration adjustment, it's normalized
        if (!needs_normalization) {
          already_normalized_count++;
          continue;
        }
      }

      if (needs_normalization) {
        updates.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          old_requires_prepay: current_requires_prepay,
          new_requires_prepay,
          reason: current_requires_prepay === null || current_requires_prepay === undefined
            ? 'NULL_OR_UNDEFINED'
            : project?.financial_model_version !== 'forward'
              ? 'LEGACY_PROJECT'
              : 'LEGACY_COMMITMENT'
        });

        if (!dry_run) {
          await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
            requires_prepay: new_requires_prepay,
            billing_flag_normalized_at: timestamp,
            billing_flag_normalized_by: user.email
          });
        }

        updated_count++;
      } else {
        already_normalized_count++;
      }
    }

    return Response.json({
      success: true,
      mode: dry_run ? 'DRY_RUN' : 'EXECUTED',
      timestamp,
      executed_by: user.email,
      summary: {
        total_commitments: allCommitments.length,
        updated_count,
        already_normalized_count,
        skipped_cancelled: allCommitments.filter(c => 
          c.commitment_status === 'cancelled' || c.commitment_status === 'closed'
        ).length
      },
      updates: dry_run ? updates : updates.slice(0, 20), // Limit response size
      message: updated_count === 0
        ? 'All billing flags already normalized'
        : `Normalized ${updated_count} commitment billing flags`
    });

  } catch (error) {
    console.error("normalizeLegacyBillingFlags error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});