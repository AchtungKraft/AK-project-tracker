import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automation: Sync PartCommitment changes back to PartProjectRequirement
 * 
 * Trigger: PartCommitment CREATE / UPDATE / DELETE
 * 
 * Behavior:
 * - Aggregate all commitments linked to requirement_id
 * - Update requirement.qty_allocated, qty_ordered, qty_installed
 * - Keeps legacy dashboards functional
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    // Only process PartCommitment events
    if (event?.entity_name !== 'PartCommitment') {
      return Response.json({ skipped: true, reason: 'Not a PartCommitment event' });
    }

    // Get requirement_id from current or old data (for deletes)
    const requirementId = data?.requirement_id || old_data?.requirement_id;
    
    if (!requirementId) {
      return Response.json({ skipped: true, reason: 'No requirement_id linked' });
    }

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

    // Update the requirement
    await base44.asServiceRole.entities.PartProjectRequirement.update(requirementId, {
      qty_allocated: totalAllocated,
      qty_ordered: totalOrdered,
      qty_installed: totalInstalled,
    });

    return Response.json({
      success: true,
      requirement_id: requirementId,
      aggregated: {
        qty_allocated: totalAllocated,
        qty_ordered: totalOrdered,
        qty_installed: totalInstalled,
      },
      commitment_count: commitments.length,
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});