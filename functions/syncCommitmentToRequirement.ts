import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automation: Sync PartCommitment changes back to PartProjectRequirement
 * 
 * REFACTORED for Phase 2D:
 * - Aggregates from all commitments
 * - Audit logging
 * - Keeps legacy dashboards functional
 * 
 * Trigger: PartCommitment CREATE / UPDATE / DELETE
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    if (event?.entity_name !== 'PartCommitment') {
      return Response.json({ skipped: true, reason: 'Not a PartCommitment event' });
    }

    // Get requirement_id from current or old data (for deletes)
    const requirementId = data?.requirement_id || old_data?.requirement_id;
    
    if (!requirementId) {
      return Response.json({ skipped: true, reason: 'No requirement_id linked' });
    }

    // Fetch the requirement first to capture previous values
    let requirement;
    try {
      requirement = await base44.asServiceRole.entities.PartProjectRequirement.get(requirementId);
    } catch (e) {
      return Response.json({ skipped: true, reason: 'Requirement not found', error: e.message });
    }

    const previousValues = {
      qty_allocated: requirement.qty_allocated,
      qty_ordered: requirement.qty_ordered,
      qty_installed: requirement.qty_installed
    };

    // Fetch all commitments for this requirement
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({
      requirement_id: requirementId
    });

    // Aggregate quantities from non-cancelled commitments
    let totalAllocated = 0;
    let totalOrdered = 0;
    let totalInstalled = 0;

    commitments.forEach(c => {
      if (c.commitment_status !== 'cancelled') {
        totalAllocated += c.qty_allocated || 0;
        totalOrdered += c.qty_ordered || 0;
        totalInstalled += c.qty_installed || 0;
      }
    });

    const newValues = {
      qty_allocated: totalAllocated,
      qty_ordered: totalOrdered,
      qty_installed: totalInstalled
    };

    // Only update if values changed
    const hasChanges = 
      previousValues.qty_allocated !== newValues.qty_allocated ||
      previousValues.qty_ordered !== newValues.qty_ordered ||
      previousValues.qty_installed !== newValues.qty_installed;

    if (!hasChanges) {
      return Response.json({
        success: true,
        requirement_id: requirementId,
        message: 'No changes needed',
        commitment_count: commitments.length
      });
    }

    // Update the requirement
    await base44.asServiceRole.entities.PartProjectRequirement.update(requirementId, newValues);

    // Audit log (on the commitment that triggered this)
    const commitmentId = data?.id || old_data?.id;
    if (commitmentId) {
      await base44.asServiceRole.entities.CommitmentAuditLog.create({
        commitment_id: commitmentId,
        action_type: 'update',
        previous_values: {
          requirement_values: previousValues
        },
        new_values: {
          requirement_values: newValues,
          aggregated_from_commitments: commitments.length
        },
        trigger_source: 'sync',
        validation_passed: true
      });
    }

    return Response.json({
      success: true,
      requirement_id: requirementId,
      previous: previousValues,
      aggregated: newValues,
      commitment_count: commitments.length,
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});