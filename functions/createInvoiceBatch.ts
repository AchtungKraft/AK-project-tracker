import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 6 — Create Invoice Batch
 * Phase 6.1 — Invoice Readiness Gate (centralized logic)
 * 
 * Creates invoice batches with support for multiple batching modes:
 * - MANUAL: Single batch with selected items
 * - BY_PROJECT: Split into batches per project
 * - BY_CLIENT: Split into batches per client
 * - BY_MILESTONE: Split by milestone/phase (if available)
 * 
 * Invoice Readiness Criteria (isInvoiceReady):
 * 1. qty > 0
 * 2. Has retail price (unit_retail, unit_retail_override, or unit_price)
 * 3. Not already invoiced/paid (billing_status)
 * 4. Not linked to existing InvoiceBatchLine
 * 5. Not archived
 * 6. Not NON_BILLABLE financial role
 */

/**
 * Centralized Invoice Readiness Check
 * Single source of truth for determining if an item can be invoiced
 */
function isInvoiceReady(item) {
  const reasons = [];
  
  // 1. Check required identifiers
  if (!item.part_id) {
    reasons.push('Missing part_id');
  }
  if (!item.project_id) {
    reasons.push('Missing project_id');
  }

  // 2. Check quantity > 0
  const qty = item.assigned_qty || item.qty || item.required_total || 0;
  if (qty <= 0) {
    reasons.push('Quantity must be greater than 0');
  }
  
  // 3. Check retail pricing exists
  const unitPrice = item.unit_price || item.unit_retail || item.unit_retail_override || 0;
  if (unitPrice <= 0) {
    reasons.push('Missing retail pricing');
  }
  
  // 4. Check financial role (non-billable)
  if (item.financial_role === 'NON_BILLABLE') {
    reasons.push('Part is non-billable');
  }
  
  // 5. Check part type for client-supplied
  if (item.effective_part_type === 'CLIENT_SUPPLIED' && item.requires_client_billing === false) {
    reasons.push('Client-supplied part not billable');
  }
  
  // 6. Check archived status
  if (item.is_archived) {
    reasons.push('Part is archived');
  }
  
  // 7. Check billing status - already invoiced/paid
  if (item.billing_status === 'invoiced' || item.billing_status === 'paid') {
    reasons.push('Already invoiced or paid');
  }
  
  // 8. Check if already linked to InvoiceBatchLine
  if (item.invoice_batch_line_id) {
    reasons.push('Already linked to an invoice batch');
  }
  
  return {
    ready: reasons.length === 0,
    reasons,
    effective_unit_price: unitPrice,
  };
}

