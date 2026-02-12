import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 6 — Export Invoice Batch to QuickBooks (Stub)
 * 
 * This is a stub implementation that:
 * - Validates batch lines
 * - Updates qb_status on lines
 * - Sets batch status to exported
 * 
 * Actual QB integration would require QB API credentials and implementation.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { batch_id } = payload;
    
    if (!batch_id) {
      return Response.json({ 
        error: 'batch_id is required',
        code: 'MISSING_BATCH_ID'
      }, { status: 400 });
    }
    
    // Fetch batch
    const batches = await base44.entities.InvoiceBatch.filter({ id: batch_id });
    const batch = batches[0];
    
    if (!batch) {
      return Response.json({ 
        error: 'Batch not found',
        code: 'BATCH_NOT_FOUND'
      }, { status: 404 });
    }
    
    if (batch.status === 'exported' || batch.status === 'invoiced') {
      return Response.json({ 
        error: 'Batch already exported',
        code: 'ALREADY_EXPORTED'
      }, { status: 400 });
    }
    
    if (batch.status === 'voided') {
      return Response.json({ 
        error: 'Cannot export voided batch',
        code: 'BATCH_VOIDED'
      }, { status: 400 });
    }
    
    // Fetch batch lines
    const lines = await base44.entities.InvoiceBatchLine.filter({ batch_id });
    
    if (lines.length === 0) {
      return Response.json({ 
        error: 'Batch has no lines',
        code: 'NO_LINES'
      }, { status: 400 });
    }
    
    // Validate all lines have pricing
    const invalidLines = lines.filter(l => !l.unit_price || l.unit_price <= 0);
    if (invalidLines.length > 0) {
      return Response.json({
        error: 'Some lines missing pricing',
        code: 'MISSING_PRICING',
        details: invalidLines.map(l => l.description || l.part_id),
      }, { status: 400 });
    }
    
    // Build QB export payload (for future use)
    const exportPayload = {
      customer_name: batch.client_name || 'Unknown Client',
      invoice_date: new Date().toISOString().split('T')[0],
      memo: `Batch: ${batch.batch_name}`,
      lines: lines.map(l => ({
        description: l.description,
        qty: l.qty,
        unit_price: l.unit_price,
        amount: l.line_total,
      })),
      total: lines.reduce((sum, l) => sum + (l.line_total || 0), 0),
    };
    
    // STUB: In real implementation, this would call QB API
    // For now, just update statuses
    const now = new Date().toISOString();
    const qbExportId = `QB-${Date.now().toString(36).toUpperCase()}`;
    
    // Update all lines to exported
    const updatePromises = lines.map(line => 
      base44.entities.InvoiceBatchLine.update(line.id, {
        qb_status: 'exported',
        qb_line_id: `${qbExportId}-${line.id.slice(0, 8)}`,
      })
    );
    await Promise.all(updatePromises);
    
    // Update batch status
    await base44.entities.InvoiceBatch.update(batch_id, {
      status: 'exported',
      qb_export_id: qbExportId,
      qb_exported_at: now,
    });
    
    return Response.json({
      success: true,
      batch_id,
      qb_export_id: qbExportId,
      lines_exported: lines.length,
      total_amount: exportPayload.total,
      message: 'Batch exported successfully (stub - no actual QB connection)',
      export_payload: exportPayload, // For debugging/preview
    });
    
  } catch (error) {
    console.error('Export to QB error:', error);
    return Response.json({ 
      error: error.message,
      code: 'EXPORT_ERROR'
    }, { status: 500 });
  }
});