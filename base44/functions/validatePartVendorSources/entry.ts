/**
 * validatePartVendorSources — Integrity checks for PartVendorSource data.
 * 
 * Checks:
 * - Sources with missing vendor_id
 * - Sources pointing to SERVICE vendors
 * - Duplicate source rows per part (same vendor_id + order_url)
 * - Parts still relying only on legacy vendor fields (no sources)
 * - Parts with no preferred source
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const [allParts, allSources, allVendors] = await Promise.all([
      base44.entities.Part.filter({}),
      base44.entities.PartVendorSource.filter({}),
      base44.entities.Vendor.filter({}),
    ]);

    const vendorMap = new Map(allVendors.map(v => [v.id, v]));

    const issues = {
      missing_vendor_id: [],
      service_vendor_reference: [],
      duplicate_sources: [],
      parts_without_sources: [],
      parts_without_preferred: [],
      total_sources: allSources.length,
      total_parts: allParts.length,
    };

    // Check each source
    const partSourceMap = new Map(); // part_id -> sources[]
    for (const s of allSources) {
      if (!s.vendor_id) {
        issues.missing_vendor_id.push({ source_id: s.id, part_id: s.part_id });
        continue;
      }

      const vendor = vendorMap.get(s.vendor_id);
      if (vendor && vendor.vendor_type === 'SERVICE') {
        issues.service_vendor_reference.push({
          source_id: s.id,
          part_id: s.part_id,
          vendor_id: s.vendor_id,
          vendor_name: vendor.vendor_name,
        });
      }

      if (!partSourceMap.has(s.part_id)) partSourceMap.set(s.part_id, []);
      partSourceMap.get(s.part_id).push(s);
    }

    // Check for duplicates and missing preferred
    for (const [partId, sources] of partSourceMap) {
      // Duplicate check: same vendor_id + order_url
      const seen = new Set();
      for (const s of sources) {
        const key = `${s.vendor_id}|${s.order_url || ''}`;
        if (seen.has(key)) {
          issues.duplicate_sources.push({ part_id: partId, vendor_id: s.vendor_id, order_url: s.order_url });
        }
        seen.add(key);
      }

      // Preferred check
      const hasPreferred = sources.some(s => s.is_preferred);
      if (!hasPreferred) {
        issues.parts_without_preferred.push(partId);
      }
    }

    // Parts without any sources but have legacy vendor
    for (const part of allParts) {
      if (!partSourceMap.has(part.id) && part.default_vendor_id) {
        issues.parts_without_sources.push({
          part_id: part.id,
          part_name: part.part_name,
          default_vendor_id: part.default_vendor_id,
        });
      }
    }

    const totalIssues =
      issues.missing_vendor_id.length +
      issues.service_vendor_reference.length +
      issues.duplicate_sources.length +
      issues.parts_without_sources.length +
      issues.parts_without_preferred.length;

    return Response.json({
      success: true,
      healthy: totalIssues === 0,
      total_issues: totalIssues,
      issues,
    });
  } catch (error) {
    console.error('validatePartVendorSources error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});