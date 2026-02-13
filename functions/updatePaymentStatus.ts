import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9.6 — Update Payment Status
 * 
 * Centralized function for marking commitments/batches as paid or reversing payment.
 * All payment mutations MUST go through this function.
 * 
 * Actions:
 * - mark_paid: Record payment received
 * - reverse_payment: Undo payment status
 */

Deno.serve(async (req) => {
  console.log("updatePaymentStatus invoked");
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { 
      action, // 'mark_paid' | 'reverse_payment'
      batch_id,
      commitment_id,
      commitment_ids = [], // For bulk operations
      // Payment metadata (for mark_paid)
      payment_source,
      payment_method,
      payment_date,
      reference_number,
      notes,
      // Reversal metadata (for reverse_payment)
      reversal_reason,
      reversal_notes,
    } = payload;
    
    if (!action) {
      return Response.json({
        success: false,
        error: 'Action required (mark_paid or reverse_payment)',
        code: 'MISSING_ACTION',
      }, { status: 400 });
    }
    
    if (!batch_id && !commitment_id && commitment_ids.length === 0) {
      return Response.json({
        success: false,
        error: 'batch_id, commitment_id, or commitment_ids required',
        code: 'MISSING_TARGET',
      }, { status: 400 });
    }
    
    const results = {
      success: true,
      action,
      updated_commitments: [],
      updated_batches: [],
      lifecycle_events: [],
      errors: [],
    };
    
    // ========================================
    // ACTION: MARK PAID
    // ========================================
    if (action === 'mark_paid') {
      
      // Handle batch payment
      if (batch_id) {
        const batches = await base44.entities.InvoiceBatch.filter({ id: batch_id });
        const batch = batches[0];
        
        if (!batch) {
          return Response.json({
            success: false,
            error: 'Batch not found',
            code: 'BATCH_NOT_FOUND',
          }, { status: 404 });
        }
        
        // Validation
        if (batch.status === 'voided') {
          return Response.json({
            success: false,
            error: 'Cannot mark voided batch as paid',
            code: 'BATCH_VOIDED',
          }, { status: 400 });
        }
        
        if (batch.status === 'paid') {
          return Response.json({
            success: false,
            error: 'Batch already marked as paid',
            code: 'ALREADY_PAID',
          }, { status: 400 });
        }
        
        // Update batch
        await base44.entities.InvoiceBatch.update(batch_id, {
          status: 'paid',
          payment_received_at: payment_date || new Date().toISOString(),
          payment_sync_status: payment_source === 'qb_synced' ? 'synced' : 'manual',
          notes: batch.notes ? `${batch.notes}\n\nPayment: ${notes || 'Marked paid'}` : `Payment: ${notes || 'Marked paid'}`,
        });
        
        results.updated_batches.push(batch_id);
        
        // Get batch lines and update commitments
        const lines = await base44.entities.InvoiceBatchLine.filter({ batch_id });
        
        for (const line of lines) {
          if (line.commitment_id) {
            try {
              await base44.entities.PartCommitment.update(line.commitment_id, {
                billing_status: 'paid',
              });
              results.updated_commitments.push(line.commitment_id);
              
              // Create lifecycle event
              const event = await base44.entities.LifecycleEvent.create({
                commitment_id: line.commitment_id,
                event_type: 'CLIENT_PAID',
                previous_state: JSON.stringify({ billing_status: 'invoiced' }),
                new_state: JSON.stringify({ 
                  billing_status: 'paid',
                  payment_source,
                  payment_method,
                  payment_date: payment_date || new Date().toISOString(),
                  reference_number,
                }),
                trigger_source: 'USER_ACTION',
                user_id: user.id,
                part_id: line.part_id,
                project_id: line.project_id,
                notes: `Payment received via ${payment_source || 'manual entry'}. ${notes || ''}`.trim(),
              });
              results.lifecycle_events.push(event.id);
            } catch (err) {
              console.warn('Failed to update commitment:', line.commitment_id, err);
              results.errors.push({ commitment_id: line.commitment_id, error: err.message });
            }
          }
        }
      }
      
      // Handle individual commitment payment
      if (commitment_id || commitment_ids.length > 0) {
        const idsToProcess = commitment_id ? [commitment_id] : commitment_ids;
        
        for (const cid of idsToProcess) {
          try {
            const commitments = await base44.entities.PartCommitment.filter({ id: cid });
            const commitment = commitments[0];
            
            if (!commitment) {
              results.errors.push({ commitment_id: cid, error: 'Not found' });
              continue;
            }
            
            // Validation
            if (commitment.is_archived) {
              results.errors.push({ commitment_id: cid, error: 'Commitment is archived' });
              continue;
            }
            
            if (commitment.billing_status === 'paid') {
              results.errors.push({ commitment_id: cid, error: 'Already paid' });
              continue;
            }
            
            if (commitment.billing_status === 'not_billable') {
              results.errors.push({ commitment_id: cid, error: 'Not billable' });
              continue;
            }
            
            // Update commitment
            await base44.entities.PartCommitment.update(cid, {
              billing_status: 'paid',
            });
            results.updated_commitments.push(cid);
            
            // Create lifecycle event
            const event = await base44.entities.LifecycleEvent.create({
              commitment_id: cid,
              event_type: 'CLIENT_PAID',
              previous_state: JSON.stringify({ billing_status: commitment.billing_status }),
              new_state: JSON.stringify({ 
                billing_status: 'paid',
                payment_source,
                payment_method,
                payment_date: payment_date || new Date().toISOString(),
                reference_number,
              }),
              trigger_source: 'USER_ACTION',
              user_id: user.id,
              part_id: commitment.part_id,
              project_id: commitment.project_id,
              notes: `Payment received via ${payment_source || 'manual entry'}. ${notes || ''}`.trim(),
            });
            results.lifecycle_events.push(event.id);
          } catch (err) {
            console.warn('Failed to process commitment:', cid, err);
            results.errors.push({ commitment_id: cid, error: err.message });
          }
        }
      }
      
      results.message = `Payment recorded for ${results.updated_commitments.length} commitment(s)`;
    }
    
    // ========================================
    // ACTION: REVERSE PAYMENT
    // ========================================
    else if (action === 'reverse_payment') {
      
      if (!reversal_reason) {
        return Response.json({
          success: false,
          error: 'Reversal reason required',
          code: 'MISSING_REVERSAL_REASON',
        }, { status: 400 });
      }
      
      // Handle batch payment reversal
      if (batch_id) {
        const batches = await base44.entities.InvoiceBatch.filter({ id: batch_id });
        const batch = batches[0];
        
        if (!batch) {
          return Response.json({
            success: false,
            error: 'Batch not found',
            code: 'BATCH_NOT_FOUND',
          }, { status: 404 });
        }
        
        if (batch.status !== 'paid') {
          return Response.json({
            success: false,
            error: 'Batch is not marked as paid',
            code: 'NOT_PAID',
          }, { status: 400 });
        }
        
        // Check for downstream blockers
        const lines = await base44.entities.InvoiceBatchLine.filter({ batch_id });
        
        for (const line of lines) {
          if (line.commitment_id) {
            // Check if vendor payment exists
            const commitments = await base44.entities.PartCommitment.filter({ id: line.commitment_id });
            const commitment = commitments[0];
            
            if (commitment) {
              // Check if parts are installed
              const installed = await base44.entities.InstalledPart.filter({ commitment_id: line.commitment_id });
              if (installed.length > 0) {
                // Check if project is closed - get project
                const projects = await base44.entities.Project.filter({ id: commitment.project_id });
                const project = projects[0];
                if (project?.status_id) {
                  // We allow reversal even with installation, but warn
                  console.log('Warning: Reversing payment on installed commitment:', line.commitment_id);
                }
              }
            }
          }
        }
        
        // Update batch status back to invoiced
        await base44.entities.InvoiceBatch.update(batch_id, {
          status: 'invoiced',
          payment_received_at: null,
          payment_sync_status: 'pending',
          notes: batch.notes ? `${batch.notes}\n\nPayment REVERSED: ${reversal_reason}. ${reversal_notes || ''}` : `Payment REVERSED: ${reversal_reason}`,
        });
        
        results.updated_batches.push(batch_id);
        
        // Revert commitment billing status
        for (const line of lines) {
          if (line.commitment_id) {
            try {
              await base44.entities.PartCommitment.update(line.commitment_id, {
                billing_status: 'invoiced', // Back to invoiced, not billable
              });
              results.updated_commitments.push(line.commitment_id);
              
              // Create lifecycle event
              const event = await base44.entities.LifecycleEvent.create({
                commitment_id: line.commitment_id,
                event_type: 'CLIENT_PAYMENT_REVERSED',
                previous_state: JSON.stringify({ billing_status: 'paid' }),
                new_state: JSON.stringify({ 
                  billing_status: 'invoiced',
                  reversal_reason,
                }),
                trigger_source: 'USER_ACTION',
                user_id: user.id,
                part_id: line.part_id,
                project_id: line.project_id,
                notes: `Payment reversed: ${reversal_reason}. ${reversal_notes || ''}`.trim(),
              });
              results.lifecycle_events.push(event.id);
            } catch (err) {
              console.warn('Failed to revert commitment:', line.commitment_id, err);
              results.errors.push({ commitment_id: line.commitment_id, error: err.message });
            }
          }
        }
      }
      
      // Handle individual commitment reversal
      if (commitment_id || commitment_ids.length > 0) {
        const idsToProcess = commitment_id ? [commitment_id] : commitment_ids;
        
        for (const cid of idsToProcess) {
          try {
            const commitments = await base44.entities.PartCommitment.filter({ id: cid });
            const commitment = commitments[0];
            
            if (!commitment) {
              results.errors.push({ commitment_id: cid, error: 'Not found' });
              continue;
            }
            
            if (commitment.billing_status !== 'paid') {
              results.errors.push({ commitment_id: cid, error: 'Not paid' });
              continue;
            }
            
            // Determine what status to revert to
            // If it was in a batch, go back to invoiced; otherwise go back to billable
            const batchLines = await base44.entities.InvoiceBatchLine.filter({ commitment_id: cid });
            const revertStatus = batchLines.length > 0 ? 'invoiced' : 'billable';
            
            await base44.entities.PartCommitment.update(cid, {
              billing_status: revertStatus,
            });
            results.updated_commitments.push(cid);
            
            // Create lifecycle event
            const event = await base44.entities.LifecycleEvent.create({
              commitment_id: cid,
              event_type: 'CLIENT_PAYMENT_REVERSED',
              previous_state: JSON.stringify({ billing_status: 'paid' }),
              new_state: JSON.stringify({ 
                billing_status: revertStatus,
                reversal_reason,
              }),
              trigger_source: 'USER_ACTION',
              user_id: user.id,
              part_id: commitment.part_id,
              project_id: commitment.project_id,
              notes: `Payment reversed: ${reversal_reason}. ${reversal_notes || ''}`.trim(),
            });
            results.lifecycle_events.push(event.id);
          } catch (err) {
            console.warn('Failed to reverse commitment payment:', cid, err);
            results.errors.push({ commitment_id: cid, error: err.message });
          }
        }
      }
      
      results.message = `Payment reversed for ${results.updated_commitments.length} commitment(s)`;
    }
    
    else {
      return Response.json({
        success: false,
        error: 'Invalid action. Use mark_paid or reverse_payment',
        code: 'INVALID_ACTION',
      }, { status: 400 });
    }
    
    // Final result
    results.success = results.errors.length === 0;
    
    return Response.json(results);
    
  } catch (error) {
    console.error('Update payment status error:', error);
    return Response.json({ 
      success: false,
      error: error.message,
      code: 'PAYMENT_UPDATE_ERROR',
    }, { status: 500 });
  }
});