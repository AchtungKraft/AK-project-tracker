/**
 * resolveOrphanedVendorSources — Finds parts with broken default_vendor_id
 * (pointing to non-existent vendors) and resolves them.
 *
 * Resolution strategy:
 * 1. If part has PartVendorSource records → derive default_vendor_id from preferred source
 * 2. If part has no sources and broken vendor ref → clear default_vendor_id
 *
 * Also detects drift: default_vendor_id != preferred PartVendorSource.vendor_id
 * and auto-syncs when repair=true.
 *
 * Params: { dry_run: boolean, repair_drift: boolean }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dry_run = true, repair_drift = false } = await req.json().catch(() => ({}));

    const [allParts, allSources, allVendors] = await Promise.all([
      base44.asServiceRole.entities.Part.filter({}),
      base44.asServiceRole.entities.PartVendorSource.filter({}),
      base44.asServiceRole.entities.Vendor.filter({}),
    ]);

    const vendorMap = new Map(allVendors.map(v => [v.id, v]));

    // Build source lookup: part_id → sources[]
    const partSourceMap = new Map();
    for (const s of allSources) {
      if (!partSourceMap.has(s.part_id)) partSourceMap.set(s.part_id, []);
      partSourceMap.get(s.part_id).push(s);
    }

    const results = {
      orphaned_vendor_refs: [],    // default_vendor_id points to non-existent vendor
      drift_detected: [],          // default_vendor_id != preferred source vendor
      repaired_from_sources: 0,
      cleared_broken_refs: 0,
      drift_synced: 0,
      total_parts_scanned: allParts.length,
    };

    for (const part of allParts) {
      const sources = partSourceMap.get(part.id) || [];
      const preferred = sources.find(s => s.is_preferred);
      const vendorExists = part.default_vendor_id ? vendorMap.has(part.default_vendor_id) : true;

      // Case 1: Broken vendor reference
      if (part.default_vendor_id && !vendorExists) {
        const entry = {
          part_id: part.id,
          part_name: part.part_name,
          broken_vendor_id: part.default_vendor_id,
          has_sources: sources.length > 0,
          resolution: null,
        };

        if (preferred) {
          // Repair from preferred source
          entry.resolution = `derive_from_preferred:${preferred.vendor_id}`;
          if (!dry_run) {
            await base44.asServiceRole.entities.Part.update(part.id, {
              default_vendor_id: preferred.vendor_id,
              cost: preferred.unit_cost || part.cost,
            });
            results.repaired_from_sources++;
          }
        } else if (sources.length > 0) {
          // Has sources but no preferred — use first source
          const first = sources[0];
          entry.resolution = `derive_from_first_source:${first.vendor_id}`;
          if (!dry_run) {
            await base44.asServiceRole.entities.Part.update(part.id, {
              default_vendor_id: first.vendor_id,
              cost: first.unit_cost || part.cost,
            });
            await base44.asServiceRole.entities.PartVendorSource.update(first.id, {
              is_preferred: true,
            });
            results.repaired_from_sources++;
          }
        } else {
          // No sources at all — clear the broken reference
          entry.resolution = 'clear_broken_ref';
          if (!dry_run) {
            await base44.asServiceRole.entities.Part.update(part.id, {
              default_vendor_id: '',
            });
            results.cleared_broken_refs++;
          }
        }

        results.orphaned_vendor_refs.push(entry);
      }

      // Case 2: Drift detection — default_vendor_id != preferred source
      if (repair_drift && preferred && part.default_vendor_id && vendorExists) {
        if (part.default_vendor_id !== preferred.vendor_id) {
          results.drift_detected.push({
            part_id: part.id,
            part_name: part.part_name,
            current_default_vendor_id: part.default_vendor_id,
            preferred_vendor_id: preferred.vendor_id,
          });

          if (!dry_run) {
            await base44.asServiceRole.entities.Part.update(part.id, {
              default_vendor_id: preferred.vendor_id,
              cost: preferred.unit_cost || part.cost,
            });
            results.drift_synced++;
          }
        }
      }
    }

    return Response.json({
      success: true,
      dry_run,
      repair_drift,
      results,
    });
  } catch (error) {
    console.error('resolveOrphanedVendorSources error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});