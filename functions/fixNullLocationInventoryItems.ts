import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * fixNullLocationInventoryItems - PHASE 14 CLEANUP
 * 
 * Assigns UNASSIGNED_SYSTEM location to any InventoryItem with null location_id.
 * This enforces the canonical rule that all inventory must have a location.
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

    // Find or create UNASSIGNED_SYSTEM location
    let systemLocationId;
    const systemLocations = await base44.asServiceRole.entities.Location.filter({
      location_area: 'UNASSIGNED_SYSTEM'
    });
    
    if (systemLocations.length === 0) {
      if (dry_run) {
        systemLocationId = 'WOULD_CREATE_NEW';
      } else {
        const newLoc = await base44.asServiceRole.entities.Location.create({
          location_area: 'UNASSIGNED_SYSTEM',
          description: 'System default location for inventory without explicit assignment',
          active: true
        });
        systemLocationId = newLoc.id;
      }
    } else {
      systemLocationId = systemLocations[0].id;
    }

    // Find all InventoryItems with null location_id
    const allItems = await base44.asServiceRole.entities.InventoryItem.list();
    const nullLocationItems = allItems.filter(item => !item.location_id);

    const updates = [];
    
    for (const item of nullLocationItems) {
      updates.push({
        inventory_item_id: item.id,
        part_id: item.part_id,
        quantity_on_hand: item.quantity_on_hand,
        old_location_id: null,
        new_location_id: systemLocationId
      });
      
      if (!dry_run) {
        await base44.asServiceRole.entities.InventoryItem.update(item.id, {
          location_id: systemLocationId
        });
      }
    }

    return Response.json({
      success: true,
      dry_run,
      timestamp: new Date().toISOString(),
      system_location_id: systemLocationId,
      items_found: nullLocationItems.length,
      items_fixed: dry_run ? 0 : updates.length,
      updates: updates.slice(0, 20),
      message: dry_run 
        ? `DRY RUN: Found ${nullLocationItems.length} items with null location_id. Run with dry_run=false to fix.`
        : `APPLIED: Fixed ${updates.length} items by assigning to UNASSIGNED_SYSTEM location.`
    });

  } catch (error) {
    console.error('fixNullLocationInventoryItems error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});