/**
 * integrityMonitorVendorSources — Scheduled integrity check for PartVendorSource system.
 * Runs periodically via automation. Logs issues but does NOT auto-repair.
 * 
 * Checks:
 * 1. Parts with broken default_vendor_id (vendor doesn't exist)
 * 2. Parts with no PartVendorSource records but have default_vendor_id
 * 3. Parts with no preferred source
 * 4. Duplicate vendor+URL combos
 * 5. SERVICE vendor references
 * 6. Drift: default_vendor_id != preferred source
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const [allParts, allSources, allVendors] = await Promise.all([
      base44.asServiceRole.entities.Part.filter({}),
      base44.asServiceRole.entities.PartVendorSource.filter({}),
      base44.asServiceRole.entities.Vendor.filter({}),
    ]);

    const vendorMap = new Map(allVendors.map(v => [v.id, v]));

    // Build source lookup
    const partSourceMap = new Map();
    for (const s of allSources) {
      if (!partSourceMap.has(s.part_id)) partSourceMap.set(s.part_id, []);
      partSourceMap.get(s.part_id).push(s);
    }

    const report = {
      timestamp: new Date().toISOString(),
      total_parts: allParts.length,
      total_sources: allSources.length,
      total_vendors: allVendors.length,
      issues: {
        broken_vendor_refs: 0,
        parts_without_sources: 0,
        parts_without_preferred: 0,
        duplicate_sources: 0,
        service_vendor_refs: 0,
        vendor_drift: 0,
      },
      healthy: true,
    };

    for (const part of allParts) {
      const sources = partSourceMap.get(part.id) || [];

      // Broken vendor ref
      if (part.default_vendor_id && !vendorMap.has(part.default_vendor_id)) {
        report.issues.broken_vendor_refs++;
      }

      // No sources but has vendor
      if (sources.length === 0 && part.default_vendor_id) {
        report.issues.parts_without_sources++;
      }

      // No preferred
      if (sources.length > 0 && !sources.some(s => s.is_preferred)) {
        report.issues.parts_without_preferred++;
      }

      // Drift
      const preferred = sources.find(s => s.is_preferred);
      if (preferred && part.default_vendor_id && part.default_vendor_id !== preferred.vendor_id) {
        report.issues.vendor_drift++;
      }
    }

    // Check sources for duplicates and SERVICE refs
    const seenSourceKeys = new Map(); // part_id -> Set of vendor_id|url
    for (const s of allSources) {
      // SERVICE vendor check
      const vendor = vendorMap.get(s.vendor_id);
      if (vendor && vendor.vendor_type === 'SERVICE') {
        report.issues.service_vendor_refs++;
      }

      // Duplicate check
      if (!seenSourceKeys.has(s.part_id)) seenSourceKeys.set(s.part_id, new Set());
      const key = `${s.vendor_id}|${s.order_url || ''}`;
      if (seenSourceKeys.get(s.part_id).has(key)) {
        report.issues.duplicate_sources++;
      }
      seenSourceKeys.get(s.part_id).add(key);
    }

    const totalIssues = Object.values(report.issues).reduce((sum, v) => sum + v, 0);
    report.healthy = totalIssues === 0;

    if (totalIssues > 0) {
      console.warn(`[VendorSourceIntegrity] ${totalIssues} issues found:`, JSON.stringify(report.issues));
    } else {
      console.log('[VendorSourceIntegrity] All checks passed ✓');
    }

    return Response.json({ success: true, report });
  } catch (error) {
    console.error('integrityMonitorVendorSources error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});