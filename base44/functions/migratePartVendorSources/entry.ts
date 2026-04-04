/**
 * migratePartVendorSources — Migrates legacy Part vendor fields to PartVendorSource records.
 * Idempotent: skips parts that already have PartVendorSource rows.
 * 
 * Reads: Part.default_vendor_id, Part.cost, Part.order_url, Part.vendor_part_number
 * Creates: PartVendorSource rows linking parts to their vendors.
 * 
 * Params: { dry_run: true|false }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dry_run = true } = await req.json().catch(() => ({}));

    // Fetch all parts and existing sources
    // Fetch ALL vendors (not just PART) to handle parts referencing SERVICE or untyped vendors
    const [allParts, allSources, allVendors] = await Promise.all([
      base44.asServiceRole.entities.Part.filter({}),
      base44.asServiceRole.entities.PartVendorSource.filter({}),
      base44.asServiceRole.entities.Vendor.filter({}),
    ]);
    const partVendors = allVendors.filter(v => v.vendor_type === 'PART');

    // Build lookup: which parts already have sources
    const partsWithSources = new Set(allSources.map(s => s.part_id));

    // Build vendor name lookup for matching (PART vendors only for name-based creation)
    const vendorByName = new Map();
    for (const v of partVendors) {
      const normalized = (v.vendor_name || '').toLowerCase().trim();
      if (normalized) vendorByName.set(normalized, v);
    }
    // Full vendor ID lookup (all types) for resolving default_vendor_id references
    const vendorById = new Map(allVendors.map(v => [v.id, v]));

    // Find UNCATEGORIZED group for new vendors
    const uncategorizedGroups = await base44.entities.VendorGroup.filter({ vendor_type: 'PART' });
    let uncategorizedGroup = uncategorizedGroups.find(g => g.name === 'UNCATEGORIZED');

    const stats = {
      total_parts_scanned: allParts.length,
      parts_already_have_sources: 0,
      parts_with_legacy_vendor: 0,
      parts_no_vendor: 0,
      sources_created: 0,
      vendors_matched: 0,
      vendors_created: 0,
      duplicates_skipped: 0,
      sample_mappings: [],
    };

    for (const part of allParts) {
      // Skip parts that already have PartVendorSource rows
      if (partsWithSources.has(part.id)) {
        stats.parts_already_have_sources++;
        stats.duplicates_skipped++;
        continue;
      }

      // Check if part has a default_vendor_id
      if (!part.default_vendor_id) {
        stats.parts_no_vendor++;
        continue;
      }

      stats.parts_with_legacy_vendor++;

      // Find the vendor
      let vendorId = part.default_vendor_id;
      const existingVendor = vendorById.get(vendorId);

      if (!existingVendor) {
        // Vendor reference is broken — clear the reference and skip
        if (!dry_run) {
          await base44.asServiceRole.entities.Part.update(part.id, { default_vendor_id: '' });
        }
        stats.parts_no_vendor++;
        continue;
      }

      // If vendor is SERVICE type, flag but still create source (vendor exists, just wrong type)
      // The vendor should ideally be reclassified, but we create the link regardless
      if (existingVendor.vendor_type === 'SERVICE') {
        console.warn(`[migrate] Part "${part.part_name}" references SERVICE vendor "${existingVendor.vendor_name}" — creating source anyway`);
      }

      stats.vendors_matched++;

      const sourceData = {
        part_id: part.id,
        vendor_id: vendorId,
        vendor_part_number: part.vendor_part_number || '',
        unit_cost: part.cost || 0,
        order_url: part.order_url || '',
        is_preferred: true,
        is_active: true,
        sort_order: 0,
        notes: '',
      };

      if (stats.sample_mappings.length < 10) {
        stats.sample_mappings.push({
          part_id: part.id,
          part_name: part.part_name,
          vendor_id: vendorId,
          vendor_name: existingVendor.vendor_name,
          cost: sourceData.unit_cost,
          url: sourceData.order_url || null,
        });
      }

      if (!dry_run) {
        await base44.asServiceRole.entities.PartVendorSource.create(sourceData);
        stats.sources_created++;
      } else {
        stats.sources_created++; // count what would be created
      }
    }

    return Response.json({
      success: true,
      dry_run,
      stats,
    });
  } catch (error) {
    console.error('migratePartVendorSources error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});