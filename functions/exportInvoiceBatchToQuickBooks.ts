import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 6 — Export Invoice Batch to QuickBooks
 * 
 * Actions:
 * - export: Export batch as JSON payload (for API integration)
 * - csv: Generate CSV format suitable for QB import
 * - mark_exported: Just mark as exported without generating payload
 * 
 * Validates:
 * - Batch exists and is not voided
 * - All lines have valid pricing
 * - Batch not already exported (unless force=true)
 * 
 * Updates:
 * - qb_exported = true
 * - qb_export_date = now
 * - qb_sync_status = 'synced' or 'pending' based on mode
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { batch_id, action = 'export', force = false } = payload;
    
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
    
    if (batch.status === 'voided') {
      return Response.json({ 
        error: 'Cannot export voided batch',
        code: 'BATCH_VOIDED'
      }, { status: 400 });
    }
    
    if (batch.status === 'draft') {
      return Response.json({ 
        error: 'Cannot export draft batch - send to client first',
        code: 'BATCH_DRAFT'
      }, { status: 400 });
    }
    
    // Check if already exported (unless forcing)
    if ((batch.qb_exported || batch.status === 'exported') && !force) {
      return Response.json({ 
        error: 'Batch already exported. Use force=true to re-export.',
        code: 'ALREADY_EXPORTED',
        qb_export_id: batch.qb_export_id,
        qb_exported_at: batch.qb_exported_at || batch.qb_export_date,
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
        details: invalidLines.map(l => ({
          id: l.id,
          description: l.description || 'No description',
          part_id: l.part_id,
        })),
      }, { status: 400 });
    }

    // Fetch project for customer info
    let project = null;
    if (batch.project_id) {
      const projects = await base44.entities.Project.filter({ id: batch.project_id });
      project = projects[0];
    }
    
    // Build structured export payload
    const now = new Date();
    const qbExportId = `QB-${now.getTime().toString(36).toUpperCase()}`;
    
    const customerName = batch.client_name || project?.client_name || 'Unknown Client';
    const invoiceNumber = batch.qb_invoice_number || batch.invoice_number || batch.batch_name;
    const invoiceDate = batch.invoice_date || now.toISOString().split('T')[0];
    const dueDate = batch.due_date || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const exportPayload = {
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      customer_name: customerName,
      project_name: project?.name || null,
      memo: batch.notes || `Invoice Batch: ${batch.batch_name}`,
      total_amount: batch.total_amount || lines.reduce((sum, l) => sum + (l.line_total || 0), 0),
      lines: lines.map((l, idx) => ({
        line_number: idx + 1,
        description: l.description || `Part: ${l.part_id}`,
        quantity: l.qty || 1,
        unit_price: l.unit_price,
        line_total: l.line_total || (l.qty * l.unit_price),
        part_id: l.part_id,
        commitment_id: l.commitment_id,
      })),
    };

    // Handle different export actions
    if (action === 'csv') {
      // Generate CSV format for QB import
      const csvLines = [];
      
      // Header row (IIF format for QuickBooks)
      csvLines.push([
        'InvoiceNo',
        'Customer',
        'InvoiceDate',
        'DueDate',
        'ItemDescription',
        'Quantity',
        'Rate',
        'Amount',
      ].join(','));
      
      // Data rows
      for (const line of exportPayload.lines) {
        csvLines.push([
          `"${invoiceNumber}"`,
          `"${customerName}"`,
          `"${invoiceDate}"`,
          `"${dueDate}"`,
          `"${(line.description || '').replace(/"/g, '""')}"`,
          line.quantity,
          line.unit_price.toFixed(2),
          line.line_total.toFixed(2),
        ].join(','));
      }
      
      const csvContent = csvLines.join('\n');
      
      // Update batch as exported
      await base44.entities.InvoiceBatch.update(batch_id, {
        qb_exported: true,
        qb_export_date: now.toISOString(),
        qb_exported_at: now.toISOString(),
        qb_export_id: qbExportId,
        qb_sync_status: 'pending', // CSV = manual import = pending until confirmed
      });
      
      // Update line statuses
      await Promise.all(lines.map(line => 
        base44.entities.InvoiceBatchLine.update(line.id, {
          qb_status: 'exported',
          qb_line_id: `${qbExportId}-L${line.id.slice(0, 6)}`,
        })
      ));
      
      return Response.json({
        success: true,
        batch_id,
        qb_export_id: qbExportId,
        format: 'csv',
        lines_exported: lines.length,
        total_amount: exportPayload.total_amount,
        csv_content: csvContent,
        filename: `invoice_${invoiceNumber}_${invoiceDate}.csv`,
      });
    }
    
    if (action === 'mark_exported') {
      // Just mark as exported without returning payload
      await base44.entities.InvoiceBatch.update(batch_id, {
        qb_exported: true,
        qb_export_date: now.toISOString(),
        qb_exported_at: now.toISOString(),
        qb_export_id: qbExportId,
        qb_sync_status: 'synced',
        status: batch.status === 'sent' ? 'exported' : batch.status,
      });
      
      return Response.json({
        success: true,
        batch_id,
        qb_export_id: qbExportId,
        message: 'Batch marked as exported',
      });
    }
    
    // Default: JSON export
    // Update batch status
    await base44.entities.InvoiceBatch.update(batch_id, {
      qb_exported: true,
      qb_export_date: now.toISOString(),
      qb_exported_at: now.toISOString(),
      qb_export_id: qbExportId,
      qb_sync_status: 'synced',
      status: batch.status === 'sent' ? 'exported' : batch.status,
    });
    
    // Update line statuses
    await Promise.all(lines.map(line => 
      base44.entities.InvoiceBatchLine.update(line.id, {
        qb_status: 'exported',
        qb_line_id: `${qbExportId}-L${line.id.slice(0, 6)}`,
      })
    ));
    
    return Response.json({
      success: true,
      batch_id,
      qb_export_id: qbExportId,
      format: 'json',
      lines_exported: lines.length,
      total_amount: exportPayload.total_amount,
      export_payload: exportPayload,
    });
    
  } catch (error) {
    console.error('Export to QB error:', error);
    return Response.json({ 
      error: error.message,
      code: 'EXPORT_ERROR'
    }, { status: 500 });
  }
});