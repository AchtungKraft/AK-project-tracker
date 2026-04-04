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

    // Fetch groups and vendors — strict type filter, no legacy fallback
    const [allGroups, allVendors] = await Promise.all([
      base44.entities.VendorGroup.filter({ vendor_type }),
      base44.entities.Vendor.filter({ vendor_type }),
    ]);

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

    // Filter out UNCATEGORIZED from operational UI (hide_uncategorized param)
    const body2 = body;
    const hideUncategorized = body2.hide_uncategorized !== false; // default true
    const finalGroups = hideUncategorized
      ? grouped.filter(g => g.group_name !== 'UNCATEGORIZED' || g.vendors.length > 0)
      : grouped;

    return Response.json({
      vendor_type,
      groups: finalGroups,
      total_vendors: activeVendors.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});