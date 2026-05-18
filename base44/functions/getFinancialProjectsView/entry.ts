import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    // PERF: Timing start
    const _perfStart = Date.now();

    // Fetch all required data in parallel
    // NOTE: These are intentional cross-project global scans for financial overview dashboard.
    // Acceptable at current scale (<100 projects, <2000 commitments).
    const [projects, projectTypes, commitments, serviceCommitments, invoices, creditLedger] = await Promise.all([
      base44.entities.Project.filter({ is_system_project: { $ne: true } }),
      base44.entities.ProjectType.list(),
      base44.entities.PartCommitment.list('-created_date', 5000),
      base44.entities.ServiceCommitment.list('-created_date', 2000),
      base44.entities.ProjectInvoice.list('-created_date', 2000),
      base44.entities.ProjectCreditLedger.list('-created_date', 1000),
    ]);

    const projectTypeMap = Object.fromEntries(projectTypes.map(pt => [pt.id, pt]));

    // Group service commitments by project (kept SEPARATE from parts)
    const servicesByProject = {};
    for (const sc of serviceCommitments) {
      if (!sc.project_id) continue;
      if (!servicesByProject[sc.project_id]) servicesByProject[sc.project_id] = [];
      servicesByProject[sc.project_id].push(sc);
    }

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

      const projectServices = servicesByProject[project.id] || [];

      // Skip projects with no parts or services assigned
      if (projectCommitments.length === 0 && projectServices.length === 0) {
        continue;
      }

      // ── PARTS exposure (SEPARATE from services) ──
      let totalPartsExposure = 0;

      for (const c of projectCommitments) {
        const retailTotal = c.planned_retail_total || 
          ((c.unit_retail_snapshot || 0) * (c.required_total || 0));
        totalPartsExposure += retailTotal;
      }

      // ── SERVICES exposure (SEPARATE from parts) ──
      let totalServicesBillable = 0;
      let totalServicesCost = 0;
      let totalServicesBilled = 0;
      let hasUnbilledServices = false;

      for (const sc of projectServices) {
        const billable = sc.total_billable || 0;
        const cost = (sc.total_cost > 0) ? sc.total_cost : ((sc.actual_cost ?? sc.estimated_cost ?? 0) * (sc.quantity || 1));
        totalServicesBillable += billable;
        totalServicesCost += cost;
        // CANONICAL: Use explicit is_billed flag, fallback to status
        const isBilled = sc.is_billed === true || sc.status === 'billed';
        if (isBilled) {
          totalServicesBilled += billable;
        } else if (billable > 0) {
          hasUnbilledServices = true;
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // CANONICAL: Invoice totals from actual ProjectInvoice entities
      // NOT from commitment.invoiced_amount snapshots (deprecated)
      // ═══════════════════════════════════════════════════════════════
      let totalInvoicedFromEntities = 0;
      let totalPaid = 0;
      let totalOutstanding = 0;
      let hasUnpaidParts = false;
      const VOID_STATUSES = new Set(['void', 'cancelled']);
      const DRAFT_STATUSES = new Set(['draft']);
      
      for (const inv of projectInvoices) {
        if (VOID_STATUSES.has(inv.status) || DRAFT_STATUSES.has(inv.status)) continue;
        const invTotal = inv.total ?? inv.subtotal ?? 0;
        const invPaid = inv.paid_amount ?? 0;
        totalInvoicedFromEntities += invTotal;
        totalPaid += invPaid;
        totalOutstanding += Math.max(0, invTotal - invPaid);
      }
      if (totalOutstanding > 0.01) hasUnpaidParts = true;

      // Calculate available credit
      let availableCredit = 0;
      for (const credit of projectCredits) {
        availableCredit += credit.remaining_amount || 0;
      }

      // CANONICAL: Remaining to bill from invoice entities, NOT commitment snapshots
      const totalProjectedRevenue = totalPartsExposure + totalServicesBillable;
      const remainingToBill = Math.max(0, totalProjectedRevenue - totalInvoicedFromEntities);

      const projectType = project.project_type_id ? projectTypeMap[project.project_type_id] : null;

      financialProjects.push({
        project_id: project.id,
        project_name: project.name,
        project_type_id: project.project_type_id,
        project_type_name: projectType?.name || 'Uncategorized',
        project_type_color: projectType?.color || '#6B7280',
        // PARTS totals (isolated — no service contamination)
        total_parts_exposure: totalPartsExposure,
        // CANONICAL: From actual ProjectInvoice entities, NOT commitment snapshots
        total_invoiced: totalInvoicedFromEntities,
        // SERVICES totals (isolated — no parts contamination)
        total_services_billable: totalServicesBillable,
        total_services_cost: totalServicesCost,
        total_services_billed: totalServicesBilled,
        // COMBINED totals
        total_exposure: totalPartsExposure + totalServicesBillable,
        total_paid: totalPaid,
        remaining_to_bill: remainingToBill,
        available_credit: availableCredit,
        has_parts_assigned: projectCommitments.length > 0,
        has_services_assigned: projectServices.length > 0,
        has_unpaid_parts: hasUnpaidParts,
        has_unbilled_services: hasUnbilledServices,
        commitment_count: projectCommitments.length,
        service_count: projectServices.length,
        invoice_count: projectInvoices.length,
      });
    }

    // Sort by project name
    financialProjects.sort((a, b) => a.project_name.localeCompare(b.project_name));

    // PERF: Timing log (dev only)
    const _perfEnd = Date.now();
    console.log('[PERF] getFinancialProjectsView', _perfEnd - _perfStart, 'ms', {
      entityCounts: {
        projects: projects.length,
        commitments: commitments.length,
        invoices: invoices.length,
        creditLedger: creditLedger.length,
        financialProjects: financialProjects.length,
      }
    });

    return Response.json({
      success: true,
      projects: financialProjects,
      summary: {
        total_projects: financialProjects.length,
        // PARTS-ONLY totals (no service contamination)
        total_parts_exposure: financialProjects.reduce((sum, p) => sum + p.total_parts_exposure, 0),
        total_invoiced: financialProjects.reduce((sum, p) => sum + p.total_invoiced, 0),
        // SERVICES-ONLY totals (no parts contamination)
        total_services_billable: financialProjects.reduce((sum, p) => sum + (p.total_services_billable || 0), 0),
        total_services_cost: financialProjects.reduce((sum, p) => sum + (p.total_services_cost || 0), 0),
        total_services_billed: financialProjects.reduce((sum, p) => sum + (p.total_services_billed || 0), 0),
        // COMBINED totals
        total_exposure: financialProjects.reduce((sum, p) => sum + p.total_exposure, 0),
        total_paid: financialProjects.reduce((sum, p) => sum + p.total_paid, 0),
        total_remaining: financialProjects.reduce((sum, p) => sum + p.remaining_to_bill, 0),
        total_credit_available: financialProjects.reduce((sum, p) => sum + p.available_credit, 0),
      }
    });

  } catch (error) {
    console.error('getFinancialProjectsView error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});