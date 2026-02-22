import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getProjectInvoicesView - PHASE 10 Forward Invoice System
 * 
 * Returns invoices list with computed flags and project credit balance.
 * 
 * Inputs:
 * - project_id (optional - filter by project)
 * - status (optional - filter by status)
 * 
 * Returns:
 * - invoices list with flags: overdue, missing_qb_fields
 * - project credit balances
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

    const payload = await req.json().catch(() => ({}));
    const { project_id, status } = payload;

    // Build filter
    const filter = {};
    if (project_id) filter.project_id = project_id;
    if (status) filter.status = status;

    // Fetch invoices
    let invoices;
    if (Object.keys(filter).length > 0) {
      invoices = await base44.entities.ProjectInvoice.filter(filter, '-created_date');
    } else {
      invoices = await base44.entities.ProjectInvoice.list('-created_date');
    }

    // Fetch projects for names
    const projectIds = [...new Set(invoices.map(inv => inv.project_id))];
    const projects = projectIds.length > 0 
      ? await base44.entities.Project.list()
      : [];
    const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));

    // Fetch invoice lines for line counts
    const invoiceIds = invoices.map(inv => inv.id);
    const allLines = invoiceIds.length > 0
      ? await base44.entities.ProjectInvoiceLine.list()
      : [];
    
    const lineCountMap = {};
    for (const line of allLines) {
      if (invoiceIds.includes(line.invoice_id)) {
        lineCountMap[line.invoice_id] = (lineCountMap[line.invoice_id] || 0) + 1;
      }
    }

    // Calculate today for overdue check
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Transform invoices with flags
    const invoicesWithFlags = invoices.map(inv => {
      const project = projectMap[inv.project_id];
      
      // Check overdue: sent + due_date < today
      let isOverdue = false;
      if (inv.status === 'sent' && inv.due_date) {
        const dueDate = new Date(inv.due_date);
        dueDate.setHours(0, 0, 0, 0);
        isOverdue = dueDate < today;
      }

      // Check missing QB fields: sent but missing qb_invoice_number/issue_date/due_date
      let missingQbFields = false;
      if (inv.status === 'sent') {
        if (!inv.qb_invoice_number || !inv.issue_date || !inv.due_date) {
          missingQbFields = true;
        }
      }

      return {
        ...inv,
        project_name: project?.name || 'Unknown',
        client_name: project?.client_name || '',
        line_count: lineCountMap[inv.id] || 0,
        flags: {
          overdue: isOverdue,
          missing_qb_fields: missingQbFields,
        },
      };
    });

    // Calculate credit balances per project
    const credits = await base44.entities.ProjectCreditLedger.list();
    const creditBalanceMap = {};
    
    for (const credit of credits) {
      const remaining = credit.remaining_amount ?? 0;
      if (remaining > 0) {
        creditBalanceMap[credit.project_id] = (creditBalanceMap[credit.project_id] || 0) + remaining;
      }
    }

    // Summary stats
    const summary = {
      total_invoices: invoices.length,
      draft_count: invoices.filter(i => i.status === 'draft').length,
      sent_count: invoices.filter(i => i.status === 'sent').length,
      paid_count: invoices.filter(i => i.status === 'paid').length,
      overdue_count: invoicesWithFlags.filter(i => i.flags.overdue).length,
      total_balance_due: invoices
        .filter(i => i.status === 'sent')
        .reduce((sum, i) => sum + (i.balance_due ?? 0), 0),
    };

    return Response.json({
      success: true,
      invoices: invoicesWithFlags,
      credit_balances: creditBalanceMap,
      summary,
    });

  } catch (error) {
    console.error('getProjectInvoicesView error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});