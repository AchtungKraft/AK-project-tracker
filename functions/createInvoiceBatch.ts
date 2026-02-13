import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 6 — Create Invoice Batch
 * 
 * Creates invoice batches with support for multiple batching modes:
 * - MANUAL: Single batch with selected items
 * - BY_PROJECT: Split into batches per project
 * - BY_CLIENT: Split into batches per client
 * - BY_MILESTONE: Split by milestone/phase (if available)
 */

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
    const { items, batch_mode = 'MANUAL', notes } = payload;
    
    console.log("Incoming items count:", items?.length || 0);
    console.log("Batch mode:", batch_mode);
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json({ 
        success: false,
        error: 'No items selected for invoicing',
        code: 'NO_ITEMS',
        blocked_items: [],
        message: 'Please select at least one item to create an invoice batch.'
      }, { status: 400 });
    }
    
    // Validate items and collect blocked items
    const blockedItems = [];
    const validItems = [];
    
    for (const item of items) {
      const blockReasons = [];
      
      if (!item.part_id) {
        blockReasons.push('Missing part_id');
      }
      if (!item.project_id) {
        blockReasons.push('Missing project_id');
      }
      
      // Accept either unit_price or unit_retail
      const unitPrice = item.unit_price || item.unit_retail || 0;
      if (unitPrice <= 0) {
        blockReasons.push('Missing retail pricing');
      }
      
      // Check financial role
      if (item.financial_role === 'NON_BILLABLE') {
        blockReasons.push('Part is non-billable');
      }
      
      // Check part type for client-supplied (Phase 9.6)
      if (item.effective_part_type === 'CLIENT_SUPPLIED' && item.requires_client_billing === false) {
        blockReasons.push('Client-supplied part not billable');
      }
      
      // Check if archived (Phase 9.6)
      if (item.is_archived) {
        blockReasons.push('Part is archived');
      }
      
      // Check billing status - already invoiced/paid (Phase 9.6 duplication safety)
      if (item.billing_status === 'invoiced' || item.billing_status === 'paid') {
        blockReasons.push('Already invoiced or paid');
      }
      
      if (blockReasons.length > 0) {
        blockedItems.push({
          commitment_id: item.commitment_id || item.id,
          part_name: item.part_name || 'Unknown',
          project_name: item.project_name || 'Unknown',
          reasons: blockReasons,
          lifecycle_stage: item.client_billing_status || item.lifecycle_stage,
        });
      } else {
        // Normalize item with unit_price
        validItems.push({
          ...item,
          unit_price: unitPrice,
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
    
    // Filter out duplicates from validItems
    const finalItems = [];
    for (const item of validItems) {
      const isDuplicate = existingLines.some(el => 
        (el.source_id === item.source_id && el.source_type === item.source_type) ||
        (el.commitment_id && el.commitment_id === item.commitment_id)
      );
      if (isDuplicate) {
        blockedItems.push({
          commitment_id: item.commitment_id || item.id,
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
    
    // Group items based on batch mode (use finalItems)
    let groups = {};
    
    switch (batch_mode) {
      case 'BY_PROJECT':
        finalItems.forEach(item => {
          const key = item.project_id;
          if (!groups[key]) groups[key] = { items: [], project_name: item.project_name };
          groups[key].items.push(item);
        });
        break;
        
      case 'BY_CLIENT':
        finalItems.forEach(item => {
          const key = item.client_name || 'Unknown Client';
          if (!groups[key]) groups[key] = { items: [], client_name: key };
          groups[key].items.push(item);
        });
        break;
        
      case 'BY_MILESTONE':
        // Group by milestone if available, otherwise fall back to project
        finalItems.forEach(item => {
          const key = item.milestone || item.project_id;
          if (!groups[key]) groups[key] = { items: [], milestone: item.milestone, project_name: item.project_name };
          groups[key].items.push(item);
        });
        break;
        
      default: // MANUAL
        groups['manual'] = { items: finalItems };
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
    for (const line of createdLines) {
      if (line.commitment_id) {
        try {
          await base44.entities.PartCommitment.update(line.commitment_id, {
            billing_status: 'invoiced',
          });
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