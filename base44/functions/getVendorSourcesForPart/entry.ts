/**
 * getVendorSourcesForPart.js
 * Returns all active vendor sources for a given part, with vendor names resolved.
 * Also returns the "effective" preferred source (PartVendorSource.is_preferred || Part.default_vendor_id fallback).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { part_id } = await req.json();
    if (!part_id) return Response.json({ error: 'part_id required' }, { status: 400 });

    const [partArr, sources] = await Promise.all([
      base44.entities.Part.filter({ id: part_id }),
      base44.entities.PartVendorSource.filter({ part_id, is_active: true }),
    ]);

    const part = partArr[0];
    if (!part) return Response.json({ error: 'Part not found' }, { status: 404 });

    // Resolve vendor names
    const vendorIds = [...new Set(sources.map(s => s.vendor_id).filter(Boolean))];
    if (part.default_vendor_id && !vendorIds.includes(part.default_vendor_id)) {
      vendorIds.push(part.default_vendor_id);
    }
    const vendors = vendorIds.length > 0
      ? await base44.entities.Vendor.filter({ id: { $in: vendorIds } })
      : [];
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    // Find preferred source
    const preferred = sources.find(s => s.is_preferred) || null;

    // Build response
    const sourcesWithVendor = sources.map(s => ({
      id: s.id,
      vendor_id: s.vendor_id,
      vendor_name: vendorMap.get(s.vendor_id)?.vendor_name || 'Unknown',
      vendor_part_number: s.vendor_part_number || null,
      unit_cost: s.unit_cost || 0,
      is_preferred: s.is_preferred || false,
      lead_time_days: s.lead_time_days || null,
      min_order_qty: s.min_order_qty || 1,
      order_url: s.order_url || null,
      last_ordered_at: s.last_ordered_at || null,
      notes: s.notes || null,
    }));

    // Fallback: if no sources exist, synthesize one from Part.default_vendor_id
    const fallback_vendor = part.default_vendor_id
      ? {
          id: null,
          vendor_id: part.default_vendor_id,
          vendor_name: vendorMap.get(part.default_vendor_id)?.vendor_name || 'Unknown',
          vendor_part_number: part.vendor_part_number || null,
          unit_cost: part.cost || 0,
          is_preferred: true,
          is_fallback: true,
        }
      : null;

    return Response.json({
      success: true,
      part_id,
      part_name: part.part_name,
      default_vendor_id: part.default_vendor_id,
      sources: sourcesWithVendor,
      preferred_source_id: preferred?.id || null,
      fallback_vendor,
      has_multi_source: sourcesWithVendor.length > 1,
    });
  } catch (error) {
    console.error('getVendorSourcesForPart error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});