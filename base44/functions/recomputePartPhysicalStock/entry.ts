import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * recomputePartPhysicalStock - PHASE 14 CANONICAL
 * 
 * Recomputes Part.physical_stock from the authoritative source: InventoryItem.
 * 
 * RULE: Part.physical_stock = SUM(InventoryItem.quantity_on_hand WHERE part_id)
 * 
 * This function MUST be called after:
 * - ADD_STOCK
 * - RECEIVE
 * - INSTALL (stock deduction)
 * - consolidateInventoryLocations
 * - reconcilePhysicalStockToLocations
 * - executeInventoryReset
 * 
 * Returns the computed value and updates Part if different.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { part_id, dry_run = false } = await req.json();

    if (!part_id) {
      return Response.json({ error: 'part_id required' }, { status: 400 });
    }

    // Fetch part and its inventory items
    const [parts, inventoryItems] = await Promise.all([
      base44.asServiceRole.entities.Part.filter({ id: part_id }),
      base44.asServiceRole.entities.InventoryItem.filter({ part_id })
    ]);

    const part = parts[0];
    if (!part) {
      return Response.json({ error: 'Part not found' }, { status: 404 });
    }

    // CANONICAL: Compute physical_stock from InventoryItem sum
    const computed_physical_stock = inventoryItems.reduce((sum, item) => {
      return sum + (item.quantity_on_hand ?? 0);
    }, 0);

    const current_physical_stock = part.physical_stock ?? 0;
    const needs_update = Math.abs(computed_physical_stock - current_physical_stock) > 0.001;

    const result = {
      success: true,
      part_id,
      part_name: part.part_name,
      computed_physical_stock,
      current_physical_stock,
      delta: computed_physical_stock - current_physical_stock,
      inventory_item_count: inventoryItems.length,
      needs_update,
      updated: false,
      dry_run
    };

    // Apply update if needed and not dry run
    if (needs_update && !dry_run) {
      await base44.asServiceRole.entities.Part.update(part_id, {
        physical_stock: computed_physical_stock
      });
      result.updated = true;
    }

    return Response.json(result);

  } catch (error) {
    console.error("recomputePartPhysicalStock error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});