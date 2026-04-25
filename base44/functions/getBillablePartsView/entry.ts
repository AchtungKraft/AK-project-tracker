import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * PHASE 1 — Canonical Billable Parts View
 * 
 * Returns grouped structure of billable parts for a project.
 * 
 * Rules:
 * - Only include commitments where billing_status != "paid"
 * - Only include commitments where remaining_to_bill > 0
 * - No lifecycle leakage - purely financial state
 * - No draft logic here
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

    const body = await req.json();
    const { project_id, grouping_mode = 'vendor' } = body;

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Fetch commitments first, then scope parts/vendors to referenced IDs
    const [commitments, categories] = await Promise.all([
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.PartCategory.filter({})
    ]);

    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const parts = partIds.length > 0
      ? await base44.entities.Part.filter({ id: { $in: partIds } })
      : [];

    const vendorIds = [...new Set(parts.map(p => p.default_vendor_id).filter(Boolean))];
    const vendors = vendorIds.length > 0
      ? await base44.entities.Vendor.filter({ id: { $in: vendorIds } })
      : [];

    const partMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v]));
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

    // Filter to billable commitments only
    const billableItems = [];

    for (const c of commitments) {
      // Skip paid commitments
      if (c.billing_status === 'paid') continue;

      const part = partMap[c.part_id];
      if (!part) continue;

      // CANONICAL: effective_required = required_total - qty_removed
      const unitRetail = c.unit_retail_snapshot || 0;
      const requiredTotal = c.required_total || 0;
      const qtyRemoved = c.qty_removed || 0;
      const effectiveRequired = Math.max(0, requiredTotal - qtyRemoved);
      const plannedRetailTotal = unitRetail * effectiveRequired;
      const invoicedAmount = c.invoiced_amount || 0;
      const remainingToBill = plannedRetailTotal - invoicedAmount;

      // Skip if nothing remaining to bill
      if (remainingToBill <= 0) continue;

      // Calculate qty remaining to bill
      const qtyRemainingToBill = unitRetail > 0 
        ? remainingToBill / unitRetail 
        : 0;

      // Get grouping info
      const vendor = part.default_vendor_id ? vendorMap[part.default_vendor_id] : null;
      const category = part.part_category_id ? categoryMap[part.part_category_id] : null;

      billableItems.push({
        part_commitment_id: c.id,
        part_id: c.part_id,
        part_name: part.part_name,
        vendor_id: part.default_vendor_id,
        vendor_name: vendor?.name || 'No Vendor',
        category_id: part.part_category_id,
        category_name: category?.name || 'Uncategorized',
        required_total: requiredTotal,
        qty_removed: qtyRemoved,
        effective_required: effectiveRequired,
        unit_price: unitRetail,
        invoiced_qty: c.invoiced_qty || 0,
        invoiced_amount: invoicedAmount,
        qty_remaining_to_bill: qtyRemainingToBill,
        remaining_to_bill: remainingToBill,
        billing_status: c.billing_status || 'unbilled'
      });
    }

    // Group by selected mode
    const groups = {};
    
    for (const item of billableItems) {
      let groupKey, groupId;
      
      if (grouping_mode === 'vendor') {
        groupKey = item.vendor_name;
        groupId = item.vendor_id || 'no_vendor';
      } else {
        groupKey = item.category_name;
        groupId = item.category_id || 'uncategorized';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          group_key: groupKey,
          group_id: groupId,
          group_total: 0,
          items: []
        };
      }

      groups[groupKey].items.push(item);
      groups[groupKey].group_total += item.remaining_to_bill;
    }

    // Convert to array and sort
    const groupedResult = Object.values(groups)
      .sort((a, b) => a.group_key.localeCompare(b.group_key));

    // Sort items within each group
    for (const group of groupedResult) {
      group.items.sort((a, b) => a.part_name.localeCompare(b.part_name));
    }

    return Response.json({
      success: true,
      project_id,
      grouping_mode,
      groups: groupedResult,
      summary: {
        total_items: billableItems.length,
        total_remaining_to_bill: billableItems.reduce((sum, i) => sum + i.remaining_to_bill, 0),
        group_count: groupedResult.length
      }
    });

  } catch (error) {
    console.error('getBillablePartsView error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});