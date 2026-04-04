/**
 * seedPartVendorSources.js
 * Phase 1: One-time migration — creates PartVendorSource records from existing
 * Part.default_vendor_id + Part.cost data.
 * 
 * Safe to run multiple times (idempotent — skips parts that already have a source).
 * Does NOT modify any existing entities.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true } = await req.json();

    // Fetch all active parts with a default vendor
    const parts = await base44.asServiceRole.entities.Part.filter({
      default_vendor_id: { $exists: true, $ne: null },
      is_archived: { $ne: true },
    }, '-created_date', 2000);

    // Fetch existing sources to avoid duplicates
    const existingSources = await base44.asServiceRole.entities.PartVendorSource.list('-created_date', 5000);
    const existingKeys = new Set(existingSources.map(s => `${s.part_id}__${s.vendor_id}`));

    const toCreate = [];
    const skipped = [];

    for (const part of parts) {
      const key = `${part.id}__${part.default_vendor_id}`;
      if (existingKeys.has(key)) {
        skipped.push({ part_id: part.id, part_name: part.part_name, reason: 'already_exists' });
        continue;
      }

      toCreate.push({
        part_id: part.id,
        vendor_id: part.default_vendor_id,
        vendor_part_number: part.vendor_part_number || null,
        unit_cost: part.cost || 0,
        is_preferred: true,
        is_active: true,
        min_order_qty: 1,
        order_url: part.order_url || null,
        last_cost_update_at: part.last_cost_update_at || null,
        notes: 'Auto-seeded from Part.default_vendor_id',
      });
    }

    if (dry_run) {
      return Response.json({
        ok: true,
        dry_run: true,
        parts_scanned: parts.length,
        sources_to_create: toCreate.length,
        sources_skipped: skipped.length,
        preview: toCreate.slice(0, 20).map(s => ({
          part_id: s.part_id,
          vendor_id: s.vendor_id,
          unit_cost: s.unit_cost,
        })),
        skipped_sample: skipped.slice(0, 10),
      });
    }

    // Bulk create in batches of 50
    let created = 0;
    const batchSize = 50;
    for (let i = 0; i < toCreate.length; i += batchSize) {
      const batch = toCreate.slice(i, i + batchSize);
      await base44.asServiceRole.entities.PartVendorSource.bulkCreate(batch);
      created += batch.length;
    }

    return Response.json({
      ok: true,
      dry_run: false,
      parts_scanned: parts.length,
      sources_created: created,
      sources_skipped: skipped.length,
    });
  } catch (error) {
    console.error('seedPartVendorSources error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});