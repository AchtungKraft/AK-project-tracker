/**
 * exportProjectInvoicesToQuickBooks.js
 * 
 * Generate a QuickBooks-compatible CSV export of invoice lines
 * using the canonical Forward invoice read model.
 * 
 * GUARDRAILS:
 * - Must call getProjectInvoicesView
 * - Must export strictly from response.data.invoices
 * - Must NOT query entities directly, recompute totals, or use supply data
 * - Must validate line_total === qty * unit_retail_snapshot
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { project_id, invoice_ids, mode = 'all' } = payload;

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    // ============================================
    // STEP 1: Fetch Canonical Invoice View
    // ============================================
    const { data } = await base44.functions.invoke('getProjectInvoicesView', {
      project_id,
    });

    if (!data?.invoices) {
      throw new Error('No invoices returned from read model');
    }

    // ============================================
    // STEP 2: Mode-Based Filtering
    // ============================================
    let exportInvoices = data.invoices;

    if (mode === 'single') {
      exportInvoices = data.invoices.filter(
        i => i.id === invoice_ids?.[0]
      );
    }

    if (mode === 'selected') {
      exportInvoices = data.invoices.filter(
        i => invoice_ids?.includes(i.id)
      );
    }

    // mode === 'all' → no filtering
    // No status filtering - all drafts, sent, paid, etc. included

    // ============================================
    // STEP 3: Build CSV Rows
    // ============================================
    const rows = [];

    // Header block
    rows.push(`Project Name: ${data.project_name || 'Unknown Project'}`);
    rows.push(`Date of Export: ${new Date().toISOString().split('T')[0]}`);
    rows.push('');

    // Column header
    rows.push('Product/Service,Description,Qty,Rate,Amount');

    // Invoice lines
    for (const invoice of exportInvoices) {
      const lines = invoice.lines || [];
      
      for (const line of lines) {
        // Build description
        const category = line.category_name || 'Uncategorized';
        const partName = line.part_name || 'Unknown Part';
        const vpn = line.vendor_part_number || '';

        const description = vpn
          ? `${category} / ${partName} / ${vpn}`
          : `${category} / ${partName}`;

        // MANDATORY MATH VALIDATION
        const qty = Number(line.qty) || 0;
        const rate = Number(line.unit_retail_snapshot) || 0;
        const lineTotal = Number(line.line_total) || 0;
        const calculated = qty * rate;

        // Use tolerance for floating point comparison
        if (Math.abs(lineTotal - calculated) > 0.01) {
          throw new Error(
            `Invoice line math mismatch: ${partName} (expected ${calculated}, got ${lineTotal})`
          );
        }

        // Escape description for CSV (wrap in quotes, escape inner quotes)
        const escapedDescription = description.replace(/"/g, '""');

        rows.push(
          `Build_Parts,"${escapedDescription}",${qty},${rate},${lineTotal}`
        );
      }
    }

    // ============================================
    // STEP 4: Return CSV
    // ============================================
    const projectName = (data.project_name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
    const lineCount = rows.length - 4; // Subtract header rows

    return Response.json({
      success: true,
      file_name: `QB_Export_${projectName}_${Date.now()}.csv`,
      mime_type: 'text/csv',
      content: rows.join('\n'),
      invoice_count: exportInvoices.length,
      line_count: lineCount,
    });

  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});