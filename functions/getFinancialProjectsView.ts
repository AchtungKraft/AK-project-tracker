import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 1 — Canonical Financial Read Model
 * 
 * Returns financial summary for all projects with parts assigned.
 * This is the SINGLE SOURCE for project dropdowns in billing UI.
 * 
 * Rules:
 * - Only include projects where has_parts_assigned = true
 * - Compute remaining_to_bill from commitments, not invoices
 * - No lifecycle leakage - purely financial state
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all required data in parallel
    const [projects, projectTypes, commitments, invoices, creditLedger] = await Promise.all([
      base44.entities.Project.filter({ is_system_project: { $ne: true } }),
      base44.entities.ProjectType.filter({}),
      base44.entities.PartCommitment.filter({}),
      base44.entities.ProjectInvoice.filter({}),
      base44.entities.ProjectCreditLedger.filter({})
    ]);

    const projectTypeMap = Object.fromEntries(projectTypes.map(pt => [pt.id, pt]));

    // Group commitments by project
    const commitmentsByProject = {};
    for (const c of commitments) {
      if (!c.project_id) continue;
      if (!commitmentsByProject[c.project_id]) {
        commitmentsByProject[c.project_id] = [];
      }
      commitmentsByProject[c.project_id].push(c);
    }

    // Group invoices by project
    const invoicesByProject = {};
    for (const inv of invoices) {
      if (!inv.project_id) continue;
      if (!invoicesByProject[inv.project_id]) {
        invoicesByProject[inv.project_id] = [];
      }
      invoicesByProject[inv.project_id].push(inv);
    }

    // Group credits by project
    const creditsByProject = {};
    for (const credit of creditLedger) {
      if (!credit.project_id) continue;
      if (!creditsByProject[credit.project_id]) {
        creditsByProject[credit.project_id] = [];
      }
      creditsByProject[credit.project_id].push(credit);
    }

    // Build financial view for each project
    const financialProjects = [];

    for (const project of projects) {
      const projectCommitments = commitmentsByProject[project.id] || [];
      const projectInvoices = invoicesByProject[project.id] || [];
      const projectCredits = creditsByProject[project.id] || [];

      // Skip projects with no parts assigned
      if (projectCommitments.length === 0) {
        continue;
      }

      // Calculate total parts exposure (planned retail from commitments)
      let totalPartsExposure = 0;
      let totalInvoicedFromCommitments = 0;
      let hasUnpaidParts = false;

      for (const c of projectCommitments) {
        // Use planned_retail_total or calculate from snapshot
        const retailTotal = c.planned_retail_total || 
          ((c.unit_retail_snapshot || 0) * (c.required_total || 0));
        totalPartsExposure += retailTotal;

        // Track invoiced amount from commitment
        const invoicedAmount = c.invoiced_amount || 0;
        totalInvoicedFromCommitments += invoicedAmount;

        // Check if has unpaid parts
        if (c.billing_status !== 'paid' && retailTotal > invoicedAmount) {
          hasUnpaidParts = true;
        }
      }

      // Calculate total paid from invoices
      let totalPaid = 0;
      for (const inv of projectInvoices) {
        if (inv.status === 'paid') {
          totalPaid += inv.paid_amount || 0;
        }
      }

      // Calculate available credit
      let availableCredit = 0;
      for (const credit of projectCredits) {
        availableCredit += credit.remaining_amount || 0;
      }

      // Remaining to bill = exposure - invoiced (from commitments)
      const remainingToBill = Math.max(0, totalPartsExposure - totalInvoicedFromCommitments);

      const projectType = project.project_type_id ? projectTypeMap[project.project_type_id] : null;

      financialProjects.push({
        project_id: project.id,
        project_name: project.name,
        project_type_id: project.project_type_id,
        project_type_name: projectType?.name || 'Uncategorized',
        project_type_color: projectType?.color || '#6B7280',
        total_parts_exposure: totalPartsExposure,
        total_invoiced: totalInvoicedFromCommitments,
        total_paid: totalPaid,
        remaining_to_bill: remainingToBill,
        available_credit: availableCredit,
        has_parts_assigned: true, // Always true since we filter above
        has_unpaid_parts: hasUnpaidParts,
        commitment_count: projectCommitments.length,
        invoice_count: projectInvoices.length
      });
    }

    // Sort by project name
    financialProjects.sort((a, b) => a.project_name.localeCompare(b.project_name));

    return Response.json({
      success: true,
      projects: financialProjects,
      summary: {
        total_projects: financialProjects.length,
        total_exposure: financialProjects.reduce((sum, p) => sum + p.total_parts_exposure, 0),
        total_invoiced: financialProjects.reduce((sum, p) => sum + p.total_invoiced, 0),
        total_paid: financialProjects.reduce((sum, p) => sum + p.total_paid, 0),
        total_remaining: financialProjects.reduce((sum, p) => sum + p.remaining_to_bill, 0),
        total_credit_available: financialProjects.reduce((sum, p) => sum + p.available_credit, 0)
      }
    });

  } catch (error) {
    console.error('getFinancialProjectsView error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});