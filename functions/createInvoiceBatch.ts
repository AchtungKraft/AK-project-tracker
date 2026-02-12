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
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { items, batch_mode = 'MANUAL', notes } = payload;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json({ 
        error: 'No items provided',
        code: 'NO_ITEMS'
      }, { status: 400 });
    }
    
    // Validate items have required fields
    const validationErrors = [];
    for (const item of items) {
      if (!item.part_id) validationErrors.push(`Item missing part_id`);
      if (!item.project_id) validationErrors.push(`Item missing project_id`);
      if (!item.unit_price || item.unit_price <= 0) {
        validationErrors.push(`Item ${item.part_name || item.part_id} missing pricing`);
      }
    }
    
    if (validationErrors.length > 0) {
      return Response.json({
        error: 'Validation failed',
        code: 'VALIDATION_FAILED',
        details: validationErrors,
      }, { status: 400 });
    }
    
    // Check for duplicates in existing queued batches
    const existingLines = await base44.entities.InvoiceBatchLine.filter({ qb_status: 'queued' });
    const duplicates = [];
    
    for (const item of items) {
      const isDuplicate = existingLines.some(el => 
        el.source_id === item.source_id && el.source_type === item.source_type
      );
      if (isDuplicate) {
        duplicates.push(item.part_name || item.part_id);
      }
    }
    
    if (duplicates.length > 0) {
      return Response.json({
        error: 'Duplicate items already queued',
        code: 'DUPLICATE_ITEMS',
        details: duplicates,
      }, { status: 400 });
    }
    
    const now = new Date().toISOString();
    const createdBatches = [];
    const createdLines = [];
    
    // Group items based on batch mode
    let groups = {};
    
    switch (batch_mode) {
      case 'BY_PROJECT':
        items.forEach(item => {
          const key = item.project_id;
          if (!groups[key]) groups[key] = { items: [], project_name: item.project_name };
          groups[key].items.push(item);
        });
        break;
        
      case 'BY_CLIENT':
        items.forEach(item => {
          const key = item.client_name || 'Unknown Client';
          if (!groups[key]) groups[key] = { items: [], client_name: key };
          groups[key].items.push(item);
        });
        break;
        
      case 'BY_MILESTONE':
        // Group by milestone if available, otherwise fall back to project
        items.forEach(item => {
          const key = item.milestone || item.project_id;
          if (!groups[key]) groups[key] = { items: [], milestone: item.milestone, project_name: item.project_name };
          groups[key].items.push(item);
        });
        break;
        
      default: // MANUAL
        groups['manual'] = { items };
    }
    
    // Create batches and lines
    for (const [groupKey, groupData] of Object.entries(groups)) {
      const batchItems = groupData.items;
      const totalAmount = batchItems.reduce((sum, i) => sum + ((i.qty || 1) * (i.unit_price || 0)), 0);
      
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
        const qty = item.qty || 1;
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
    
    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      lines_created: createdLines.length,
      batches: createdBatches,
      total_amount: createdBatches.reduce((sum, b) => sum + (b.total_amount || 0), 0),
    });
    
  } catch (error) {
    console.error('Create invoice batch error:', error);
    return Response.json({ 
      error: error.message,
      code: 'CREATE_BATCH_ERROR'
    }, { status: 500 });
  }
});