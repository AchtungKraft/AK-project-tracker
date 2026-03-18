import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * INVENTORY AUDIT CHAIN VALIDATION
 * 
 * Verifies that sum of qty_changed in audit logs matches current inventory balances.
 * Detects drift between audit trail and actual inventory state.
 * 
 * Returns: { valid: boolean, discrepancies: [], summary: {} }
 */

Deno.serve(async (req) => {
  // Handle empty body for test/health checks
  let payload = {};
  try {
    const text = await req.text();
    if (text) {
      payload = JSON.parse(text);
    }
  } catch (e) {
    // Empty body is OK
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can run audit validation
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { part_id, location_id, full_scan = false } = payload;

    const discrepancies = [];
    const summary = {
      parts_checked: 0,
      locations_checked: 0,
      discrepancies_found: 0,
      total_drift: 0,
    };

    // Fetch all inventory items
    let inventoryFilter = {};
    if (part_id) inventoryFilter.part_id = part_id;
    if (location_id) inventoryFilter.location_id = location_id;
    
    const inventoryItems = await base44.asServiceRole.entities.InventoryItem.filter(inventoryFilter);
    
    // Group by part_id + location_id for comparison
    const inventoryByKey = {};
    for (const item of inventoryItems) {
      const key = `${item.part_id}:${item.location_id || 'no-location'}`;
      if (!inventoryByKey[key]) {
        inventoryByKey[key] = {
          part_id: item.part_id,
          location_id: item.location_id,
          current_qty: 0,
          items: [],
        };
      }
      inventoryByKey[key].current_qty += (item.quantity_on_hand || 0);
      inventoryByKey[key].items.push(item.id);
    }

    // Fetch audit logs
    let auditFilter = {};
    if (part_id) auditFilter.part_id = part_id;
    
    const auditLogs = await base44.asServiceRole.entities.InventoryAuditLog.list();
    const filteredLogs = part_id 
      ? auditLogs.filter(l => l.part_id === part_id)
      : auditLogs;

    // Calculate expected quantities from audit trail
    const auditByKey = {};
    for (const log of filteredLogs) {
      // For receives, use to_location_id
      // For moves, subtract from from_location and add to to_location
      // For installs, subtract from location_id
      
      if (log.action_type === 'receive') {
        const key = `${log.part_id}:${log.to_location_id || 'no-location'}`;
        if (!auditByKey[key]) auditByKey[key] = { part_id: log.part_id, location_id: log.to_location_id, expected_qty: 0 };
        auditByKey[key].expected_qty += (log.qty_changed || 0);
      }
      else if (log.action_type === 'move') {
        // Subtract from source
        const fromKey = `${log.part_id}:${log.from_location_id || 'no-location'}`;
        if (!auditByKey[fromKey]) auditByKey[fromKey] = { part_id: log.part_id, location_id: log.from_location_id, expected_qty: 0 };
        auditByKey[fromKey].expected_qty -= (log.qty_changed || 0);
        
        // Add to destination
        const toKey = `${log.part_id}:${log.to_location_id || 'no-location'}`;
        if (!auditByKey[toKey]) auditByKey[toKey] = { part_id: log.part_id, location_id: log.to_location_id, expected_qty: 0 };
        auditByKey[toKey].expected_qty += (log.qty_changed || 0);
      }
      else if (log.action_type === 'install') {
        const key = `${log.part_id}:${log.location_id || 'no-location'}`;
        if (!auditByKey[key]) auditByKey[key] = { part_id: log.part_id, location_id: log.location_id, expected_qty: 0 };
        auditByKey[key].expected_qty -= (log.qty_changed || 0);
      }
    }

    // Compare expected vs actual
    const allKeys = new Set([...Object.keys(inventoryByKey), ...Object.keys(auditByKey)]);
    summary.parts_checked = new Set([...Object.values(inventoryByKey), ...Object.values(auditByKey)].map(v => v.part_id)).size;
    summary.locations_checked = allKeys.size;

    for (const key of allKeys) {
      const actual = inventoryByKey[key]?.current_qty || 0;
      const expected = auditByKey[key]?.expected_qty || 0;
      
      if (actual !== expected) {
        const drift = actual - expected;
        discrepancies.push({
          key,
          part_id: inventoryByKey[key]?.part_id || auditByKey[key]?.part_id,
          location_id: inventoryByKey[key]?.location_id || auditByKey[key]?.location_id,
          actual_qty: actual,
          expected_qty: expected,
          drift,
          severity: Math.abs(drift) > 5 ? 'high' : 'medium',
        });
        summary.discrepancies_found++;
        summary.total_drift += Math.abs(drift);
      }
    }

    return Response.json({
      valid: discrepancies.length === 0,
      discrepancies,
      summary,
      checked_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('validateInventoryAuditChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});