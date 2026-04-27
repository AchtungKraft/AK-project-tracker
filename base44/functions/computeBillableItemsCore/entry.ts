/*
 * ═══════════════════════════════════════════════════════════════
 * ⚠️  BILLING LOGIC CONTRACT
 *
 * computeItems() MUST be identical across:
 *   1. functions/computeBillableItemsCore  (CANONICAL SOURCE)
 *   2. functions/resolveProjectBillableItems
 *   3. functions/getProjectsBillingSummary
 *
 * If you change logic:
 *   1. Update computeItems() in ALL 3 files
 *   2. Bump BILLING_LOGIC_VERSION
 *   3. Update EXPECTED_OUTPUT in TEST_VECTOR if behavior changed
 * ═══════════════════════════════════════════════════════════════
 *
 * CANONICAL RULES:
 *
 * PARTS:
 *   Skip if: cancelled_at || is_archived || !part || !requires_client_billing || WARRANTY_REPLACEMENT
 *   effective_required = max(0, required_total - qty_removed)
 *   qty_available_to_bill = max(0, effective_required - invoiced_qty)
 *   Include only if qty_available_to_bill > 0
 *   unit_price = unit_retail_snapshot (NO fallback)
 *   line_total = qty_available_to_bill * unit_price
 *
 * SERVICES:
 *   isServiceBilled = is_billed === true || status === 'billed' || !!invoice_id
 *   Skip if: isServiceBilled || total_billable <= 0
 *   qty_available_to_bill = 1
 *   unit_price = total_billable
 *   line_total = total_billable
 * ═══════════════════════════════════════════════════════════════
 */

// ── Phase 4: Version lock ──
const BILLING_LOGIC_VERSION = "v1.0";

// ── Phase 1+2: Deterministic test vector with expected output ──
const TEST_VECTOR = {
  partCommitments: [{
    id: "TV_P1", part_id: "TV_PART_1", required_total: 5, qty_removed: 1,
    invoiced_qty: 2, unit_retail_snapshot: 100, unit_cost_snapshot: 50,
  }],
  serviceCommitments: [{
    id: "TV_S1", service_id: "TV_SVC_1", description: "Test Service",
    total_billable: 500, total_cost: 300, is_billed: false, status: "active", invoice_id: null,
  }],
  partMap: { "TV_PART_1": { part_name: "Test Part", requires_client_billing: true } },
  lookups: {},
};

const EXPECTED_OUTPUT = {
  item_count: 2,
  part: { source_entity: "PartCommitment", qty_available_to_bill: 2, line_total: 200 },
  service: { source_entity: "ServiceCommitment", qty_available_to_bill: 1, line_total: 500 },
};

function validateTestVector(callerName) {
  const result = computeItems(TEST_VECTOR);
  const errs = [];
  if (result.items.length !== EXPECTED_OUTPUT.item_count)
    errs.push(`item_count: got ${result.items.length}, expected ${EXPECTED_OUTPUT.item_count}`);
  const part = result.items.find(i => i.type === 'part');
  const svc = result.items.find(i => i.type === 'service');
  if (!part) errs.push('part item missing');
  else {
    if (part.source_entity !== EXPECTED_OUTPUT.part.source_entity)
      errs.push(`part.source_entity: got ${part.source_entity}, expected ${EXPECTED_OUTPUT.part.source_entity}`);
    if (part.qty_available_to_bill !== EXPECTED_OUTPUT.part.qty_available_to_bill)
      errs.push(`part.qty_available_to_bill: got ${part.qty_available_to_bill}, expected ${EXPECTED_OUTPUT.part.qty_available_to_bill}`);
    if (part.line_total !== EXPECTED_OUTPUT.part.line_total)
      errs.push(`part.line_total: got ${part.line_total}, expected ${EXPECTED_OUTPUT.part.line_total}`);
  }
  if (!svc) errs.push('service item missing');
  else {
    if (svc.source_entity !== EXPECTED_OUTPUT.service.source_entity)
      errs.push(`svc.source_entity: got ${svc.source_entity}, expected ${EXPECTED_OUTPUT.service.source_entity}`);
    if (svc.qty_available_to_bill !== EXPECTED_OUTPUT.service.qty_available_to_bill)
      errs.push(`svc.qty_available_to_bill: got ${svc.qty_available_to_bill}, expected ${EXPECTED_OUTPUT.service.qty_available_to_bill}`);
    if (svc.line_total !== EXPECTED_OUTPUT.service.line_total)
      errs.push(`svc.line_total: got ${svc.line_total}, expected ${EXPECTED_OUTPUT.service.line_total}`);
  }
  if (errs.length > 0) {
    console.error(`🚨 CRITICAL: Billing logic drift detected in ${callerName}! Failures: ${errs.join('; ')}`);
  }
  return { ok: errs.length === 0, errors: errs };
}

// ┌──────────────────────────────────────────────────────────────┐
// │  CANONICAL COMPUTE FUNCTION — SHARED BETWEEN ALL CONSUMERS  │
// │  VERSION: v1.0                                               │
// │  CONSUMERS: resolveProjectBillableItems,                     │
// │             getProjectsBillingSummary                         │
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

// ── HTTP ENDPOINT ──
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
    const payload = await req.json();

    // Dev tool: run test vector validation
    if (payload._runTestVector) {
      const validation = validateTestVector('computeBillableItemsCore');
      return Response.json({ BILLING_LOGIC_VERSION, _test_vector_validation: validation });
    }

    const result = computeItems(payload);
    return Response.json({ success: true, BILLING_LOGIC_VERSION, ...result });
  } catch (error) {
    console.error('computeBillableItemsCore error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});