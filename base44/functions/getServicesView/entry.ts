/**
 * getServicesView — Canonical read model for service commitments.
 *
 * STABILIZED: Phases 1, 2, 5, 6, 7
 * - Line items are the ONLY source of cost truth (no legacy fallback)
 * - Planned vs actual cost comparison
 * - Internal vs external cost split
 * - Negative margin warnings
 * - Billing lock status
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Build full hierarchy path for a group: "Finishing / Chrome Plating"
function resolveGroupPath(groupId, groupMap) {
  if (!groupId) return null;
  const parts = [];
  let current = groupId;
  const visited = new Set();
  while (current) {
    if (visited.has(current)) break;
    visited.add(current);
    const group = groupMap.get(current);
    if (!group) break;
    parts.unshift(group.name);
    current = group.parent_group_id || null;
  }
  return parts.length > 0 ? parts.join(' / ') : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, status, vendor_id, include_line_items } = body;

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

    // Also fetch vendor groups for group name resolution
    const vendorGroupsList = await base44.asServiceRole.entities.VendorGroup.filter({ vendor_type: 'SERVICE' });
    const vendorGroupMap = new Map(vendorGroupsList.map(g => [g.id, g]));

    const serviceMap = new Map(services.map(s => [s.id, s]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    const commitmentIds = commitments.map(c => c.id);
    const lineItemsByCommitment = new Map();

    if (commitmentIds.length > 0) {
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

    const r2 = n => Math.round((n || 0) * 100) / 100;

    const enriched = commitments.map(c => {
      const service = serviceMap.get(c.service_id);
      const vendor = c.vendor_id ? vendorMap.get(c.vendor_id) : null;
      const project = projectMap.get(c.project_id);
      const lineItems = lineItemsByCommitment.get(c.id) || [];

      // PHASE 1+5: Line items are the ONLY source of cost. No legacy fallback.
      let totalCost = 0, totalBillable = 0, externalCost = 0, internalCost = 0;
      for (const li of lineItems) {
        const qty = li.quantity || 1;
        const lineCost = (li.cost || 0) * qty;
        totalCost += lineCost;
        totalBillable += (li.billing_rate || 0) * qty;
        // PHASE 7: Split
        if (li.type === 'internal_labor') internalCost += lineCost;
        else externalCost += lineCost;
      }

      // If no line items exist, use stored total_cost (for freshly migrated data)
      // but NEVER fall back to legacy estimated_cost/actual_cost
      if (lineItems.length === 0 && (c.total_cost || 0) > 0) {
        totalCost = c.total_cost;
        totalBillable = c.total_billable || 0;
        externalCost = totalCost; // assume external if no line items to classify
      }

      const marginPct = totalBillable > 0
        ? ((totalBillable - totalCost) / totalBillable) * 100
        : 0;

      // PHASE 2: Planned vs actual
      const plannedCost = c.planned_cost ?? 0;
      const plannedBillable = c.planned_billable ?? 0;
      const plannedMargin = plannedBillable > 0 ? ((plannedBillable - plannedCost) / plannedBillable) * 100 : 0;
      const costVariance = r2(totalCost - plannedCost);
      const billableVariance = r2(totalBillable - plannedBillable);

      // CANONICAL: Billing lock = is_billed || invoice_id present
      const billingLocked = c.is_billed === true || c.invoice_id != null;

      // PHASE 6: Negative margin warning
      const marginWarning = totalBillable > 0 && totalCost > totalBillable;

      const result = {
        id: c.id,
        created_date: c.created_date,
        updated_date: c.updated_date,

        status: c.status || 'planned',
        is_billed: c.is_billed || false,
        billing_locked: billingLocked,
        ordered_date: c.ordered_date || null,
        completed_date: c.completed_date || null,
        billed_date: c.billed_date || null,

        service_id: c.service_id,
        service_name: service?.name || 'Unknown Service',
        service_group_id: service?.preferred_vendor_group_id || null,
        service_group_name: service?.preferred_vendor_group_id ? resolveGroupPath(service.preferred_vendor_group_id, vendorGroupMap) : null,

        vendor_id: c.vendor_id || null,
        vendor_name: vendor?.name || null,

        project_id: c.project_id,
        project_name: project?.name || 'Unknown Project',

        description: c.description || '',
        quantity: c.quantity || 1,
        notes: c.notes || null,
        invoice_reference: c.invoice_reference || null,
        invoice_id: c.invoice_id || null,

        // CANONICAL financial (line-item derived ONLY)
        total_cost: r2(totalCost),
        total_billable: r2(totalBillable),
        margin_pct: Math.round(marginPct * 10) / 10,

        // PHASE 7: Internal vs external cost split
        external_cost: r2(externalCost),
        internal_cost: r2(internalCost),

        // PHASE 2: Planned vs actual
        planned_cost: r2(plannedCost),
        planned_billable: r2(plannedBillable),
        planned_margin_pct: Math.round(plannedMargin * 10) / 10,
        cost_variance: costVariance,
        billable_variance: billableVariance,

        // PHASE 6: Margin warning
        margin_warning: marginWarning,

        // Override flags
        cost_override: c.cost_override || false,
        retail_override: c.retail_override || false,

        // Line items metadata
        has_line_items: lineItems.length > 0,
        line_item_count: lineItems.length,
      };

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

    // Summary — includes per-status cost totals for canonical cost derivation
    const summary = {
      total: enriched.length,
      by_status: { planned: 0, ordered: 0, completed: 0, billed: 0 },
      total_cost: 0,
      total_billable: 0,
      external_cost: 0,
      internal_cost: 0,
      planned_cost: 0,
      planned_billable: 0,
      margin_pct: 0,
      margin_warning_count: 0,
      // CANONICAL: Per-status cost totals (actual $ in each bucket, not pro-rated)
      cost_by_status: { planned: 0, ordered: 0, completed: 0, billed: 0 },
      billable_by_status: { planned: 0, ordered: 0, completed: 0, billed: 0 },
    };
    for (const e of enriched) {
      const st = e.status || 'planned';
      summary.by_status[st] = (summary.by_status[st] || 0) + 1;
      summary.total_cost += e.total_cost;
      summary.total_billable += e.total_billable;
      summary.external_cost += e.external_cost;
      summary.internal_cost += e.internal_cost;
      summary.planned_cost += e.planned_cost;
      summary.planned_billable += e.planned_billable;
      if (e.margin_warning) summary.margin_warning_count++;
      // CANONICAL: Accumulate real cost per status bucket
      summary.cost_by_status[st] = (summary.cost_by_status[st] || 0) + e.total_cost;
      summary.billable_by_status[st] = (summary.billable_by_status[st] || 0) + e.total_billable;
    }
    summary.total_cost = r2(summary.total_cost);
    summary.total_billable = r2(summary.total_billable);
    summary.external_cost = r2(summary.external_cost);
    summary.internal_cost = r2(summary.internal_cost);
    summary.planned_cost = r2(summary.planned_cost);
    summary.planned_billable = r2(summary.planned_billable);
    summary.cost_by_status.planned = r2(summary.cost_by_status.planned);
    summary.cost_by_status.ordered = r2(summary.cost_by_status.ordered);
    summary.cost_by_status.completed = r2(summary.cost_by_status.completed);
    summary.cost_by_status.billed = r2(summary.cost_by_status.billed);
    summary.billable_by_status.planned = r2(summary.billable_by_status.planned);
    summary.billable_by_status.ordered = r2(summary.billable_by_status.ordered);
    summary.billable_by_status.completed = r2(summary.billable_by_status.completed);
    summary.billable_by_status.billed = r2(summary.billable_by_status.billed);
    summary.margin_pct = summary.total_billable > 0
      ? Math.round(((summary.total_billable - summary.total_cost) / summary.total_billable) * 1000) / 10
      : 0;

    return Response.json({ success: true, commitments: enriched, summary });

  } catch (error) {
    console.error('getServicesView error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});