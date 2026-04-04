/**
 * getPartVendorSources — Canonical read model for part vendor sources.
 * Returns enriched vendor source data sorted: preferred first, then sort_order, then vendor_name.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { part_id } = await req.json();
    if (!part_id) return Response.json({ error: 'part_id required' }, { status: 400 });

    // Fetch sources for this part
    const sources = await base44.entities.PartVendorSource.filter({ part_id });
    const activeSources = sources.filter(s => s.is_active !== false);

    if (activeSources.length === 0) {
      return Response.json({ success: true, part_id, sources: [] });
    }

    // Resolve vendors + groups
    const vendorIds = [...new Set(activeSources.map(s => s.vendor_id).filter(Boolean))];
    const vendors = vendorIds.length > 0
      ? await base44.entities.Vendor.filter({ id: { $in: vendorIds } })
      : [];
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    const groupIds = [...new Set(vendors.map(v => v.vendor_group_id).filter(Boolean))];
    const groups = groupIds.length > 0
      ? await base44.entities.VendorGroup.filter({ id: { $in: groupIds } })
      : [];
    const groupMap = new Map(groups.map(g => [g.id, g]));

    // Build enriched response
    const enriched = activeSources.map(s => {
      const vendor = vendorMap.get(s.vendor_id);
      const group = vendor?.vendor_group_id ? groupMap.get(vendor.vendor_group_id) : null;
      return {
        id: s.id,
        vendor_id: s.vendor_id,
        vendor_name: vendor?.vendor_name || 'Unknown',
        vendor_group_id: vendor?.vendor_group_id || null,
        vendor_group_name: group?.name || null,
        vendor_url: s.order_url || null,
        vendor_sku: s.vendor_part_number || null,
        cost: s.unit_cost || 0,
        notes: s.notes || null,
        is_preferred: s.is_preferred || false,
        sort_order: s.sort_order || 0,
      };
    });

    // Sort: preferred first, then sort_order ASC, then vendor_name ASC
    enriched.sort((a, b) => {
      if (a.is_preferred !== b.is_preferred) return a.is_preferred ? -1 : 1;
      if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
      return (a.vendor_name || '').localeCompare(b.vendor_name || '');
    });

    return Response.json({ success: true, part_id, sources: enriched });
  } catch (error) {
    console.error('getPartVendorSources error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});