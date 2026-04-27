import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getProjectsBillingSummary — Aggregated billable summary across all projects
 *
 * PHASE 1 CANONICAL: Uses IDENTICAL logic to resolveProjectBillableItems.
 * The eligibility rules are copy-pasted from the resolver, NOT re-invented.
 * Any change to resolver rules MUST be mirrored here.
 *
 * CANONICAL RULES (from resolveProjectBillableItems):
 * - Parts: skip cancelled/archived, skip non-billable, skip WARRANTY_REPLACEMENT
 *          effective_required = required_total - qty_removed
 *          qty_available = effective_required - invoiced_qty
 *          unit_price = unit_retail_snapshot (NO fallback)
 * - Services: skip if (is_billed || status==='billed' || invoice_id)
 *             skip if total_billable <= 0
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

    // Group by project
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

      const billableItems = [];

      // ════════════════════════════════════════
      // PARTS — IDENTICAL to resolveProjectBillableItems
      // ════════════════════════════════════════
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
        const lineTotal = qtyAvailable * unitPrice;

        billableItems.push({
          type: 'part',
          description: part.part_name || 'Unknown Part',
          line_total: lineTotal,
        });
      }

      // ════════════════════════════════════════
      // SERVICES — IDENTICAL to resolveProjectBillableItems
      // ════════════════════════════════════════
      const svcCommitments = servicesByProject[project.id] || [];
      for (const sc of svcCommitments) {
        const isServiceBilled = sc.is_billed === true || sc.status === 'billed' || !!sc.invoice_id;
        const totalBillable = sc.total_billable ?? 0;
        if (isServiceBilled || totalBillable <= 0) continue;

        billableItems.push({
          type: 'service',
          description: sc.description || 'Unknown Service',
          line_total: totalBillable,
        });
      }

      if (billableItems.length === 0) continue;

      const partItems = billableItems.filter(i => i.type === 'part');
      const serviceItems = billableItems.filter(i => i.type === 'service');
      const totalAmount = billableItems.reduce((s, i) => s + i.line_total, 0);

      // PHASE 6: Top 2 items by value for UI preview
      const topItems = [...billableItems]
        .sort((a, b) => b.line_total - a.line_total)
        .slice(0, 2)
        .map(i => ({
          description: i.description,
          line_total: Math.round(i.line_total * 100) / 100,
          type: i.type,
        }));

      results.push({
        project_id: project.id,
        project_name: project.name,
        client_name: project.client_name || null,
        billable_count: billableItems.length,
        total_billable_amount: Math.round(totalAmount * 100) / 100,
        top_items: topItems,
        breakdown: {
          parts_count: partItems.length,
          services_count: serviceItems.length,
          parts_total: Math.round(partItems.reduce((s, i) => s + i.line_total, 0) * 100) / 100,
          services_total: Math.round(serviceItems.reduce((s, i) => s + i.line_total, 0) * 100) / 100,
        },
      });
    }

    // PHASE 3: Sort by total_billable_amount DESC (deterministic)
    results.sort((a, b) => b.total_billable_amount - a.total_billable_amount);

    const totalUnbilledAmount = Math.round(
      results.reduce((s, r) => s + r.total_billable_amount, 0) * 100
    ) / 100;

    return Response.json({
      success: true,
      projects: results,
      total_unbilled_projects: results.length,
      total_unbilled_amount: totalUnbilledAmount,
      // PHASE 9: Debug diagnostics
      _debug: {
        projects_scanned: allProjects.filter(p => !p.is_system_project).length,
        projects_with_billable: results.length,
        total_unbilled_amount: totalUnbilledAmount,
      },
    });
  } catch (error) {
    console.error('getProjectsBillingSummary error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});