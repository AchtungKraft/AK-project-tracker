import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * reconcilePhysicalStockToLocations - Phase 13C Step 2
 * 
 * Reconciles Part.physical_stock to match SUM(InventoryItem.quantity_on_hand).
 * This ensures the canonical inventory source (InventoryItem) drives Part totals.
 * 
 * For each Part:
 *   1. Compute sumLocations = SUM(InventoryItem.quantity_on_hand) for that part
 *   2. If Part.physical_stock != sumLocations:
 *      - Update Part.physical_stock = sumLocations
 *      - Log InventoryAuditLog with action_type: "PHYSICAL_RECONCILE"
 * 
 * Returns summary of corrections made.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true } = await req.json();

    // Fetch all data
    const [parts, inventoryItems] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.InventoryItem.list()
    ]);

    // Compute location sums per part
    const partLocationSums = new Map();
    inventoryItems.forEach(item => {
      const qty = item.quantity_on_hand ?? 0;
      partLocationSums.set(item.part_id, (partLocationSums.get(item.part_id) || 0) + qty);
    });

    const discrepancies = [];
    const corrections = [];

    // Find discrepancies
    for (const part of parts) {
      const locationSum = partLocationSums.get(part.id) || 0;
      const physicalStock = part.physical_stock ?? 0;

      if (Math.abs(locationSum - physicalStock) > 0.001) {
        discrepancies.push({
          part_id: part.id,
          part_name: part.part_name,
          old_physical_stock: physicalStock,
          location_sum: locationSum,
          diff: locationSum - physicalStock
        });
      }
    }

    // Apply corrections if not dry run
    if (!dry_run) {
      for (const d of discrepancies) {
        // Update Part.physical_stock
        await base44.asServiceRole.entities.Part.update(d.part_id, {
          physical_stock: d.location_sum
        });

        // Log audit entry
        await base44.asServiceRole.entities.InventoryAuditLog.create({
          part_id: d.part_id,
          action_type: 'PHYSICAL_RECONCILE',
          old_qty: d.old_physical_stock,
          new_qty: d.location_sum,
          delta: d.diff,
          notes: `Location reconciliation: physical_stock corrected from ${d.old_physical_stock} to ${d.location_sum} (diff: ${d.diff})`,
          performed_by: user.email,
          performed_at: new Date().toISOString()
        });

        corrections.push({
          part_id: d.part_id,
          part_name: d.part_name,
          old_value: d.old_physical_stock,
          new_value: d.location_sum
        });
      }
    }

    return Response.json({
      success: true,
      dry_run,
      timestamp: new Date().toISOString(),
      summary: {
        total_parts_scanned: parts.length,
        parts_with_inventory: partLocationSums.size,
        discrepancies_found: discrepancies.length,
        parts_corrected: dry_run ? 0 : corrections.length,
        total_adjustments: discrepancies.reduce((sum, d) => sum + Math.abs(d.diff), 0)
      },
      discrepancies: discrepancies.slice(0, 50),
      corrections: dry_run ? [] : corrections,
      message: dry_run 
        ? `DRY RUN: Found ${discrepancies.length} parts with physical_stock != location sum. Run with dry_run=false to fix.`
        : `APPLIED: Corrected ${corrections.length} parts to match location sums.`
    });

  } catch (error) {
    console.error('reconcilePhysicalStockToLocations error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});