/**
 * exportProjectInvoicesToQuickBooks.js
 * 
 * Generate a QuickBooks-compatible CSV export of invoice lines
 * using the canonical Forward invoice read model.
 * 
 * GUARDRAILS:
 * - Must call getProjectInvoicesView
 * - Must export strictly from response.data.invoices
 * - Must NOT recompute totals or use supply data (invoice records are read only for deposit export eligibility)
 * - Must validate line_total === qty * unit_retail_snapshot (±0.01 tolerance)
 * 
 * PRODUCTION HARDENING:
 * - Deterministic ordering (invoices by created_at, lines by category then part)
 * - Currency formatting (2 decimal fixed)
 * - Proper CSV escaping
 * - Audit metadata in response
 * - Empty invoice guard
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Deposit export eligibility (prevents creating a deposit invoice in QuickBooks twice).
function exportBlock(r) {
  if (r?.invoice_type !== 'deposit') return null;
  if (r.recorded_from_quickbooks) return 'QUICKBOOKS_ORIGIN';
  if (r.qb_export_status === 'exported') return 'ALREADY_EXPORTED';
  if (r.qb_export_status === 'linked') return 'LINKED_IN_QUICKBOOKS';
  return null;
}
function eligibilityVectors() {
  const v = [
    ['progress invoice exports (even if exported before)', { invoice_type: 'progress', qb_export_status: 'exported' }, null],
    ['AK deposit not yet in QuickBooks exports', { invoice_type: 'deposit' }, null],
    ['deposit recorded from QuickBooks excluded', { invoice_type: 'deposit', recorded_from_quickbooks: true }, 'QUICKBOOKS_ORIGIN'],
    ['AK deposit already exported excluded', { invoice_type: 'deposit', qb_export_status: 'exported' }, 'ALREADY_EXPORTED'],
    ['AK deposit linked to QuickBooks excluded', { invoice_type: 'deposit', qb_export_status: 'linked' }, 'LINKED_IN_QUICKBOOKS'],
  ].map(([name, r, want]) => ({ name, pass: exportBlock(r) === want }));
  return { function: 'exportProjectInvoicesToQuickBooks', mock_only: true, passed: v.filter((x) => x.pass).length, total: v.length, results: v };
}

Deno.serve(async (req) => {
  console.log("RUNNING EXPORT FUNCTION: QB_EXPORT_COST_V2");
  
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
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reqPayload = await req.json().catch(() => ({}));
    if (reqPayload.self_test) return Response.json(eligibilityVectors());
    const { project_id, invoice_ids, mode = 'all' } = reqPayload;

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    const exportTimestamp = new Date().toISOString();

    // ============================================
    // STEP 1: Fetch Invoice Data via Canonical Read Model
    // ============================================
    const invokeResult = await base44.functions.invoke("getProjectInvoicesView", {
      project_id
    });
    
    // Fix invoke response parsing: actual data is in invokeResult.data
    const payload = invokeResult?.data;
    
    if (!payload || payload.success !== true) {
      return Response.json({
        success: false,
        error: payload?.error || 'Failed to fetch invoice read model',
      });
    }

    const invoices = payload.invoices || [];

    // Fetch project name separately (not in read model response)
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects[0];
    const projectName = project?.name || 'Unknown Project';

    const data = {
      invoices,
      project_name: projectName,
    };

    // DEBUG: Log raw invoice structure
    console.log('[EXPORT DEBUG] Raw invoices count:', data.invoices.length);
    if (data.invoices.length > 0) {
      console.log('[EXPORT DEBUG] First invoice structure:', JSON.stringify({
        id: data.invoices[0].id,
        status: data.invoices[0].status,
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
    // DEPOSIT EXPORT ELIGIBILITY (prevents creating a deposit invoice in QuickBooks twice)
    // Excluded: deposits recorded from an existing QuickBooks invoice, and AK-created deposits already exported
    // or linked to QuickBooks. Read from the invoice records themselves (metadata only, totals untouched).
    // ============================================
    const rawInvoices = await base44.asServiceRole.entities.ProjectInvoice.filter({ project_id });
    const rawById = new Map(rawInvoices.map((r) => [r.id, r]));
    const BLOCK_MSG = {
      QUICKBOOKS_ORIGIN: 'recorded from an invoice that already exists in QuickBooks',
      ALREADY_EXPORTED: 'already exported to QuickBooks',
      LINKED_IN_QUICKBOOKS: 'already linked to an invoice in QuickBooks',
    };
    const excluded = exportInvoices.filter((i) => exportBlock(rawById.get(i.id))).map((i) => {
      const r = rawById.get(i.id); const code = exportBlock(r);
      return { invoice_id: i.id, qb_invoice_number: r.qb_invoice_number || null, code, reason: `Deposit invoice ${r.qb_invoice_number || i.id} is ${BLOCK_MSG[code]}.` };
    });
    exportInvoices = exportInvoices.filter((i) => !exportBlock(rawById.get(i.id)));
    if (exportInvoices.length === 0 && excluded.length) {
      return Response.json({ success: false, code: 'NOT_EXPORT_ELIGIBLE', excluded, error: `${excluded.map((e) => e.reason).join(' ')} It was not exported again, so it can't be duplicated in QuickBooks.` });
    }

    // ============================================
    // HARD GUARD: No invoices to export
    // ============================================
    if (exportInvoices.length === 0) {
      console.log('[EXPORT WARNING] No invoices found for export');
      return Response.json({
        success: false,
        error: 'No invoices to export',
      });
    }

    // DEBUG: Defensive guard - warn if invoices have no lines
    for (const invoice of exportInvoices) {
      if (!invoice.lines || invoice.lines.length === 0) {
        console.log('[EXPORT WARNING] Invoice has no lines:', invoice.id, 'status:', invoice.status);
      }
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
    let totalCostSum = 0;

    // Header block
    rows.push(`Project Name: ${data.project_name || 'Unknown Project'}`);
    rows.push(`Date of Export: ${exportTimestamp.split('T')[0]}`);
    rows.push('');

    // Column header
    rows.push('Product/Service,Description,Qty,Rate,Amount,Part Cost,Part Cost Extended');

    // HARD RUNTIME ASSERTION: Verify cost columns in header
    if (!rows[3].includes("Part Cost Extended")) {
      throw new Error("COST COLUMNS MISSING FROM HEADER BUILD");
    }

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

        // Cost calculations - prefer unit_cost_snapshot, fallback to unit_cost
        const unitCost = Number(line.unit_cost_snapshot ?? line.unit_cost ?? 0);
        const costExtended = unitCost * qty;
        totalCostSum += costExtended;

        if (costExtended < 0) {
          throw new Error(`Invalid cost calculation for ${partName}`);
        }

        // CSV escaping: escape internal quotes with double-quote, wrap in quotes
        const escapedDescription = descriptionRaw.replace(/"/g, '""');

        // Currency formatting: 2 decimal fixed
        const rateFormatted = rate.toFixed(2);
        const amountFormatted = lineTotal.toFixed(2);
        const costFormatted = unitCost.toFixed(2);
        const costExtendedFormatted = costExtended.toFixed(2);

        rows.push(
          `Build_Parts,"${escapedDescription}",${qty},${rateFormatted},${amountFormatted},${costFormatted},${costExtendedFormatted}`
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

    // Issued AK-created deposit invoices in this file are now in QuickBooks' hands: mark them so they are never exported twice.
    const marked = [];
    for (const i of exportInvoices) {
      const r = rawById.get(i.id);
      if (r?.invoice_type !== 'deposit' || ['draft', 'cancelled', 'void'].includes(r.status)) continue;
      await base44.asServiceRole.entities.ProjectInvoice.update(r.id, { qb_export_status: 'exported', qb_exported_at: exportTimestamp, qb_exported_by: user.email });
      marked.push(r.id);
    }

    return Response.json({
      success: true,
      export_version: "QB_EXPORT_COST_V2",
      csv_header: rows[3],
      file_name: fileName,
      mime_type: 'text/csv',
      content: rows.join('\n'),
      invoice_count: exportInvoices.length,
      line_count: lineCount,
      // Audit metadata
      project_id,
      export_timestamp: exportTimestamp,
      total_retail_sum: Number(totalRetailSum.toFixed(2)),
      total_cost_sum: Number(totalCostSum.toFixed(2)),
      excluded_invoices: excluded,
      deposits_marked_exported: marked,
    });

  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});