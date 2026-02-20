import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 6 — Export All Project Invoices to QuickBooks
 * 
 * Exports all non-draft InvoiceBatches for a project as:
 * - JSON array of invoice payloads
 * - Aggregated CSV file for bulk QB import
 * 
 * Does NOT export:
 * - Draft batches
 * - Voided batches
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { project_id, format = 'json', include_exported = false } = payload;
    
    if (!project_id) {
      return Response.json({ 
        error: 'project_id is required',
        code: 'MISSING_PROJECT_ID'
      }, { status: 400 });
    }
    
    // Fetch project
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects[0];
    
    if (!project) {
      return Response.json({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND'
      }, { status: 404 });
    }
    
    // Fetch all batches for project
    const allBatches = await base44.entities.InvoiceBatch.filter({ project_id });
    
    // Filter to exportable batches (sent, exported, invoiced, paid - not draft/voided)
    let batches = allBatches.filter(b => 
      !['draft', 'voided'].includes(b.status)
    );
    
    // Optionally exclude already exported
    if (!include_exported) {
      batches = batches.filter(b => !b.qb_exported);
    }
    
    if (batches.length === 0) {
      return Response.json({
        success: true,
        project_id,
        batches_found: 0,
        message: include_exported 
          ? 'No exportable invoices found for this project'
          : 'No unexported invoices found for this project',
      });
    }
    
    // Fetch all lines for these batches
    const batchIds = batches.map(b => b.id);
    const allLines = await base44.entities.InvoiceBatchLine.list();
    const relevantLines = allLines.filter(l => batchIds.includes(l.batch_id));
    
    // Group lines by batch
    const linesByBatch = {};
    for (const line of relevantLines) {
      if (!linesByBatch[line.batch_id]) {
        linesByBatch[line.batch_id] = [];
      }
      linesByBatch[line.batch_id].push(line);
    }
    
    const now = new Date();
    const exportId = `PROJ-${project_id.slice(0, 6)}-${now.getTime().toString(36).toUpperCase()}`;
    const customerName = project.client_name || 'Unknown Client';
    
    // Build export payloads
    const invoicePayloads = batches.map(batch => {
      const lines = linesByBatch[batch.id] || [];
      const invoiceNumber = batch.qb_invoice_number || batch.invoice_number || batch.batch_name;
      const invoiceDate = batch.invoice_date || batch.created_date?.split('T')[0] || now.toISOString().split('T')[0];
      const dueDate = batch.due_date || new Date(new Date(invoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      return {
        batch_id: batch.id,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        customer_name: customerName,
        project_name: project.name,
        invoice_type: batch.invoice_type || 'progress',
        status: batch.status,
        is_paid: batch.status === 'paid',
        paid_date: batch.paid_date || batch.payment_received_at,
        total_amount: batch.total_amount || lines.reduce((sum, l) => sum + (l.line_total || 0), 0),
        lines: lines.map((l, idx) => ({
          line_number: idx + 1,
          description: l.description || `Part: ${l.part_id}`,
          quantity: l.qty || 1,
          unit_price: l.unit_price,
          line_total: l.line_total || (l.qty * l.unit_price),
        })),
      };
    });
    
    // Calculate totals
    const totals = {
      total_invoiced: invoicePayloads.reduce((sum, inv) => sum + inv.total_amount, 0),
      total_paid: invoicePayloads.filter(inv => inv.is_paid).reduce((sum, inv) => sum + inv.total_amount, 0),
      total_outstanding: invoicePayloads.filter(inv => !inv.is_paid).reduce((sum, inv) => sum + inv.total_amount, 0),
      invoice_count: invoicePayloads.length,
      paid_count: invoicePayloads.filter(inv => inv.is_paid).length,
      outstanding_count: invoicePayloads.filter(inv => !inv.is_paid).length,
    };
    
    // Generate CSV if requested
    if (format === 'csv') {
      const csvLines = [];
      
      // Header
      csvLines.push([
        'InvoiceNo',
        'Customer',
        'Project',
        'InvoiceDate',
        'DueDate',
        'Status',
        'ItemDescription',
        'Quantity',
        'Rate',
        'Amount',
      ].join(','));
      
      // Data rows
      for (const invoice of invoicePayloads) {
        for (const line of invoice.lines) {
          csvLines.push([
            `"${invoice.invoice_number}"`,
            `"${invoice.customer_name}"`,
            `"${invoice.project_name || ''}"`,
            `"${invoice.invoice_date}"`,
            `"${invoice.due_date}"`,
            `"${invoice.status}"`,
            `"${(line.description || '').replace(/"/g, '""')}"`,
            line.quantity,
            line.unit_price.toFixed(2),
            line.line_total.toFixed(2),
          ].join(','));
        }
      }
      
      const csvContent = csvLines.join('\n');
      
      // Mark batches as exported
      await Promise.all(batches.map(batch => 
        base44.entities.InvoiceBatch.update(batch.id, {
          qb_exported: true,
          qb_export_date: now.toISOString(),
          qb_exported_at: now.toISOString(),
          qb_export_id: exportId,
          qb_sync_status: 'pending',
        })
      ));
      
      return Response.json({
        success: true,
        project_id,
        export_id: exportId,
        format: 'csv',
        batches_exported: batches.length,
        totals,
        csv_content: csvContent,
        filename: `project_${project.name?.replace(/[^a-zA-Z0-9]/g, '_') || project_id}_invoices.csv`,
      });
    }
    
    // JSON format (default)
    // Mark batches as exported
    await Promise.all(batches.map(batch => 
      base44.entities.InvoiceBatch.update(batch.id, {
        qb_exported: true,
        qb_export_date: now.toISOString(),
        qb_exported_at: now.toISOString(),
        qb_export_id: exportId,
        qb_sync_status: 'synced',
      })
    ));
    
    return Response.json({
      success: true,
      project_id,
      project_name: project.name,
      customer_name: customerName,
      export_id: exportId,
      format: 'json',
      batches_exported: batches.length,
      totals,
      invoices: invoicePayloads,
    });
    
  } catch (error) {
    console.error('Export project invoices error:', error);
    return Response.json({ 
      error: error.message,
      code: 'EXPORT_ERROR'
    }, { status: 500 });
  }
});