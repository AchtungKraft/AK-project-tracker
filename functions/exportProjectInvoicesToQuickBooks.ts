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
 * - Must validate line_total === qty * unit_retail_snapshot (±0.01 tolerance)
 * 
 * PRODUCTION HARDENING:
 * - Deterministic ordering (invoices by created_at, lines by category then part)
 * - Currency formatting (2 decimal fixed)
 * - Proper CSV escaping
 * - Audit metadata in response
 * - Empty invoice guard
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

    const exportTimestamp = new Date().toISOString();

    // ============================================
    // STEP 1: Fetch Canonical Invoice View
    // ============================================
    const { data } = await base44.functions.invoke('getProjectInvoicesView', {
      project_id,
    });

    if (!data?.invoices) {
      throw new Error('No invoices returned from read model');
    }

    // DEBUG: Log raw invoice structure
    console.log('[EXPORT DEBUG] Raw invoices count:', data.invoices.length);
    if (data.invoices.length > 0) {
      console.log('[EXPORT DEBUG] First invoice structure:', JSON.stringify({
        id: data.invoices[0].id,
        status: data.invoices[0].status,
        line_count: data.invoices[0].line_count,
        lines_array_length: data.invoices[0].lines?.length ?? 'NO LINES PROPERTY',
        first_line: data.invoices[0].lines?.[0] ?? 'NO LINES',
      }, null, 2));
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
    // HARD GUARD: No invoices to export
    // ============================================
    if (exportInvoices.length === 0) {
      return Response.json({
        success: false,
        error: 'No invoices to export',
      });
    }

    // ============================================
    // STEP 3: Deterministic Ordering
    // ============================================
    // Sort invoices by created_at ASC
    exportInvoices.sort((a, b) => {
      const dateA = new Date(a.created_at || a.created_date || 0);
      const dateB = new Date(b.created_at || b.created_date || 0);
      return dateA - dateB;
    });

    // Sort lines within each invoice by category_name ASC, then part_name ASC
    for (const invoice of exportInvoices) {
      if (invoice.lines && Array.isArray(invoice.lines)) {
        invoice.lines.sort((a, b) => {
          const catA = (a.category_name || '').toLowerCase();
          const catB = (b.category_name || '').toLowerCase();
          if (catA !== catB) return catA.localeCompare(catB);
          
          const partA = (a.part_name || '').toLowerCase();
          const partB = (b.part_name || '').toLowerCase();
          return partA.localeCompare(partB);
        });
      }
    }

    // ============================================
    // STEP 4: Build CSV Rows
    // ============================================
    const rows = [];
    let totalRetailSum = 0;

    // Header block
    rows.push(`Project Name: ${data.project_name || 'Unknown Project'}`);
    rows.push(`Date of Export: ${exportTimestamp.split('T')[0]}`);
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

        const descriptionRaw = vpn
          ? `${category} / ${partName} / ${vpn}`
          : `${category} / ${partName}`;

        // MANDATORY MATH VALIDATION
        const qty = Number(line.qty) || 0;
        const rate = Number(line.unit_retail_snapshot) || 0;
        const lineTotal = Number(line.line_total) || 0;
        const calculated = qty * rate;

        // Tolerance ±0.01 for floating point comparison
        if (Math.abs(lineTotal - calculated) > 0.01) {
          throw new Error(
            `Invoice line math mismatch: ${partName} (expected ${calculated.toFixed(2)}, got ${lineTotal.toFixed(2)})`
          );
        }

        // Accumulate total retail sum
        totalRetailSum += lineTotal;

        // CSV escaping: escape internal quotes with double-quote, wrap in quotes
        const escapedDescription = descriptionRaw.replace(/"/g, '""');

        // Currency formatting: 2 decimal fixed
        const rateFormatted = rate.toFixed(2);
        const amountFormatted = lineTotal.toFixed(2);

        rows.push(
          `Build_Parts,"${escapedDescription}",${qty},${rateFormatted},${amountFormatted}`
        );
      }
    }

    // ============================================
    // STEP 5: Build File Name (YYYYMMDD format)
    // ============================================
    const projectNameSlug = (data.project_name || 'Project')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    const dateSlug = exportTimestamp.split('T')[0].replace(/-/g, '');
    const fileName = `QB_Export_${projectNameSlug}_${dateSlug}.csv`;

    // ============================================
    // STEP 6: Return CSV with Audit Metadata
    // ============================================
    const lineCount = rows.length - 4; // Subtract header rows

    return Response.json({
      success: true,
      file_name: fileName,
      mime_type: 'text/csv',
      content: rows.join('\n'),
      invoice_count: exportInvoices.length,
      line_count: lineCount,
      // Audit metadata
      project_id,
      export_timestamp: exportTimestamp,
      total_retail_sum: Number(totalRetailSum.toFixed(2)),
    });

  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});