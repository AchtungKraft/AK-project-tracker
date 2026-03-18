import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getProjectInvoicesView - Invoice History Read Model
 * 
 * PHASE 1 REFACTOR: This is now INVOICE-HISTORY ONLY.
 * Do NOT use this for exposure calculations.
 * Use getBillingAndProcurementStates for canonical exposure data.
 * 
 * Returns:
 * - invoices list with computed flags: overdue, missing_qb_fields
 * - project credit balances (read-only summary)
 * - credit applied totals (read-only summary)
 * 
 * Does NOT return:
 * - Commitment-level exposure (use getBillingAndProcurementStates)
 * - Invoiceable parts list (use getBillingAndProcurementStates)
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

    // PERF: Timing start
    const _perfStart = Date.now();

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

    // PERF FIX: Scope line fetches to invoice IDs only
    const invoiceIds = invoices.map(inv => inv.id);
    const relevantLines = invoiceIds.length > 0
      ? await base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: invoiceIds } })
      : [];
    
    // PERF FIX: Scope commitment fetch to relevant IDs only
    const commitmentIds = [...new Set(relevantLines.filter(l => l.part_commitment_id).map(l => l.part_commitment_id))];
    const commitments = commitmentIds.length > 0
      ? await base44.entities.PartCommitment.filter({ id: { $in: commitmentIds } })
      : [];
    const commitmentMap = Object.fromEntries(commitments.map(c => [c.id, c]));
    
    // PERF FIX: Scope part fetch to relevant IDs only
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const parts = partIds.length > 0
      ? await base44.entities.Part.filter({ id: { $in: partIds } })
      : [];
    const partMap = Object.fromEntries(parts.map(p => [p.id, p]));
    
    // Fetch categories for category names
    const categories = await base44.entities.PartCategory.list();
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));
    
    // Build line data map with enriched details
    const linesByInvoice = {};
    const lineCountMap = {};
    
    for (const line of relevantLines) {
      if (!linesByInvoice[line.invoice_id]) {
        linesByInvoice[line.invoice_id] = [];
      }
      
      // Enrich line with part/category data for export
      let enrichedLine = { ...line };
      
      if (line.part_commitment_id) {
        const commitment = commitmentMap[line.part_commitment_id];
        if (commitment) {
          const part = partMap[commitment.part_id];
          const category = part?.part_category_id ? categoryMap[part.part_category_id] : null;
          
          enrichedLine = {
            ...line,
            // Export-required fields
            part_name: part?.part_name || line.description || 'Unknown Part',
            vendor_part_number: part?.vendor_part_number || '',
            category_name: category?.name || 'Uncategorized',
            // Pricing fields from commitment snapshot
            unit_retail_snapshot: commitment.unit_retail_snapshot ?? line.unit_price ?? 0,
            unit_cost_snapshot: commitment.unit_cost_snapshot ?? 0,
          };
        }
      } else {
        // Manual line - use description directly
        enrichedLine = {
          ...line,
          part_name: line.description || 'Manual Item',
          vendor_part_number: '',
          category_name: line.type === 'outside_cost' ? 'Outside Costs' : 'Manual',
          unit_retail_snapshot: line.unit_price ?? 0,
          unit_cost_snapshot: 0,
        };
      }
      
      linesByInvoice[line.invoice_id].push(enrichedLine);
      lineCountMap[line.invoice_id] = (lineCountMap[line.invoice_id] || 0) + 1;
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
        // CRITICAL: Include lines array for export functionality
        lines: linesByInvoice[inv.id] || [],
        flags: {
          overdue: isOverdue,
          missing_qb_fields: missingQbFields,
        },
      };
    });

    // Calculate credit balances per project
    const [credits, creditAllocations] = await Promise.all([
      base44.entities.ProjectCreditLedger.list(),
      base44.entities.CreditAllocation.filter({ is_reversed: false }),
    ]);
    
    const creditBalanceMap = {};
    const creditAppliedMap = {};
    
    for (const credit of credits) {
      const remaining = credit.remaining_amount ?? 0;
      if (remaining > 0) {
        creditBalanceMap[credit.project_id] = (creditBalanceMap[credit.project_id] || 0) + remaining;
      }
    }
    
    // PHASE 6: Calculate credit applied per project from CreditAllocation
    for (const alloc of creditAllocations) {
      if (!creditAppliedMap[alloc.project_id]) {
        creditAppliedMap[alloc.project_id] = 0;
      }
      creditAppliedMap[alloc.project_id] += alloc.amount_applied || 0;
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

    // PERF: Timing log (dev only)
    const _perfEnd = Date.now();
    console.log('[PERF] getProjectInvoicesView', _perfEnd - _perfStart, 'ms', {
      entityCounts: {
        invoices: invoices.length,
        lines: relevantLines.length,
        commitments: commitments.length,
        parts: parts.length,
        credits: credits.length,
      }
    });

    return Response.json({
      success: true,
      invoices: invoicesWithFlags,
      credit_balances: creditBalanceMap,
      credit_applied: creditAppliedMap,
      summary,
    });

  } catch (error) {
    console.error('getProjectInvoicesView error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});