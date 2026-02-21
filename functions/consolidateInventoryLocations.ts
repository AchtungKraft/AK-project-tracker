import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * consolidateInventoryLocations - Phase 13B cleanup function
 * 
 * Finds and merges duplicate InventoryItem records where:
 * - Same part_id + location_id appears more than once
 * 
 * Logic:
 * 1. Group InventoryItem by (part_id, location_id)
 * 2. For groups with count > 1:
 *    - Sum quantity_on_hand
 *    - Keep oldest record (by created_date)
 *    - Update it with summed qty
 *    - Delete duplicates
 *    - Log to InventoryAuditLog
 * 
 * Safety:
 * - dry_run: true/false (default true)
 * - Does NOT modify commitments, reservations, or covered_from_po
 * - Only consolidates InventoryItem records
 * 
 * Returns: summary report
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
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin check
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { dry_run = true } = body;
    const timestamp = new Date().toISOString();

    // Fetch all inventory items
    const allItems = await base44.entities.InventoryItem.list();

    // Group by (part_id, location_id)
    const groups = {};
    
    allItems.forEach(item => {
      const key = `${item.part_id}__${item.location_id || 'null'}`;
      if (!groups[key]) {
        groups[key] = {
          part_id: item.part_id,
          location_id: item.location_id || null,
          items: []
        };
      }
      groups[key].items.push(item);
    });

    // Filter to only groups with duplicates
    const duplicateGroups = Object.values(groups).filter(g => g.items.length > 1);

    if (duplicateGroups.length === 0) {
      return Response.json({
        success: true,
        dry_run,
        timestamp,
        message: "No duplicate inventory locations found",
        summary: {
          parts_affected: 0,
          duplicate_groups_found: 0,
          records_deleted: 0,
          quantities_merged: 0
        }
      });
    }

    // DRY RUN - preview only
    if (dry_run) {
      const preview = duplicateGroups.map(g => {
        const totalQty = g.items.reduce((sum, item) => sum + (item.quantity_on_hand ?? 0), 0);
        const oldest = g.items.sort((a, b) => 
          new Date(a.created_date) - new Date(b.created_date)
        )[0];
        
        return {
          part_id: g.part_id,
          location_id: g.location_id,
          duplicate_count: g.items.length,
          total_quantity: totalQty,
          keep_record_id: oldest.id,
          delete_record_ids: g.items.filter(i => i.id !== oldest.id).map(i => i.id)
        };
      });

      return Response.json({
        success: true,
        dry_run: true,
        timestamp,
        message: `DRY RUN - ${duplicateGroups.length} duplicate groups found`,
        summary: {
          parts_affected: new Set(duplicateGroups.map(g => g.part_id)).size,
          duplicate_groups_found: duplicateGroups.length,
          records_to_delete: duplicateGroups.reduce((sum, g) => sum + (g.items.length - 1), 0),
          quantities_to_merge: duplicateGroups.reduce((sum, g) => 
            sum + g.items.reduce((s, i) => s + (i.quantity_on_hand ?? 0), 0), 0
          )
        },
        preview: preview.slice(0, 50)
      });
    }

    // EXECUTE CONSOLIDATION
    const results = {
      parts_affected: new Set(),
      groups_consolidated: 0,
      records_deleted: 0,
      quantities_merged: 0,
      errors: []
    };

    for (const group of duplicateGroups) {
      try {
        // Sort by created_date ASC (oldest first)
        const sorted = group.items.sort((a, b) => 
          new Date(a.created_date) - new Date(b.created_date)
        );
        
        const keeper = sorted[0];
        const duplicates = sorted.slice(1);
        
        // Sum total quantity
        const totalQty = group.items.reduce((sum, item) => sum + (item.quantity_on_hand ?? 0), 0);
        
        // Update keeper with summed quantity
        await base44.asServiceRole.entities.InventoryItem.update(keeper.id, {
          quantity_on_hand: totalQty,
          notes: `${keeper.notes || ''}\n[CONSOLIDATED ${timestamp}] Merged ${duplicates.length} duplicate records`.trim()
        });
        
        // Delete duplicates
        for (const dup of duplicates) {
          await base44.asServiceRole.entities.InventoryItem.delete(dup.id);
          results.records_deleted++;
        }
        
        // Log to audit
        await base44.asServiceRole.entities.InventoryAuditLog.create({
          part_id: group.part_id,
          action_type: 'CONSOLIDATE_LOCATION',
          qty_delta: 0, // Net zero - just reorganizing
          old_qty: totalQty,
          new_qty: totalQty,
          location_id: group.location_id,
          notes: `Consolidated ${duplicates.length} duplicate records. Deleted IDs: ${duplicates.map(d => d.id).join(', ')}`,
          performed_by: user.email,
          performed_at: timestamp
        });
        
        results.parts_affected.add(group.part_id);
        results.groups_consolidated++;
        results.quantities_merged += totalQty;
        
      } catch (err) {
        results.errors.push({ 
          part_id: group.part_id, 
          location_id: group.location_id,
          error: err.message 
        });
      }
    }

    return Response.json({
      success: results.errors.length === 0,
      dry_run: false,
      timestamp,
      executed_by: user.email,
      
      summary: {
        parts_affected: results.parts_affected.size,
        duplicate_groups_found: duplicateGroups.length,
        groups_consolidated: results.groups_consolidated,
        records_deleted: results.records_deleted,
        quantities_merged: results.quantities_merged,
        errors: results.errors.length
      },
      
      errors: results.errors,
      
      message: results.errors.length === 0 
        ? `✅ Consolidated ${results.groups_consolidated} duplicate location groups, deleted ${results.records_deleted} records`
        : `⚠️ Consolidation completed with ${results.errors.length} errors`
    });

  } catch (error) {
    console.error("consolidateInventoryLocations error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});