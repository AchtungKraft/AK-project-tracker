import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validateSupplyMutationGuard - Governance Enforcement Validator
 * 
 * Two modes:
 * 1. Runtime Audit: Scans recent mutations to detect bypass patterns (hours_back param)
 * 2. Pre-Mutation Guard: Validates a proposed mutation before execution (mutation param)
 * 
 * Violations detected:
 * - Direct PartCommitment.update for qty fields without required_total
 * - Legacy-only writes (qty_committed, qty_reserved, etc. without canonical fields)
 * - Direct PartPurchaseLineItem.create outside dispatcher
 * - Direct InventoryItem.create outside RECEIVE action
 */

// Legacy quantity fields that CANNOT be written directly
const LEGACY_QTY_FIELDS = [
  'qty_committed',
  'qty_reserved', 
  'qty_to_order',
  'qty_ordered',
  'qty_received',
  'qty_allocated',
  'qty_installed' // Even canonical field must go through dispatcher
];

// LEGACY INVENTORY FIELDS - BLOCKED from UI writes
const LEGACY_INVENTORY_FIELDS = [
  'quantity_on_hand',
  'quantity_reserved'
];

// Canonical fields that CAN be written by dispatcher
const CANONICAL_FIELDS = [
  'required_total',
  'reserved_from_stock',
  'covered_from_po'
];

/**
 * Pre-mutation validation - called before a write to enforce dispatcher usage
 * 
 * PHASE 1.1: HARD BLOCK LEGACY-ONLY WRITES
 * 
 * Rules:
 * 1. PartCommitment CREATE without required_total → REJECTED
 * 2. PartCommitment UPDATE touching legacy fields only → REJECTED
 * 3. Only dispatcher with _dispatcher_bypass=true can write legacy fields
 * 4. Migration function with _migration_bypass=true is allowed
 */
