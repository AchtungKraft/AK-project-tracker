import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automation: Sync InstalledPart creation to linked PartCommitment
 * 
 * Trigger: InstalledPart CREATE
 * 
 * Matching priority:
 * 1. requirement_id match
 * 2. project_id + part_id open commitment
 * 3. earliest non-closed commitment
 * 
 * GUARDRAIL: Does NOT modify InventoryItem - that's handled elsewhere
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // Only process InstalledPart creates
    if (event?.entity_name !== 'InstalledPart' || event?.type !== 'create') {
      return Response.json({ skipped: true, reason: 'Not an InstalledPart create' });
    }

    const installedPart = data;
    const qtyConsumed = installedPart.qty_consumed || 1;
    const projectId = installedPart.project_id;
    const partId = installedPart.part_id;
    const requirementId = installedPart.requirement_id;

    if (!projectId || !partId) {
      return Response.json({ skipped: true, reason: 'Missing project_id or part_id' });
    }

    // Find matching commitment using priority order
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.filter({
      project_id: projectId,
      part_id: partId,
    });

    // Filter out cancelled/closed
    const openCommitments = allCommitments.filter(c => 
      !['cancelled', 'closed'].includes(c.commitment_status)
    );

    if (openCommitments.length === 0) {
      return Response.json({ 
        skipped: true, 
        reason: 'No open commitments found for this project/part',
        note: 'Legacy installation without commitment tracking'
      });
    }

    // Priority 1: Match by requirement_id
    let targetCommitment = null;
    if (requirementId) {
      targetCommitment = openCommitments.find(c => c.requirement_id === requirementId);
    }

    // Priority 2: Find commitment with room for more installs
    if (!targetCommitment) {
      targetCommitment = openCommitments.find(c => {
        const remaining = (c.qty_committed || 0) - (c.qty_installed || 0);
        return remaining > 0;
      });
    }

    // Priority 3: Earliest commitment (by created_date)
    if (!targetCommitment) {
      targetCommitment = openCommitments.sort((a, b) => 
        new Date(a.created_date) - new Date(b.created_date)
      )[0];
    }

    if (!targetCommitment) {
      return Response.json({ 
        skipped: true, 
        reason: 'Could not match to any commitment' 
      });
    }

    // Update commitment
    const newInstalled = (targetCommitment.qty_installed || 0) + qtyConsumed;
    const qtyCommitted = targetCommitment.qty_committed || 0;
    
    // Determine new status
    let newStatus = targetCommitment.commitment_status;
    if (newInstalled >= qtyCommitted && qtyCommitted > 0) {
      newStatus = 'installed';
    } else if (newInstalled > 0) {
      newStatus = 'installed'; // Partial install still shows as installed status
    }

    await base44.asServiceRole.entities.PartCommitment.update(targetCommitment.id, {
      qty_installed: newInstalled,
      commitment_status: newStatus,
    });

    return Response.json({
      success: true,
      installed_part_id: event.entity_id,
      commitment_id: targetCommitment.id,
      qty_consumed: qtyConsumed,
      new_qty_installed: newInstalled,
      new_status: newStatus,
    });

  } catch (error) {
    console.error('Install sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});