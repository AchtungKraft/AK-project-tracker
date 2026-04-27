import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * resolveProjectBillableItems — Project-level billable item resolver
 *
 * ALL billing eligibility logic is in computeItems() below.
 * That function is IDENTICAL to the one in:
 *   - functions/computeBillableItemsCore (canonical reference)
 *   - functions/getProjectsBillingSummary (aggregator copy)
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

    const { project_id } = await req.json();
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // ── Parallel fetch ──
    const [
      commitments, serviceCommitments, parts, vendors, categories, services, serviceVendors,
    ] = await Promise.all([
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.ServiceCommitment.filter({ project_id }).catch(() => []),
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartCategory.list(),
      base44.entities.Service.list().catch(() => []),
      base44.entities.ServiceVendor.list().catch(() => []),
    ]);

    const partMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v]));
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const serviceMap = Object.fromEntries(services.map(s => [s.id, s]));
    const serviceVendorMap = Object.fromEntries(serviceVendors.map(v => [v.id, v]));

    // ── DELEGATE to canonical computeItems ──
    const { items, warnings } = computeItems({
      partCommitments: commitments,
      serviceCommitments,
      partMap,
      lookups: { vendorMap, categoryMap, serviceMap, serviceVendorMap },
    });

    const partItems = items.filter(i => i.type === 'part');
    const serviceItems = items.filter(i => i.type === 'service');

    return Response.json({
      success: true,
      project_id,
      items,
      summary: {
        total_items: items.length,
        part_count: partItems.length,
        service_count: serviceItems.length,
        parts_total: partItems.reduce((s, i) => s + i.line_total, 0),
        services_total: serviceItems.reduce((s, i) => s + i.line_total, 0),
        grand_total: items.reduce((s, i) => s + i.line_total, 0),
        items_needing_review: items.filter(i => i.needs_review).length,
      },
      warnings: warnings.length > 0 ? warnings : null,
    });
  } catch (error) {
    console.error('resolveProjectBillableItems error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});