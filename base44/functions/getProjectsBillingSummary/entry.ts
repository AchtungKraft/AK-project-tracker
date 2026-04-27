import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getProjectsBillingSummary — Aggregated billable summary across all projects
 *
 * ALL billing eligibility logic is in computeItems() below.
 * That function is IDENTICAL to the one in:
 *   - functions/computeBillableItemsCore (canonical reference)
 *   - functions/resolveProjectBillableItems (project-level resolver)
 *
 * ⚠️  DO NOT modify computeItems() here without updating all 3 files.
 */

// ┌──────────────────────────────────────────────────────────────┐
// │  CANONICAL COMPUTE — v1.0 — COPY FROM computeBillableItemsCore │
// └──────────────────────────────────────────────────────────────┘
function computeItems({ partCommitments, serviceCommitments, partMap, lookups }) {
  const items = [];
  const warnings = [];
  const parts = partMap || {};
  const vendorLookup = lookups?.vendorMap || {};
  const categoryLookup = lookups?.categoryMap || {};
  const serviceLookup = lookups?.serviceMap || {};
  const serviceVendorLookup = lookups?.serviceVendorMap || {};

  for (const c of (partCommitments || [])) {
    if (c.cancelled_at || c.is_archived === true) continue;
    const part = parts[c.part_id];
    if (!part) continue;
    if (part.requires_client_billing === false) continue;
    if (part.part_type === 'WARRANTY_REPLACEMENT') continue;
    const requiredTotal = c.required_total ?? 0;
    const qtyRemoved = c.qty_removed ?? 0;
    const effectiveRequired = Math.max(0, requiredTotal - qtyRemoved);
    const invoicedQty = c.invoiced_qty ?? 0;
    const qtyAvailableToBill = Math.max(0, effectiveRequired - invoicedQty);
    if (qtyAvailableToBill <= 0) continue;
    const unitPrice = c.unit_retail_snapshot ?? 0;
    const unitCost = c.unit_cost_snapshot ?? 0;
    const lineTotal = qtyAvailableToBill * unitPrice;
    const costTotal = qtyAvailableToBill * unitCost;
    let needsReview = false;
    let reviewReason = null;
    if (unitPrice <= 0) {
      needsReview = true;
      reviewReason = 'MISSING_RETAIL: unit_retail_snapshot is 0 or missing.';
      warnings.push({ source_id: c.id, code: 'MISSING_RETAIL', message: reviewReason });
    }
    const vendor = part.default_vendor_id ? vendorLookup[part.default_vendor_id] : null;
    const category = part.part_category_id ? categoryLookup[part.part_category_id] : null;
    items.push({
      id: c.id, source_entity: 'PartCommitment', source_id: c.id, type: 'part',
      description: part.part_name || 'Unknown Part',
      part_id: c.part_id, part_name: part.part_name,
      part_number: part.vendor_part_number || null,
      vendor_id: part.default_vendor_id || null,
      vendor_name: vendor?.vendor_name || 'Unknown Vendor',
      category_id: part.part_category_id || null,
      category_name: category?.name || 'Uncategorized',
      required_total: requiredTotal, qty_removed: qtyRemoved,
      effective_required: effectiveRequired, invoiced_qty: invoicedQty,
      qty_available_to_bill: qtyAvailableToBill,
      unit_price: unitPrice, unit_cost: unitCost,
      line_total: lineTotal, cost_total: costTotal,
      already_billed_amount: c.invoiced_amount ?? 0,
      billing_locked: false, needs_review: needsReview, review_reason: reviewReason,
      metadata: { billing_status: c.billing_status, supply_source_type: c.supply_source_type },
    });
  }

  for (const sc of (serviceCommitments || [])) {
    const isServiceBilled = sc.is_billed === true || sc.status === 'billed' || !!sc.invoice_id;
    const totalBillable = sc.total_billable ?? 0;
    if (isServiceBilled || totalBillable <= 0) continue;
    const svc = serviceLookup[sc.service_id];
    const svcVendor = sc.vendor_id ? serviceVendorLookup[sc.vendor_id] : null;
    const effectiveCost = sc.total_cost ?? 0;
    items.push({
      id: sc.id, source_entity: 'ServiceCommitment', source_id: sc.id, type: 'service',
      description: sc.description || svc?.name || 'Unknown Service',
      part_id: null, part_name: null, part_number: null,
      service_id: sc.service_id, service_name: svc?.name || 'Unknown Service',
      vendor_id: sc.vendor_id || null, vendor_name: svcVendor?.name || null,
      category_id: null, category_name: svc?.name || 'Service',
      required_total: 1, qty_removed: 0, effective_required: 1, invoiced_qty: 0,
      qty_available_to_bill: 1,
      unit_price: totalBillable, unit_cost: effectiveCost,
      line_total: totalBillable, cost_total: effectiveCost,
      already_billed_amount: 0, billing_locked: false,
      needs_review: false, review_reason: null,
      metadata: { service_status: sc.status, service_commitment_id: sc.id },
    });
  }

  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'part' ? -1 : 1;
    return (a.description || '').localeCompare(b.description || '');
  });
  return { items, warnings };
}
// └──────────────────────────────────────────────────────────────┘

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

    // Fetch all needed data in parallel (single batch)
    const [allProjects, allCommitments, allServiceCommitments, allParts] = await Promise.all([
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

      const projectCommitments = commitmentsByProject[project.id] || [];
      const projectServices = servicesByProject[project.id] || [];
      if (projectCommitments.length === 0 && projectServices.length === 0) continue;

      // ── DELEGATE to canonical computeItems ──
      const { items } = computeItems({
        partCommitments: projectCommitments,
        serviceCommitments: projectServices,
        partMap,
        lookups: {},
      });

      if (items.length === 0) continue;

      const partItems = items.filter(i => i.type === 'part');
      const serviceItems = items.filter(i => i.type === 'service');
      const totalAmount = items.reduce((s, i) => s + i.line_total, 0);

      const topItems = [...items]
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
        billable_count: items.length,
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

    results.sort((a, b) => b.total_billable_amount - a.total_billable_amount);

    const totalUnbilledAmount = Math.round(
      results.reduce((s, r) => s + r.total_billable_amount, 0) * 100
    ) / 100;

    return Response.json({
      success: true,
      projects: results,
      total_unbilled_projects: results.length,
      total_unbilled_amount: totalUnbilledAmount,
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