function generateBatchName(mode, groupKey, timestamp) {
  const dateStr = new Date(timestamp).toISOString().split('T')[0];
  switch (mode) {
    case 'BY_PROJECT':
      return `INV-${groupKey}-${dateStr}`;
    case 'BY_CLIENT':
      return `INV-CLIENT-${groupKey}-${dateStr}`;
    case 'BY_MILESTONE':
      return `INV-MILE-${groupKey}-${dateStr}`;
    default:
      return `INV-MANUAL-${dateStr}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }
}

Deno.serve(async (req) => {
  console.log("createInvoiceBatch invoked");
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { items, batch_mode = 'MANUAL', notes, target_batch_id } = payload;
    
    console.log("Incoming items count:", items?.length || 0);
    console.log("Batch mode:", batch_mode);
    console.log("Target batch ID:", target_batch_id || 'NEW');
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json({ 
        success: false,
        error: 'No items selected for invoicing',
        code: 'NO_ITEMS',
        blocked_items: [],
        message: 'Please select at least one item to create an invoice batch.'
      }, { status: 400 });
    }
    
    // CANONICAL: Validate items using centralized isInvoiceReady helper
    // All items MUST have commitment_id - fail fast if missing
    const blockedItems = [];
    const validItems = [];
    
    for (const item of items) {
      // CANONICAL: Verify required fields exist
      if (!item.commitment_id) {
        console.error('[CANONICAL VIOLATION] Item missing commitment_id:', JSON.stringify(item));
        blockedItems.push({
          commitment_id: 'MISSING',
          part_name: item.part_name || 'Unknown',
          project_name: item.project_name || 'Unknown',
          reasons: ['Missing commitment_id - cannot process'],
          lifecycle_stage: item.client_billing_status || item.lifecycle_stage,
        });
        continue;
      }
      
      const readiness = isInvoiceReady(item);
      
      if (!readiness.ready) {
        blockedItems.push({
          commitment_id: item.commitment_id,
          part_name: item.part_name || 'Unknown',
          project_name: item.project_name || 'Unknown',
          reasons: readiness.reasons,
          lifecycle_stage: item.client_billing_status || item.lifecycle_stage,
        });
      } else {
        // Normalize item with effective unit_price
        validItems.push({
          ...item,
          unit_price: readiness.effective_unit_price,
        });
      }
    }
    
    // Return early if ALL items are blocked
    if (validItems.length === 0) {
      return Response.json({
        success: false,
        error: 'All items blocked from invoicing',
        code: 'ALL_ITEMS_BLOCKED',
        blocked_items: blockedItems,
        message: `${blockedItems.length} item(s) cannot be invoiced. Check pricing and billing status.`,
      }, { status: 400 });
    }
    
    // Check for duplicates in existing queued batches
    let existingLines = [];
    try {
      existingLines = await base44.entities.InvoiceBatchLine.filter({ qb_status: 'queued' });
    } catch (e) {
      console.warn('Could not fetch existing lines:', e);
    }
    
    // CANONICAL: Filter out duplicates from validItems using commitment_id
    const finalItems = [];
    for (const item of validItems) {
      const isDuplicate = existingLines.some(el => 
        el.commitment_id && el.commitment_id === item.commitment_id
      );
      if (isDuplicate) {
        blockedItems.push({
          commitment_id: item.commitment_id,
          part_name: item.part_name || 'Unknown',
          project_name: item.project_name || 'Unknown',
          reasons: ['Already queued in another batch'],
          lifecycle_stage: item.client_billing_status,
        });
      } else {
        finalItems.push(item);
      }
    }
    
    // Check again if all items now blocked
    if (finalItems.length === 0) {
      return Response.json({
        success: false,
        error: 'All items already queued or blocked',
        code: 'ALL_ITEMS_BLOCKED',
        blocked_items: blockedItems,
        message: 'All selected items are either already queued or cannot be invoiced.',
      }, { status: 400 });
    }
    
    const now = new Date().toISOString();
    const createdBatches = [];
    const createdLines = [];
    
    // Phase 6.2: Check for target draft batch accumulation
    if (target_batch_id) {
      console.log("Accumulating to existing draft batch:", target_batch_id);
      
      // Fetch and validate target batch
      const targetBatches = await base44.entities.InvoiceBatch.filter({ id: target_batch_id });
      const targetBatch = targetBatches[0];
      
      if (!targetBatch) {
        return Response.json({
          success: false,
          error: 'Target batch not found',
          code: 'BATCH_NOT_FOUND',
          message: 'The selected draft invoice no longer exists.',
        }, { status: 400 });
      }
      
      if (targetBatch.status !== 'draft') {
        return Response.json({
          success: false,
          error: 'Target batch is not a draft',
          code: 'BATCH_NOT_DRAFT',
          message: 'Can only add lines to draft invoices.',
        }, { status: 400 });
      }
      
      if (targetBatch.is_locked) {
        return Response.json({
          success: false,
          error: 'Target batch is locked',
          code: 'BATCH_LOCKED',
          message: 'This draft invoice is locked and cannot be modified.',
        }, { status: 400 });
      }
      
      // Check for duplicates - commitment_id already in this batch
      const existingLines = await base44.entities.InvoiceBatchLine.filter({ batch_id: target_batch_id });
      const existingCommitmentIds = new Set(existingLines.filter(l => l.commitment_id).map(l => l.commitment_id));
      
      // Phase 6.2B: Check if commitment is linked to ANY non-draft batch
      const allBatchLines = await base44.entities.InvoiceBatchLine.filter({});
      const allBatches = await base44.entities.InvoiceBatch.filter({});
      const nonDraftBatchIds = new Set(allBatches.filter(b => b.status !== 'draft').map(b => b.id));
      
      // Build a set of commitment_ids that are already in non-draft batches
      const alreadyInvoicedCommitmentIds = new Set();
      for (const line of allBatchLines) {
        if (line.commitment_id && nonDraftBatchIds.has(line.batch_id)) {
          alreadyInvoicedCommitmentIds.add(line.commitment_id);
        }
      }
      
      const itemsToAdd = [];
      for (const item of finalItems) {
        // Phase 6.2B: Block if already in a non-draft batch
        if (item.commitment_id && alreadyInvoicedCommitmentIds.has(item.commitment_id)) {
          blockedItems.push({
            commitment_id: item.commitment_id,
            part_name: item.part_name || 'Unknown',
            project_name: item.project_name || 'Unknown',
            reasons: ['Commitment already invoiced'],
            code: 'ALREADY_INVOICED',
          });
          continue;
        }
        
        if (item.commitment_id && existingCommitmentIds.has(item.commitment_id)) {
          blockedItems.push({
            commitment_id: item.commitment_id,
            part_name: item.part_name || 'Unknown',
            project_name: item.project_name || 'Unknown',
            reasons: ['Already in this invoice batch'],
          });
        } else {
          itemsToAdd.push(item);
        }
      }
      
      if (itemsToAdd.length === 0) {
        return Response.json({
          success: false,
          error: 'All items already in batch or blocked',
          code: 'ALL_ITEMS_BLOCKED',
          blocked_items: blockedItems,
          message: 'All selected items are either already in this invoice or cannot be added.',
        }, { status: 400 });
      }
      
      // Add lines to existing batch
      let addedTotal = 0;
      for (const item of itemsToAdd) {
        const qty = item.assigned_qty || item.qty || 1;
        const unitPrice = item.unit_price || 0;
        const lineTotal = qty * unitPrice;
        addedTotal += lineTotal;
        
        const line = await base44.entities.InvoiceBatchLine.create({
          batch_id: target_batch_id,
          project_id: item.project_id,
          part_id: item.part_id,
          commitment_id: item.commitment_id || null,
          qty,
          unit_price: unitPrice,
          line_total: lineTotal,
          description: `${item.part_name}${item.part_number ? ` (${item.part_number})` : ''}`,
          financial_role: item.financial_role,
          source_type: item.source_type || 'installed_part',
          source_id: item.source_id || item.id,
          qb_status: 'queued',
        });
        
        createdLines.push(line);
      }
      
      // Update batch totals
      const newTotal = (targetBatch.total_amount || 0) + addedTotal;
      const newLineCount = (targetBatch.line_count || 0) + itemsToAdd.length;
      
      await base44.entities.InvoiceBatch.update(target_batch_id, {
        total_amount: newTotal,
        line_count: newLineCount,
      });
      
      // Fetch updated batch
      const updatedBatches = await base44.entities.InvoiceBatch.filter({ id: target_batch_id });
      createdBatches.push(updatedBatches[0] || targetBatch);
      
      // Log lifecycle events for added lines
      for (const line of createdLines) {
        if (line.commitment_id) {
          try {
            await base44.entities.LifecycleEvent.create({
              commitment_id: line.commitment_id,
              event_type: 'CLIENT_INVOICED',
              trigger_source: 'INVOICE_BATCH',
              user_id: user.id,
              part_id: line.part_id,
              project_id: line.project_id,
              notes: `Added to batch ${targetBatch.batch_name || target_batch_id}`,
            });
          } catch (eventErr) {
            console.warn('Failed to create lifecycle event:', eventErr);
          }
        }
      }
      
      return Response.json({
        success: true,
        batches_created: 0,
        batches_updated: 1,
        lines_created: createdLines.length,
        batches: createdBatches,
        batch_id: target_batch_id,
        batch_name: targetBatch.batch_name,
        total_amount: newTotal,
        blocked_items: blockedItems,
        message: blockedItems.length > 0 
          ? `Added ${createdLines.length} lines to existing invoice. ${blockedItems.length} item(s) were blocked.`
          : `Successfully added ${createdLines.length} lines to existing invoice.`,
      });
    }
    
    // Phase 6.2B: Check if any commitment is linked to a non-draft batch (for new batch creation)
    const allBatchLinesForNew = await base44.entities.InvoiceBatchLine.filter({});
    const allBatchesForNew = await base44.entities.InvoiceBatch.filter({});
    const nonDraftBatchIdsForNew = new Set(allBatchesForNew.filter(b => b.status !== 'draft').map(b => b.id));
    
    const alreadyInvoicedForNew = new Set();
    for (const line of allBatchLinesForNew) {
      if (line.commitment_id && nonDraftBatchIdsForNew.has(line.batch_id)) {
        alreadyInvoicedForNew.add(line.commitment_id);
      }
    }
    
    // Filter out already-invoiced commitments
    const safeItems = [];
    for (const item of finalItems) {
      if (item.commitment_id && alreadyInvoicedForNew.has(item.commitment_id)) {
        blockedItems.push({
          commitment_id: item.commitment_id,
          part_name: item.part_name || 'Unknown',
          project_name: item.project_name || 'Unknown',
          reasons: ['Commitment already invoiced'],
          code: 'ALREADY_INVOICED',
        });
      } else {
        safeItems.push(item);
      }
    }
    
    if (safeItems.length === 0) {
      return Response.json({
        success: false,
        error: 'All items already invoiced or blocked',
        code: 'ALL_ITEMS_BLOCKED',
        blocked_items: blockedItems,
        message: 'All selected items are already invoiced in finalized batches.',
      }, { status: 400 });
    }
    
    // Group items based on batch mode (use safeItems instead of finalItems)
    let groups = {};
    
    switch (batch_mode) {
      case 'BY_PROJECT':
        safeItems.forEach(item => {
          const key = item.project_id;
          if (!groups[key]) groups[key] = { items: [], project_name: item.project_name };
          groups[key].items.push(item);
        });
        break;
        
      case 'BY_CLIENT':
        safeItems.forEach(item => {
          const key = item.client_name || 'Unknown Client';
          if (!groups[key]) groups[key] = { items: [], client_name: key };
          groups[key].items.push(item);
        });
        break;
        
      case 'BY_MILESTONE':
        // Group by milestone if available, otherwise fall back to project
        safeItems.forEach(item => {
          const key = item.milestone || item.project_id;
          if (!groups[key]) groups[key] = { items: [], milestone: item.milestone, project_name: item.project_name };
          groups[key].items.push(item);
        });
        break;
        
      default: // MANUAL
        groups['manual'] = { items: safeItems };
    }
    
    // Create batches and lines
    for (const [groupKey, groupData] of Object.entries(groups)) {
      const batchItems = groupData.items;
      const totalAmount = batchItems.reduce((sum, i) => sum + ((i.assigned_qty || i.qty || 1) * (i.unit_price || 0)), 0);
      
      // Create batch
      const batch = await base44.entities.InvoiceBatch.create({
        batch_name: generateBatchName(batch_mode, groupData.project_name || groupData.client_name || groupKey, now),
        batch_mode,
        status: 'draft',
        total_amount: totalAmount,
        line_count: batchItems.length,
        project_id: batch_mode === 'BY_PROJECT' ? groupKey : null,
        client_name: batch_mode === 'BY_CLIENT' ? groupKey : null,
        notes: notes || null,
      });
      
      createdBatches.push(batch);
      
      // Create line items
      for (const item of batchItems) {
        const qty = item.assigned_qty || item.qty || 1;
        const unitPrice = item.unit_price || 0;
        
        const line = await base44.entities.InvoiceBatchLine.create({
          batch_id: batch.id,
          project_id: item.project_id,
          part_id: item.part_id,
          commitment_id: item.commitment_id || null,
          qty,
          unit_price: unitPrice,
          line_total: qty * unitPrice,
          description: `${item.part_name}${item.part_number ? ` (${item.part_number})` : ''}`,
          financial_role: item.financial_role,
          source_type: item.source_type || 'installed_part',
          source_id: item.source_id || item.id,
          qb_status: 'queued',
        });
        
        createdLines.push(line);
      }
    }
    
    // Update commitment billing status for created lines
    // FORWARD MODEL: Skip billing_status writes - derive from InvoiceBatch instead
    for (const line of createdLines) {
      if (line.commitment_id) {
        try {
          // Fetch commitment to get project
          const commitments = await base44.entities.PartCommitment.filter({ id: line.commitment_id });
          const commitment = commitments[0];
          
          if (commitment) {
            // Fetch project to check financial model version
            const projects = await base44.entities.Project.filter({ id: commitment.project_id });
            const project = projects[0];
            const isForwardModel = project?.financial_model_version === 'forward';
            
            if (!isForwardModel) {
              // LEGACY: Write billing_status to commitment
              await base44.entities.PartCommitment.update(line.commitment_id, {
                billing_status: 'invoiced',
              });
            }
            // FORWARD: billing_status derived from InvoiceBatch.status - no write needed
          }
        } catch (updateErr) {
          console.warn('Failed to update commitment billing status:', updateErr);
        }
      }
    }

    // Log lifecycle events
    for (const line of createdLines) {
      if (line.commitment_id) {
        try {
          await base44.entities.LifecycleEvent.create({
            commitment_id: line.commitment_id,
            event_type: 'CLIENT_INVOICED',
            trigger_source: 'INVOICE_BATCH',
            user_id: user.id,
            part_id: line.part_id,
            project_id: line.project_id,
            notes: `Added to batch ${createdBatches[0]?.batch_name || 'unknown'}`,
          });
        } catch (eventErr) {
          console.warn('Failed to create lifecycle event:', eventErr);
        }
      }
    }

    const response = {
      success: true,
      batches_created: createdBatches.length,
      lines_created: createdLines.length,
      batches: createdBatches,
      batch_id: createdBatches[0]?.id || null,
      batch_name: createdBatches[0]?.batch_name || null,
      total_amount: createdBatches.reduce((sum, b) => sum + (b.total_amount || 0), 0),
      blocked_items: blockedItems,
      message: blockedItems.length > 0 
        ? `Created ${createdBatches.length} batch(es) with ${createdLines.length} lines. ${blockedItems.length} item(s) were blocked.`
        : `Successfully created ${createdBatches.length} batch(es) with ${createdLines.length} lines.`,
    };
    
    console.log("Batch creation success:", response.message);
    return Response.json(response);
    
  } catch (error) {
    console.error('Create invoice batch error:', error);
    return Response.json({ 
      success: false,
      error: error.message,
      code: 'CREATE_BATCH_ERROR',
      blocked_items: [],
      message: `Failed to create batch: ${error.message}`,
    }, { status: 500 });
  }
});