import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Create an inventory audit log entry
 * Centralized function to ensure consistent audit logging
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const logData = await req.json();

    // Validate required fields
    if (!logData.action_type) {
      return Response.json({ error: 'action_type is required' }, { status: 400 });
    }

    // Valid action types
    const validActionTypes = [
      'receive',
      'move',
      'install',
      'archive',
      'unarchive',
      'delete',
      'billing_change',
      'cost_update',
      'quantity_adjust',
      'commitment_create',
      'commitment_update',
      'commitment_cancel',
    ];

    if (!validActionTypes.includes(logData.action_type)) {
      return Response.json({ 
        error: `Invalid action_type. Must be one of: ${validActionTypes.join(', ')}` 
      }, { status: 400 });
    }

    // Create the audit log entry
    const auditLog = await base44.asServiceRole.entities.InventoryAuditLog.create({
      part_id: logData.part_id || null,
      project_id: logData.project_id || null,
      commitment_id: logData.commitment_id || null,
      inventory_item_id: logData.inventory_item_id || null,
      action_type: logData.action_type,
      qty_before: logData.qty_before,
      qty_after: logData.qty_after,
      qty_changed: logData.qty_changed,
      location_id: logData.location_id || null,
      from_location_id: logData.from_location_id || null,
      to_location_id: logData.to_location_id || null,
      old_value: logData.old_value || null,
      new_value: logData.new_value || null,
      notes: logData.notes || null,
      performed_by: user.id,
      performed_at: new Date().toISOString(),
      related_entity_type: logData.related_entity_type || null,
      related_entity_id: logData.related_entity_id || null,
    });

    return Response.json({
      success: true,
      audit_log_id: auditLog.id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});