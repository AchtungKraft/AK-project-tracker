import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all active commitments, parts, vendors, vendor sources, and vendor groups
    const [commitments, parts, vendors, vendorSources, vendorGroups] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.filter({}),
      base44.asServiceRole.entities.Part.filter({}),
      base44.asServiceRole.entities.Vendor.filter({}),
      base44.asServiceRole.entities.PartVendorSource.filter({}),
      base44.asServiceRole.entities.VendorGroup.filter({}),
    ]);

    // Build lookup maps
    const partMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v]));
    const groupMap = Object.fromEntries(vendorGroups.map(g => [g.id, g]));

    // Build part → preferred vendor source map
    // For each part, find its preferred source (is_preferred) or fall back to default_vendor_id
    const partPreferredVendor = {};
    for (const src of vendorSources) {
      if (!src.is_active) continue;
      if (src.is_preferred) {
        partPreferredVendor[src.part_id] = src.vendor_id;
      }
    }
    // Fall back to part.default_vendor_id if no preferred source
    for (const p of parts) {
      if (!partPreferredVendor[p.id] && p.default_vendor_id) {
        partPreferredVendor[p.id] = p.default_vendor_id;
      }
    }

    // Build vendor source lookup: vendor_id → Set of part_ids they supply
    const vendorPartSources = {};
    for (const src of vendorSources) {
      if (!src.is_active) continue;
      if (!vendorPartSources[src.vendor_id]) vendorPartSources[src.vendor_id] = new Set();
      vendorPartSources[src.vendor_id].add(src.part_id);
    }

    // Process commitments — find ones with to_order > 0
    const vendorAgg = {}; // vendor_id → { parts: Set, total_value, urgent_count }

    for (const c of commitments) {
      if (c.commitment_status === 'cancelled') continue;

      const requiredTotal = c.required_total || 0;
      const reservedFromStock = c.reserved_from_stock || 0;
      const coveredFromPO = c.covered_from_po || 0;
      const toOrder = requiredTotal - reservedFromStock - coveredFromPO;

      if (toOrder <= 0) continue;

      const part = partMap[c.part_id];
      if (!part || !part.is_active) continue;

      // Determine which vendor this part would be ordered from
      const vendorId = partPreferredVendor[c.part_id];
      if (!vendorId) continue;

      const vendor = vendorMap[vendorId];
      if (!vendor || !vendor.active) continue;

      const unitCost = part.cost || 0;
      const lineValue = toOrder * unitCost;

      // Urgency: no coverage at all
      const isUrgent = coveredFromPO === 0 && reservedFromStock === 0;

      if (!vendorAgg[vendorId]) {
        vendorAgg[vendorId] = {
          vendor_id: vendorId,
          vendor_name: vendor.vendor_name,
          group_name: vendor.vendor_group_id ? (groupMap[vendor.vendor_group_id]?.name || '') : '',
          color: vendor.color || '#3B82F6',
          parts: new Set(),
          total_value: 0,
          urgent_count: 0,
        };
      }

      vendorAgg[vendorId].parts.add(c.part_id);
      vendorAgg[vendorId].total_value += lineValue;
      if (isUrgent) vendorAgg[vendorId].urgent_count += 1;
    }

    // Convert to array and sort
    const queue = Object.values(vendorAgg)
      .map(v => ({
        vendor_id: v.vendor_id,
        vendor_name: v.vendor_name,
        group_name: v.group_name,
        color: v.color,
        parts_count: v.parts.size,
        total_value: Math.round(v.total_value * 100) / 100,
        urgent_count: v.urgent_count,
      }))
      .sort((a, b) => {
        if (b.urgent_count !== a.urgent_count) return b.urgent_count - a.urgent_count;
        if (b.total_value !== a.total_value) return b.total_value - a.total_value;
        return b.parts_count - a.parts_count;
      });

    return Response.json({ queue });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});