import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9.6 — Void Invoice Batch
 * 
 * Safely voids an invoice batch with proper validation:
 * - Cannot void already-voided batches
 * - Cannot void exported batches without confirmation
 * - Reverts commitment billing status
 */

Deno.serve(async (req) => {
  console.log("voidInvoiceBatch invoked");
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { batch_id, reason, force = false } = payload;
    
    if (!batch_id) {
      return Response.json({
        success: false,
        error: 'Batch ID required',
        code: 'MISSING_BATCH_ID',
      }, { status: 400 });
    }
    
    // Fetch batch
    const batches = await base44.entities.InvoiceBatch.filter({ id: batch_id });
    const batch = batches[0];
    
    if (!batch) {
      return Response.json({
        success: false,
        error: 'Batch not found',
        code: 'BATCH_NOT_FOUND',
      }, { status: 404 });
    }
    
    // Validation: Already voided
    if (batch.status === 'voided') {
      return Response.json({
        success: false,
        error: 'Batch is already voided',
        code: 'ALREADY_VOIDED',
      }, { status: 400 });
    }
    
    // Validation: Cannot void exported without force
    if (batch.status === 'exported' && !force) {
      return Response.json({
        success: false,
        error: 'Cannot void exported batch without confirmation',
        code: 'EXPORTED_BATCH_REQUIRES_FORCE',
        requires_confirmation: true,
        message: 'This batch has been exported to QuickBooks. Voiding will not automatically void the QB invoice. Are you sure?',
      }, { status: 400 });
    }
    
    // Validation: Cannot void paid batches
    if (batch.status === 'paid') {
      return Response.json({
        success: false,
        error: 'Cannot void a paid batch',
        code: 'CANNOT_VOID_PAID',
        message: 'This batch has been marked as paid. Please process a refund instead.',
      }, { status: 400 });
    }
    
    // Fetch batch lines
    const lines = await base44.entities.InvoiceBatchLine.filter({ batch_id });
    
    // Revert commitment billing status for each line
    const revertedCommitments = [];
    for (const line of lines) {
      if (line.commitment_id) {
        try {
          await base44.entities.PartCommitment.update(line.commitment_id, {
            billing_status: 'billable', // Reset to billable
          });
          revertedCommitments.push(line.commitment_id);
          
          // Create lifecycle event
          await base44.entities.LifecycleEvent.create({
            commitment_id: line.commitment_id,
            event_type: 'BILLING_STATUS_CHANGED',
            previous_state: JSON.stringify({ billing_status: 'invoiced' }),
            new_state: JSON.stringify({ billing_status: 'billable' }),
            trigger_source: 'USER_ACTION',
            user_id: user.id,
            part_id: line.part_id,
            project_id: line.project_id,
            notes: `Batch ${batch.batch_name} voided: ${reason || 'No reason provided'}`,
          });
        } catch (err) {
          console.warn('Failed to revert commitment:', line.commitment_id, err);
        }
      }
      
      // Update line QB status
      try {
        await base44.entities.InvoiceBatchLine.update(line.id, {
          qb_status: 'voided',
          error_message: `Batch voided: ${reason || 'No reason provided'}`,
        });
      } catch (err) {
        console.warn('Failed to update line status:', line.id, err);
      }
    }
    
    // Update batch status
    await base44.entities.InvoiceBatch.update(batch_id, {
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: user.email,
      void_reason: reason || 'No reason provided',
    });
    
    return Response.json({
      success: true,
      batch_id,
      batch_name: batch.batch_name,
      reverted_commitments: revertedCommitments.length,
      message: `Batch "${batch.batch_name}" has been voided. ${revertedCommitments.length} commitment(s) reverted to billable.`,
    });
    
  } catch (error) {
    console.error('Void invoice batch error:', error);
    return Response.json({ 
      success: false,
      error: error.message,
      code: 'VOID_ERROR',
    }, { status: 500 });
  }
});