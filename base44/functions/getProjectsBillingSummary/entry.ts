import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getProjectsBillingSummary — Aggregated billable summary across all projects
 *
 * Returns projects that have unbilled items, with counts and totals.
 * Uses resolveProjectBillableItems logic inline to avoid N+1 calls.
 *
 * Response: { projects: [{ project_id, project_name, client_name, billable_count, total_billable_amount, breakdown: { parts_count, services_count, parts_total, services_total } }] }
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

    // Fetch all needed data in parallel (single batch, not per-project)
    const [
      allProjects,
      allCommitments,
      allServiceCommitments,
      allParts,
    ] = await Promise.all([
      base44.entities.Project.list(),
      base44.entities.PartCommitment.list(),
      base44.entities.ServiceCommitment.list().catch(() => []),
      base44.entities.Part.list(),
    ]);

    const partMap = Object.fromEntries(allParts.map(p => [p.id, p]));
    const projectMap = Object.fromEntries(allProjects.map(p => [p.id, p]));

    // Group commitments by project
    const commitmentsByProject = {};
    for (const c of allCommitments) {
      if (!commitmentsByProject[c.project_id]) commitmentsByProject[c.project_id] = [];
      commitmentsByProject[c.project_id].push(c);
    }

    const servicesByProject = {};
    for (const sc of allServiceCommitments) {
      if (!servicesByProject[sc.project_id]) servicesByProject[sc.project_id] = [];
      servicesByProject[sc.project_id].push(sc);
    }

    const results = [];

    for (const project of allProjects) {
      if (project.is_system_project) continue;

      let partsCount = 0;
      let partsTotal = 0;
      let servicesCount = 0;
      let servicesTotal = 0;

      // Parts: same logic as resolveProjectBillableItems
      const commitments = commitmentsByProject[project.id] || [];
      for (const c of commitments) {
        if (c.cancelled_at || c.is_archived === true) continue;
        const part = partMap[c.part_id];
        if (!part) continue;
        if (part.requires_client_billing === false) continue;
        if (part.part_type === 'WARRANTY_REPLACEMENT') continue;

        const effectiveRequired = Math.max(0, (c.required_total ?? 0) - (c.qty_removed ?? 0));
        const invoicedQty = c.invoiced_qty ?? 0;
        const qtyAvailable = Math.max(0, effectiveRequired - invoicedQty);
        if (qtyAvailable <= 0) continue;

        const unitPrice = c.unit_retail_snapshot ?? 0;
        partsCount++;
        partsTotal += qtyAvailable * unitPrice;
      }

      // Services: same canonical check
      const svcCommitments = servicesByProject[project.id] || [];
      for (const sc of svcCommitments) {
        const isServiceBilled = sc.is_billed === true || sc.status === 'billed' || !!sc.invoice_id;
        const totalBillable = sc.total_billable ?? 0;
        if (isServiceBilled || totalBillable <= 0) continue;

        servicesCount++;
        servicesTotal += totalBillable;
      }

      const totalCount = partsCount + servicesCount;
      if (totalCount === 0) continue;

      results.push({
        project_id: project.id,
        project_name: project.name,
        client_name: project.client_name || null,
        billable_count: totalCount,
        total_billable_amount: Math.round((partsTotal + servicesTotal) * 100) / 100,
        breakdown: {
          parts_count: partsCount,
          services_count: servicesCount,
          parts_total: Math.round(partsTotal * 100) / 100,
          services_total: Math.round(servicesTotal * 100) / 100,
        },
      });
    }

    // Sort by total_billable_amount DESC
    results.sort((a, b) => b.total_billable_amount - a.total_billable_amount);

    return Response.json({
      success: true,
      projects: results,
      total_unbilled_projects: results.length,
      total_unbilled_amount: Math.round(results.reduce((s, r) => s + r.total_billable_amount, 0) * 100) / 100,
    });
  } catch (error) {
    console.error('getProjectsBillingSummary error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});