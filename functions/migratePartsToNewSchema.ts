import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Migration function to add default values to existing parts
 * Sets part_type = PURCHASED_VENDOR and is_archived = false for all existing parts
 * Safe to run multiple times - only updates parts missing these fields
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all parts
    const parts = await base44.asServiceRole.entities.Part.list();
    
    const updates = [];
    const skipped = [];

    for (const part of parts) {
      // Check if part needs migration
      const needsMigration = 
        part.part_type === undefined || 
        part.part_type === null ||
        part.is_archived === undefined ||
        part.is_archived === null;

      if (needsMigration) {
        // Apply default values
        const updateData = {};
        
        if (part.part_type === undefined || part.part_type === null) {
          updateData.part_type = 'PURCHASED_VENDOR';
        }
        
        if (part.is_archived === undefined || part.is_archived === null) {
          updateData.is_archived = false;
        }

        // Apply default behavior flags if not set
        if (part.requires_vendor_purchase === undefined) {
          updateData.requires_vendor_purchase = true;
        }
        if (part.requires_vendor_payment === undefined) {
          updateData.requires_vendor_payment = true;
        }
        if (part.requires_client_billing === undefined) {
          updateData.requires_client_billing = true;
        }
        if (part.affects_inventory === undefined) {
          updateData.affects_inventory = true;
        }
        if (part.affects_margin === undefined) {
          updateData.affects_margin = true;
        }
        if (part.is_asset_recovery === undefined) {
          updateData.is_asset_recovery = false;
        }

        await base44.asServiceRole.entities.Part.update(part.id, updateData);
        updates.push({ id: part.id, name: part.part_name, updates: updateData });
      } else {
        skipped.push({ id: part.id, name: part.part_name });
      }
    }

    // Create audit log entry for the migration
    await base44.asServiceRole.entities.InventoryAuditLog.create({
      action_type: 'quantity_adjust',
      notes: `Migration completed: ${updates.length} parts updated, ${skipped.length} parts skipped`,
      performed_by: user.id,
      performed_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      summary: {
        total_parts: parts.length,
        updated: updates.length,
        skipped: skipped.length,
      },
      updated_parts: updates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});