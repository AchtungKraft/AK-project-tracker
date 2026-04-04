import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { vendor_type } = body;

    if (!vendor_type || !['PART', 'SERVICE'].includes(vendor_type)) {
      return Response.json({ error: 'vendor_type must be PART or SERVICE' }, { status: 400 });
    }

    // Fetch groups and vendors in parallel
    // For PART type, also include legacy vendors without vendor_type set
    const [allGroups, typedVendors, allVendorsRaw] = await Promise.all([
      base44.entities.VendorGroup.filter({ vendor_type }),
      base44.entities.Vendor.filter({ vendor_type }),
      vendor_type === 'PART' ? base44.entities.Vendor.filter({}) : Promise.resolve([]),
    ]);

    // Merge: typed vendors + untyped legacy vendors (for PART only)
    const typedIds = new Set(typedVendors.map(v => v.id));
    const legacyUntyped = vendor_type === 'PART'
      ? allVendorsRaw.filter(v => !v.vendor_type && !typedIds.has(v.id))
      : [];
    const allVendors = [...typedVendors, ...legacyUntyped];

    // Sort groups by sort_priority
    const activeGroups = allGroups
      .filter(g => g.is_active !== false)
      .sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));

    // Active vendors only
    const activeVendors = allVendors
      .filter(v => v.active !== false)
      .sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));

    // Build grouped result
    const grouped = activeGroups.map(group => ({
      group_id: group.id,
      group_name: group.name,
      sort_priority: group.sort_priority || 0,
      vendors: activeVendors.filter(v => v.vendor_group_id === group.id),
    }));

    // Ungrouped vendors (no group_id or group not found)
    const groupedVendorIds = new Set(grouped.flatMap(g => g.vendors.map(v => v.id)));
    const ungrouped = activeVendors.filter(v => !groupedVendorIds.has(v.id));

    if (ungrouped.length > 0) {
      grouped.push({
        group_id: null,
        group_name: 'Ungrouped',
        sort_priority: 999,
        vendors: ungrouped,
      });
    }

    return Response.json({
      vendor_type,
      groups: grouped,
      total_vendors: activeVendors.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});