function validateMutation(mutation) {
  const { entity_type, operation, data, is_migration = false } = mutation;
  
  // Allow migration bypass for backfill scripts
  if (data?._migration_bypass === true || is_migration) {
    return { valid: true, note: 'Migration bypass accepted' };
  }
  
  // PHASE 4: Block legacy inventory field writes
  if (entity_type === 'InventoryItem') {
    const legacyInventoryFields = LEGACY_INVENTORY_FIELDS.filter(f => 
      data && data[f] !== undefined
    );
    
    if (legacyInventoryFields.length > 0) {
      // Skip if this is from the dispatcher
      if (data?._dispatcher_bypass === true) {
        return { valid: true, note: 'Dispatcher bypass accepted' };
      }
      
      return {
        valid: false,
        reason_code: 'LEGACY_INVENTORY_WRITE_BLOCKED',
        message: 'InventoryItem quantity fields must be written via executeSupplyAction RECEIVE action.',
        blocked_fields: legacyInventoryFields,
        suggestion: 'Use base44.functions.invoke("executeSupplyAction", { action_type: "RECEIVE", ... }) instead of direct entity writes.'
      };
    }
  }

  // Only guard PartCommitment writes
  if (entity_type !== 'PartCommitment') {
    return { valid: true };
  }

  // Skip if this is from the dispatcher (has _dispatcher_bypass flag)
  if (data?._dispatcher_bypass === true) {
    return { valid: true, note: 'Dispatcher bypass accepted' };
  }

  // PHASE 1.1: BLOCK CREATE without required_total
  if (operation === 'create') {
    const hasCanonicalRequired = data?.required_total !== undefined && data?.required_total !== null;
    
    if (!hasCanonicalRequired) {
      return {
        valid: false,
        reason_code: 'LEGACY_WRITE_BLOCKED',
        message: 'Cannot create PartCommitment without required_total. Use executeSupplyAction ADJUST_REQUIRED action.',
        blocked_operation: 'create',
        missing_field: 'required_total',
        suggestion: 'Use base44.functions.invoke("executeSupplyAction", { action_type: "ADJUST_REQUIRED", payload: { project_id, part_id, required_total_set: qty } })'
      };
    }
  }

  // Check if mutation touches any legacy quantity fields
  const legacyFieldsInMutation = LEGACY_QTY_FIELDS.filter(f => 
    data && data[f] !== undefined
  );

  if (legacyFieldsInMutation.length === 0) {
    return { valid: true };
  }

  // If touching legacy fields, must ALSO set required_total (canonical)
  const hasCanonicalRequired = data?.required_total !== undefined;

  if (!hasCanonicalRequired) {
    return {
      valid: false,
      reason_code: 'LEGACY_WRITE_BLOCKED',
      message: 'Commitment quantities must be written via executeSupplyAction (required_total is mandatory).',
      blocked_fields: legacyFieldsInMutation,
      suggestion: 'Use base44.functions.invoke("executeSupplyAction", { action, commitment_ids, payload }) instead of direct entity writes.'
    };
  }

  return { valid: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    
    // Mode 1: Pre-mutation validation
    if (body.mutation) {
      const result = validateMutation(body.mutation);
      
      if (!result.valid) {
        return Response.json({
          success: false,
          blocked: true,
          ...result
        }, { status: 400 });
      }
      
      return Response.json({
        success: true,
        valid: true,
        ...result
      });
    }

    // Mode 2: Runtime audit (requires admin)
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required for audit mode' }, { status: 403 });
    }

    const { hours_back = 24 } = body;

    const violations = [];
    const cutoff = new Date(Date.now() - hours_back * 60 * 60 * 1000).toISOString();

    // Check for lifecycle events that should exist for valid mutations
    const lifecycleEvents = await base44.entities.LifecycleEvent.filter({
      created_date: { $gte: cutoff }
    });

    const lifecycleEventMap = new Map();
    for (const event of lifecycleEvents) {
      const key = `${event.entity_type}:${event.entity_id}`;
      if (!lifecycleEventMap.has(key)) {
        lifecycleEventMap.set(key, []);
      }
      lifecycleEventMap.get(key).push(event);
    }

    // Check PartCommitment mutations
    const recentCommitments = await base44.entities.PartCommitment.filter({
      updated_date: { $gte: cutoff }
    });

    for (const commitment of recentCommitments) {
      const key = `PartCommitment:${commitment.id}`;
      const events = lifecycleEventMap.get(key) || [];
      
      // If qty fields changed but no lifecycle event, it's a violation
      const hasQtyEvent = events.some(e => 
        ['ADJUST_REQUIRED', 'AUTO_RESERVE', 'CREATE_PO', 'RECEIVE', 'INSTALL', 'REVERSE_INSTALL', 'CANCELLED'].includes(e.event_type)
      );

      // Check if commitment was modified after creation
      const createdAt = new Date(commitment.created_date);
      const updatedAt = new Date(commitment.updated_date);
      const wasModified = updatedAt.getTime() - createdAt.getTime() > 1000; // 1 second buffer

      if (wasModified && !hasQtyEvent) {
        violations.push({
          type: 'COMMITMENT_MODIFIED_WITHOUT_EVENT',
          severity: 'warning',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          updated_date: commitment.updated_date,
          message: 'Commitment was modified but no lifecycle event recorded'
        });
      }
    }

    // Check PartPurchaseLineItem creation without dispatcher
    const recentLineItems = await base44.entities.PartPurchaseLineItem.filter({
      created_date: { $gte: cutoff }
    });

    for (const lineItem of recentLineItems) {
      const key = `PartPurchaseLineItem:${lineItem.id}`;
      const events = lifecycleEventMap.get(key) || [];
      
      // Also check if related order has event
      const orderKey = `Order:${lineItem.order_id}`;
      const orderEvents = lifecycleEventMap.get(orderKey) || [];

      const hasCreateEvent = events.some(e => e.event_type === 'CREATE') ||
                             orderEvents.some(e => e.event_type === 'PO_CREATED');

      if (!hasCreateEvent) {
        violations.push({
          type: 'LINE_ITEM_CREATED_WITHOUT_EVENT',
          severity: 'warning',
          entity_type: 'PartPurchaseLineItem',
          entity_id: lineItem.id,
          order_id: lineItem.order_id,
          created_date: lineItem.created_date,
          message: 'Line item created but no PO_CREATED lifecycle event'
        });
      }
    }

    // Check InventoryReceipt creation patterns
    const recentReceipts = await base44.entities.InventoryReceipt.filter({
      created_date: { $gte: cutoff }
    });

    for (const receipt of recentReceipts) {
      // Check if corresponding Part has INVENTORY_RECEIVED event
      const partKey = `Part:${receipt.part_id}`;
      const partEvents = lifecycleEventMap.get(partKey) || [];
      
      const hasReceiveEvent = partEvents.some(e => 
        e.event_type === 'INVENTORY_RECEIVED' && 
        new Date(e.created_date).getTime() >= new Date(receipt.created_date).getTime() - 5000
      );

      if (!hasReceiveEvent) {
        violations.push({
          type: 'RECEIPT_WITHOUT_LIFECYCLE_EVENT',
          severity: 'info',
          entity_type: 'InventoryReceipt',
          entity_id: receipt.id,
          part_id: receipt.part_id,
          created_date: receipt.created_date,
          message: 'Receipt created but no INVENTORY_RECEIVED lifecycle event on Part'
        });
      }
    }

    // Check for InstalledPart without lifecycle event
    const recentInstalls = await base44.entities.InstalledPart.filter({
      created_date: { $gte: cutoff }
    });

    for (const install of recentInstalls) {
      const commitmentKey = `PartCommitment:${install.commitment_id}`;
      const commitmentEvents = lifecycleEventMap.get(commitmentKey) || [];
      
      const hasInstallEvent = commitmentEvents.some(e => 
        e.event_type === 'INSTALLED' &&
        new Date(e.created_date).getTime() >= new Date(install.created_date).getTime() - 5000
      );

      if (!hasInstallEvent) {
        violations.push({
          type: 'INSTALL_WITHOUT_LIFECYCLE_EVENT',
          severity: 'info',
          entity_type: 'InstalledPart',
          entity_id: install.id,
          commitment_id: install.commitment_id,
          created_date: install.created_date,
          message: 'InstalledPart created but no INSTALLED lifecycle event on Commitment'
        });
      }
    }

    // Summary
    const summary = {
      hours_audited: hours_back,
      total_violations: violations.length,
      by_severity: {
        critical: violations.filter(v => v.severity === 'critical').length,
        warning: violations.filter(v => v.severity === 'warning').length,
        info: violations.filter(v => v.severity === 'info').length
      },
      by_type: {}
    };

    for (const v of violations) {
      summary.by_type[v.type] = (summary.by_type[v.type] || 0) + 1;
    }

    return Response.json({
      success: true,
      audit_timestamp: new Date().toISOString(),
      summary,
      violations,
      governance_compliant: violations.filter(v => v.severity !== 'info').length === 0
    });

  } catch (error) {
    console.error("validateSupplyMutationGuard error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});