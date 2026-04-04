/**
 * getServicesView — Canonical read model for service commitments.
 *
 * Pre-joins Service, ServiceVendor, Project names + category.
 * Computes effective cost, margin, and has_line_items flag.
 *
 * Params (all optional):
 *   project_id  — filter to one project
 *   status      — filter by commitment status
 *   vendor_id   — filter by vendor
 *   include_line_items — if true, attach line_items[] to each commitment
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, status, vendor_id, include_line_items } = body;

    // ── Fetch all data in parallel ──
    const commitmentFilter = {};
    if (project_id) commitmentFilter.project_id = project_id;
    if (status) commitmentFilter.status = status;
    if (vendor_id) commitmentFilter.vendor_id = vendor_id;

    const hasFilter = Object.keys(commitmentFilter).length > 0;

    const [commitments, services, vendors, projects] = await Promise.all([
      hasFilter
        ? base44.asServiceRole.entities.ServiceCommitment.filter(commitmentFilter)
        : base44.asServiceRole.entities.ServiceCommitment.list('-created_date', 500),
      base44.asServiceRole.entities.Service.list(),
      base44.asServiceRole.entities.ServiceVendor.list(),
      base44.asServiceRole.entities.Project.list('-created_date', 500),
    ]);

    // ── Build lookup maps ──
    const serviceMap = new Map(services.map(s => [s.id, s]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // ── Optionally fetch all line items for has_line_items flag ──
    // We need to know which commitments have line items, so fetch them grouped
    const commitmentIds = commitments.map(c => c.id);
    let lineItemsByCommitment = new Map();

    if (commitmentIds.length > 0) {
      // Fetch all line items for these commitments
      const allLineItems = await base44.asServiceRole.entities.ServiceLineItem.filter({
        service_commitment_id: { $in: commitmentIds },
      });
      for (const li of allLineItems) {
        if (!lineItemsByCommitment.has(li.service_commitment_id)) {
          lineItemsByCommitment.set(li.service_commitment_id, []);
        }
        lineItemsByCommitment.get(li.service_commitment_id).push(li);
      }
    }

    // ── Enrich each commitment ──
    const enriched = commitments.map(c => {
      const service = serviceMap.get(c.service_id);
      const vendor = c.vendor_id ? vendorMap.get(c.vendor_id) : null;
      const project = projectMap.get(c.project_id);
      const lineItems = lineItemsByCommitment.get(c.id) || [];

      const effectiveCost = getEffectiveServiceCost(c);
      const totalBillable = c.total_billable || 0;
      const marginPct = totalBillable > 0
        ? ((totalBillable - effectiveCost) / totalBillable) * 100
        : 0;

      const result = {
        // Core identity
        id: c.id,
        created_date: c.created_date,
        updated_date: c.updated_date,

        // Status + lifecycle
        status: c.status || 'planned',
        ordered_date: c.ordered_date || null,
        completed_date: c.completed_date || null,
        billed_date: c.billed_date || null,

        // Service (pre-joined)
        service_id: c.service_id,
        service_name: service?.name || 'Unknown Service',
        service_category: service?.category || 'other',

        // Vendor (pre-joined)
        vendor_id: c.vendor_id || null,
        vendor_name: vendor?.name || null,

        // Project (pre-joined)
        project_id: c.project_id,
        project_name: project?.name || 'Unknown Project',

        // Instance fields
        description: c.description || '',
        quantity: c.quantity || 1,
        notes: c.notes || null,
        invoice_reference: c.invoice_reference || null,

        // Financial (canonical)
        total_cost: effectiveCost,
        total_billable: totalBillable,
        margin_pct: Math.round(marginPct * 10) / 10,

        // Override flags
        cost_override: c.cost_override || false,
        retail_override: c.retail_override || false,

        // Line items metadata
        has_line_items: lineItems.length > 0,
        line_item_count: lineItems.length,

        // Legacy fields (preserved for transition)
        estimated_cost: c.estimated_cost ?? 0,
        actual_cost: c.actual_cost ?? null,
        raw_total_cost: c.total_cost ?? 0,
      };

      // Optionally include full line items
      if (include_line_items) {
        result.line_items = lineItems.map(li => ({
          id: li.id,
          type: li.type,
          description: li.description,
          vendor_id: li.vendor_id || null,
          vendor_name: li.vendor_id ? vendorMap.get(li.vendor_id)?.name || null : null,
          cost: li.cost || 0,
          billing_rate: li.billing_rate || 0,
          quantity: li.quantity || 1,
          sort_order: li.sort_order || 0,
          notes: li.notes || null,
        }));
      }

      return result;
    });

    // ── Compute summary ──
    const summary = {
      total: enriched.length,
      by_status: { planned: 0, ordered: 0, completed: 0, billed: 0 },
      total_cost: 0,
      total_billable: 0,
      margin_pct: 0,
    };
    for (const e of enriched) {
      summary.by_status[e.status] = (summary.by_status[e.status] || 0) + 1;
      summary.total_cost += e.total_cost;
      summary.total_billable += e.total_billable;
    }
    summary.total_cost = Math.round(summary.total_cost * 100) / 100;
    summary.total_billable = Math.round(summary.total_billable * 100) / 100;
    summary.margin_pct = summary.total_billable > 0
      ? Math.round(((summary.total_billable - summary.total_cost) / summary.total_billable) * 1000) / 10
      : 0;

    return Response.json({
      success: true,
      commitments: enriched,
      summary,
    });

  } catch (error) {
    console.error('getServicesView error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * getEffectiveServiceCost — CANONICAL cost resolver for service commitments.
 * Prefer line-item-derived total_cost; fall back to legacy fields.
 */
function getEffectiveServiceCost(c) {
  if (c.total_cost > 0) return c.total_cost;
  return (c.actual_cost ?? c.estimated_cost ?? 0) * (c.quantity || 1);
}