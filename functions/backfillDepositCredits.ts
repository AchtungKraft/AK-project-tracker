import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * backfillDepositCredits - Admin-only data repair function
 * 
 * Finds all paid deposit invoices that are missing credit ledger entries
 * and creates them.
 * 
 * RULES:
 * - Admin only
 * - Only processes deposit invoices with status === 'paid'
 * - Only creates credit if no existing ledger entry for source_invoice_id
 * - Returns detailed report
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
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

    // Admin only
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { dry_run = true, project_id = null } = payload;

    // Find all paid deposit invoices
    const filter = {
      invoice_type: 'deposit',
      status: 'paid',
    };
    
    // Optionally filter to single project
    if (project_id) {
      filter.project_id = project_id;
    }

    const depositInvoices = await base44.entities.ProjectInvoice.filter(filter);

    // Fetch all existing credit ledger entries
    const allCredits = await base44.entities.ProjectCreditLedger.filter({});
    const creditsBySourceInvoice = new Map();
    for (const credit of allCredits) {
      if (credit.source_invoice_id) {
        creditsBySourceInvoice.set(credit.source_invoice_id, credit);
      }
    }

    const report = {
      processed_count: 0,
      already_has_credit: 0,
      created_count: 0,
      skipped_zero_amount: 0,
      errors: [],
      created_entries: [],
      dry_run,
    };

    for (const invoice of depositInvoices) {
      report.processed_count++;

      // Check if credit already exists
      if (creditsBySourceInvoice.has(invoice.id)) {
        report.already_has_credit++;
        continue;
      }

      // Determine credit amount (paid_amount or total)
      const creditAmount = invoice.paid_amount ?? invoice.total ?? 0;
      
      if (creditAmount <= 0) {
        report.skipped_zero_amount++;
        continue;
      }

      if (dry_run) {
        report.created_entries.push({
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          credit_amount: creditAmount,
          dry_run: true,
        });
        report.created_count++;
        continue;
      }

      // Actually create the credit
      try {
        const credit = await base44.asServiceRole.entities.ProjectCreditLedger.create({
          project_id: invoice.project_id,
          source_invoice_id: invoice.id,
          credit_amount: creditAmount,
          remaining_amount: creditAmount,
          notes: `Deposit payment from invoice ${invoice.qb_invoice_number || invoice.id} (backfill)`,
        });

        report.created_entries.push({
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          credit_id: credit.id,
          credit_amount: creditAmount,
        });
        report.created_count++;
      } catch (err) {
        report.errors.push({
          invoice_id: invoice.id,
          error: err.message,
        });
      }
    }

    // Trim created_entries to max 20 for response size
    if (report.created_entries.length > 20) {
      report.created_entries = report.created_entries.slice(0, 20);
      report.created_entries_truncated = true;
    }

    return Response.json({
      success: true,
      ...report,
    });

  } catch (error) {
    console.error('backfillDepositCredits error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});