import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automation: Sync InstalledPart creation to linked PartCommitment
 * 
 * REFACTORED for Phase 2D:
 * - Uses State Engine for status calculation
 * - Improved matching priority
 * - Audit logging
 * - Concurrency protection
 * 
 * Matching priority:
 * 1. requirement_id match
 * 2. earliest partially fulfilled commitment (has room)
 * 3. commitment with largest remaining qty
 * 
 * GUARDRAIL: Does NOT modify InventoryItem - that's handled elsewhere
 */

function calculateCommitmentState(commitment) {
  const { qty_committed = 0, qty_ordered = 0, qty_received = 0, qty_allocated = 0, qty_installed = 0, qty_cancelled = 0 } = commitment;
  if (qty_cancelled >= qty_committed) return 'cancelled';
  if (qty_installed >= qty_committed) return 'installed';
  if (qty_allocated >= qty_committed) return 'allocated';
  if (qty_received >= qty_committed) return 'received';
  if (qty_received > 0) return 'partially_received';
  if (qty_ordered > 0) return 'ordered';
  return 'planned';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

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

    // Find matching commitments
    const projectCommitments = await base44.asServiceRole.entities.PartCommitment.filter({
      project_id: projectId,
      part_id: partId
    });

    // Filter out cancelled/closed
    const openCommitments = projectCommitments.filter(c => 
      !['cancelled', 'closed'].includes(c.commitment_status)
    );

    if (openCommitments.length === 0) {
      return Response.json({ 
        skipped: true, 
        reason: 'No open commitments found for this project/part',
        note: 'Legacy installation without commitment tracking'
      });
    }

    // Match priority implementation
    let targetCommitment = null;
    let matchMethod = '';

    // Priority 1: Match by requirement_id
    if (requirementId) {
      targetCommitment = openCommitments.find(c => c.requirement_id === requirementId);
      if (targetCommitment) matchMethod = 'requirement_id';
    }

    // Priority 2: Earliest partially fulfilled commitment with room
    if (!targetCommitment) {
      const withRoom = openCommitments
        .map(c => ({
          ...c,
          remaining: (c.qty_committed || 0) - (c.qty_installed || 0)
        }))
        .filter(c => c.remaining > 0)
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      
      if (withRoom.length > 0) {
        targetCommitment = withRoom[0];
        matchMethod = 'earliest_with_room';
      }
    }

    // Priority 3: Commitment with largest remaining qty
    if (!targetCommitment) {
      const byRemaining = openCommitments
        .map(c => ({
          ...c,
          remaining: (c.qty_committed || 0) - (c.qty_installed || 0)
        }))
        .sort((a, b) => b.remaining - a.remaining);
      
      if (byRemaining.length > 0) {
        targetCommitment = byRemaining[0];
        matchMethod = 'largest_remaining';
      }
    }

    // Fallback: earliest commitment
    if (!targetCommitment) {
      targetCommitment = openCommitments.sort((a, b) => 
        new Date(a.created_date) - new Date(b.created_date)
      )[0];
      matchMethod = 'earliest_fallback';
    }

    if (!targetCommitment) {
      return Response.json({ 
        skipped: true, 
        reason: 'Could not match to any commitment' 
      });
    }

    // Calculate new values
    const newInstalled = (targetCommitment.qty_installed || 0) + qtyConsumed;
    
    // Validate: qty_installed should not exceed qty_allocated
    const currentAllocated = targetCommitment.qty_allocated || 0;
    if (newInstalled > currentAllocated) {
      // Auto-adjust allocation to match (receiving/allocation may have happened differently)
      // This is a warning, not a blocker
      console.warn(`Install would exceed allocation: installed=${newInstalled}, allocated=${currentAllocated}`);
    }

    // Calculate new status using state engine
    const updatedCommitment = { ...targetCommitment, qty_installed: newInstalled };
    const newStatus = calculateCommitmentState(updatedCommitment);

    // Update with version increment
    const newVersion = (targetCommitment.commitment_version || 1) + 1;
    const hasIntegrityWarning = newInstalled > currentAllocated;

    await base44.asServiceRole.entities.PartCommitment.update(targetCommitment.id, {
      qty_installed: newInstalled,
      commitment_status: newStatus,
      commitment_version: newVersion,
      integrity_warning: hasIntegrityWarning,
      integrity_warning_details: hasIntegrityWarning 
        ? `qty_installed (${newInstalled}) exceeds qty_allocated (${currentAllocated})`
        : null
    });

    // Audit log
    await base44.asServiceRole.entities.CommitmentAuditLog.create({
      commitment_id: targetCommitment.id,
      action_type: 'qty_change',
      previous_values: {
        qty_installed: targetCommitment.qty_installed,
        commitment_status: targetCommitment.commitment_status,
        commitment_version: targetCommitment.commitment_version
      },
      new_values: {
        qty_installed: newInstalled,
        commitment_status: newStatus,
        commitment_version: newVersion,
        installed_part_id: event.entity_id,
        qty_consumed: qtyConsumed,
        match_method: matchMethod
      },
      trigger_source: 'install',
      validation_passed: !hasIntegrityWarning,
      validation_errors: hasIntegrityWarning 
        ? [`qty_installed (${newInstalled}) exceeds qty_allocated (${currentAllocated})`]
        : []
    });

    return Response.json({
      success: true,
      installed_part_id: event.entity_id,
      commitment_id: targetCommitment.id,
      match_method: matchMethod,
      qty_consumed: qtyConsumed,
      previous_installed: targetCommitment.qty_installed,
      new_installed: newInstalled,
      previous_status: targetCommitment.commitment_status,
      new_status: newStatus,
      new_version: newVersion,
      integrity_warning: hasIntegrityWarning
    });

  } catch (error) {
    console.error('Install sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});