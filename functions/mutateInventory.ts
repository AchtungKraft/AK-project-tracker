import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CENTRALIZED INVENTORY MUTATION SERVICE
 * 
 * This is the ONLY allowed mechanism to change inventory quantities.
 * All receive, move, install operations must go through this function.
 * 
 * Supported mutation_type:
 *   - receive: Add inventory from PO receiving or manual entry
 *   - move: Transfer inventory between locations
 *   - install: Consume inventory for a task/project
 *   - adjustment: Manual quantity correction (future)
 *   - reversal: Undo a previous mutation (future)
 */

const PART_TYPE_DEFAULTS = {
  PURCHASED_VENDOR: { requires_vendor_purchase: true, affects_inventory: true },
  AK_MANUFACTURED: { requires_vendor_purchase: false, affects_inventory: true },
  CLIENT_SUPPLIED: { requires_vendor_purchase: false, affects_inventory: false },
  TAKE_OFF: { requires_vendor_purchase: false, affects_inventory: true },
  STOCK_AK: { requires_vendor_purchase: true, affects_inventory: true },
  WARRANTY_REPLACEMENT: { requires_vendor_purchase: false, affects_inventory: true },
};

function getPartTypeBehavior(partType) {
  return PART_TYPE_DEFAULTS[partType] || PART_TYPE_DEFAULTS.PURCHASED_VENDOR;
}

function calculateCommitmentState(commitment) {
  const { qty_committed = 0, qty_ordered = 0, qty_received = 0, qty_allocated = 0, qty_installed = 0, qty_cancelled = 0 } = commitment;
  if (qty_cancelled >= qty_committed) return 'cancelled';
  if (qty_installed >= qty_committed) return 'installed';
  if (qty_allocated >= qty_committed) return 'allocated';
  if (qty_received >= qty_committed) return 'received';
  if (qty_received > 0) return 'partially_received';
  if (qty_ordered > 0) return 'ordered';
  return 'planned';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      mutation_type,
      part_id,
      qty,
      from_location_id,
      to_location_id,
      task_part_link_id,
      project_id,
      commitment_id,
      inventory_item_id,
      order_id,
      line_item_id,
      reason,
      notes,
      unit_cost,
      lot_number,
      source_type,
      requires_inspection,
    } = payload;

    // Validate required fields
    if (!mutation_type) {
      return Response.json({ error: 'mutation_type is required' }, { status: 400 });
    }
    if (!part_id) {
      return Response.json({ error: 'part_id is required' }, { status: 400 });
    }
    if (qty === undefined || qty === null || qty <= 0) {
      return Response.json({ error: 'qty must be a positive number' }, { status: 400 });
    }

    // Fetch part and validate
    const parts = await base44.asServiceRole.entities.Part.filter({ id: part_id });
    const part = parts[0];
    if (!part) {
      return Response.json({ error: 'Part not found' }, { status: 404 });
    }

    // Check if part is archived
    if (part.is_archived && ['receive', 'move'].includes(mutation_type)) {
      return Response.json({ 
        error: 'Cannot perform this operation on an archived part',
        code: 'PART_ARCHIVED'
      }, { status: 400 });
    }

    const partBehavior = getPartTypeBehavior(part.part_type);
    const now = new Date().toISOString();
    const result = {
      mutation_type,
      part_id,
      qty,
      audit_log_id: null,
      mutation_record_id: null,
      updated_inventory_balance: null,
    };

    // ====================
    // RECEIVE MUTATION
    // ====================
    if (mutation_type === 'receive') {
      // Validate location for receive
      if (!to_location_id) {
        return Response.json({ 
          error: 'to_location_id is required for receiving',
          code: 'LOCATION_REQUIRED'
        }, { status: 400 });
      }

      // Check if CLIENT_SUPPLIED can receive from vendor
      if (part.part_type === 'CLIENT_SUPPLIED' && source_type === 'vendor_order') {
        return Response.json({ 
          error: 'Client-supplied parts cannot be received from vendor orders',
          code: 'INVALID_PART_TYPE_FOR_RECEIVE'
        }, { status: 400 });
      }

      // Create inventory item
      const inventoryItem = await base44.asServiceRole.entities.InventoryItem.create({
        part_id,
        location_id: to_location_id,
        quantity_on_hand: qty,
        quantity_reserved: 0,
        purchase_cost: unit_cost || part.default_cost || 0,
        purchase_order_id: order_id || null,
        received_date: now.split('T')[0],
        lot_number: lot_number || null,
        notes: notes || null,
        source_type: source_type || 'manual_entry',
        requires_inspection: requires_inspection || false,
      });

      result.mutation_record_id = inventoryItem.id;
      result.updated_inventory_balance = qty;

      // Update line item qty_received if provided
      if (line_item_id) {
        const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ id: line_item_id });
        const lineItem = lineItems[0];
        if (lineItem) {
          const newReceived = (lineItem.qty_received || 0) + qty;
          const newStatus = newReceived >= (lineItem.qty_ordered || 0) ? 'Received' : 'Partial';
          await base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id, {
            qty_received: newReceived,
            status: newStatus,
          });
        }
      }

      // Create audit log
      const auditLog = await base44.asServiceRole.entities.InventoryAuditLog.create({
        part_id,
        project_id: project_id || null,
        inventory_item_id: inventoryItem.id,
        action_type: 'receive',
        qty_before: 0,
        qty_after: qty,
        qty_changed: qty,
        to_location_id,
        notes: notes || `Received ${qty} units`,
        performed_by: user.id,
        performed_at: now,
        related_entity_type: order_id ? 'Order' : null,
        related_entity_id: order_id || null,
      });

      result.audit_log_id = auditLog.id;
    }

    // ====================
    // MOVE MUTATION
    // ====================
    else if (mutation_type === 'move') {
      if (!from_location_id) {
        return Response.json({ error: 'from_location_id is required for move', code: 'LOCATION_REQUIRED' }, { status: 400 });
      }
      if (!to_location_id) {
        return Response.json({ error: 'to_location_id is required for move', code: 'LOCATION_REQUIRED' }, { status: 400 });
      }
      if (from_location_id === to_location_id) {
        return Response.json({ error: 'Cannot move to the same location', code: 'SAME_LOCATION' }, { status: 400 });
      }

      // Find source inventory item
      const sourceItems = await base44.asServiceRole.entities.InventoryItem.filter({ 
        part_id, 
        location_id: from_location_id 
      });
      
      let sourceItem = sourceItems[0];
      if (!sourceItem) {
        // If specific item provided, try to find it
        if (inventory_item_id) {
          const specificItems = await base44.asServiceRole.entities.InventoryItem.filter({ id: inventory_item_id });
          sourceItem = specificItems[0];
        }
      }

      if (!sourceItem) {
        return Response.json({ error: 'No inventory found at source location', code: 'NO_INVENTORY' }, { status: 400 });
      }

      const availableQty = (sourceItem.quantity_on_hand || 0) - (sourceItem.quantity_reserved || 0);
      if (qty > availableQty) {
        return Response.json({ 
          error: `Insufficient quantity. Available: ${availableQty}, Requested: ${qty}`,
          code: 'INSUFFICIENT_QUANTITY'
        }, { status: 400 });
      }

      // Deduct from source
      const newSourceQty = (sourceItem.quantity_on_hand || 0) - qty;
      await base44.asServiceRole.entities.InventoryItem.update(sourceItem.id, {
        quantity_on_hand: newSourceQty,
      });

      // Find or create destination item
      const destItems = await base44.asServiceRole.entities.InventoryItem.filter({ 
        part_id, 
        location_id: to_location_id 
      });
      
      let destItem = destItems[0];
      if (destItem) {
        // Add to existing
        const newDestQty = (destItem.quantity_on_hand || 0) + qty;
        await base44.asServiceRole.entities.InventoryItem.update(destItem.id, {
          quantity_on_hand: newDestQty,
        });
        result.updated_inventory_balance = newDestQty;
      } else {
        // Create new item at destination
        destItem = await base44.asServiceRole.entities.InventoryItem.create({
          part_id,
          location_id: to_location_id,
          quantity_on_hand: qty,
          quantity_reserved: 0,
          purchase_cost: sourceItem.purchase_cost || part.default_cost || 0,
          received_date: sourceItem.received_date,
          notes: `Transferred from location`,
          source_type: 'internal_transfer',
        });
        result.updated_inventory_balance = qty;
      }

      // Create transfer record
      const transfer = await base44.asServiceRole.entities.InventoryTransfer.create({
        part_id,
        inventory_item_id: sourceItem.id,
        from_location_id,
        to_location_id,
        qty_moved: qty,
        transfer_reason: reason || 'other',
        notes: notes || null,
        transfer_status: 'completed',
      });

      result.mutation_record_id = transfer.id;

      // Create audit log
      const auditLog = await base44.asServiceRole.entities.InventoryAuditLog.create({
        part_id,
        inventory_item_id: sourceItem.id,
        action_type: 'move',
        qty_before: sourceItem.quantity_on_hand,
        qty_after: newSourceQty,
        qty_changed: qty,
        from_location_id,
        to_location_id,
        notes: notes || `Moved ${qty} units`,
        performed_by: user.id,
        performed_at: now,
      });

      result.audit_log_id = auditLog.id;
    }

    // ====================
    // INSTALL MUTATION
    // ====================
    else if (mutation_type === 'install') {
      if (!project_id) {
        return Response.json({ error: 'project_id is required for install', code: 'PROJECT_REQUIRED' }, { status: 400 });
      }

      // Get task info if task_part_link provided
      let taskPartLink = null;
      let task = null;
      
      if (task_part_link_id) {
        const links = await base44.asServiceRole.entities.TaskPartLink.filter({ id: task_part_link_id });
        taskPartLink = links[0];
        if (taskPartLink) {
          const tasks = await base44.asServiceRole.entities.Task.filter({ id: taskPartLink.task_id });
          task = tasks[0];
        }
      }

      // Validate inventory availability if affects_inventory
      let inventoryItem = null;
      let unitCostAtInstall = unit_cost || part.default_cost || 0;

      if (partBehavior.affects_inventory) {
        // Find inventory to deduct from
        if (from_location_id) {
          const items = await base44.asServiceRole.entities.InventoryItem.filter({ 
            part_id, 
            location_id: from_location_id 
          });
          inventoryItem = items[0];
        } else if (inventory_item_id) {
          const items = await base44.asServiceRole.entities.InventoryItem.filter({ id: inventory_item_id });
          inventoryItem = items[0];
        } else {
          // Find any inventory with sufficient qty
          const allItems = await base44.asServiceRole.entities.InventoryItem.filter({ part_id });
          inventoryItem = allItems.find(i => (i.quantity_on_hand || 0) - (i.quantity_reserved || 0) >= qty);
        }

        if (!inventoryItem) {
          return Response.json({ 
            error: 'No inventory available for installation',
            code: 'NO_INVENTORY'
          }, { status: 400 });
        }

        const availableQty = (inventoryItem.quantity_on_hand || 0) - (inventoryItem.quantity_reserved || 0);
        if (qty > availableQty) {
          return Response.json({ 
            error: `Insufficient inventory. Available: ${availableQty}, Requested: ${qty}`,
            code: 'INSUFFICIENT_QUANTITY'
          }, { status: 400 });
        }

        // Use inventory item cost if available
        unitCostAtInstall = inventoryItem.purchase_cost || unitCostAtInstall;

        // Deduct from inventory
        const newQty = (inventoryItem.quantity_on_hand || 0) - qty;
        await base44.asServiceRole.entities.InventoryItem.update(inventoryItem.id, {
          quantity_on_hand: newQty,
        });
        result.updated_inventory_balance = newQty;
      }

      // Create InstalledPart record
      const installedPart = await base44.asServiceRole.entities.InstalledPart.create({
        part_id,
        project_id,
        task_id: taskPartLink?.task_id || null,
        task_part_link_id: task_part_link_id || null,
        commitment_id: commitment_id || null,
        inventory_item_id: inventoryItem?.id || null,
        qty_consumed: qty,
        unit_cost_at_install: unitCostAtInstall,
        extended_cost: unitCostAtInstall * qty,
        installed_date: now,
        installed_by: user.id,
        location_id: inventoryItem?.location_id || from_location_id || null,
        notes: notes || null,
      });

      result.mutation_record_id = installedPart.id;

      // Update TaskPartLink if provided
      if (taskPartLink) {
        const newInstalledQty = (taskPartLink.qty_installed || 0) + qty;
        const newStatus = newInstalledQty >= (taskPartLink.qty_allocated || 0) ? 'complete' : 'partial';
        
        await base44.asServiceRole.entities.TaskPartLink.update(task_part_link_id, {
          qty_installed: newInstalledQty,
          install_status: newStatus,
          installed_at: now,
          installed_by: user.id,
        });
      }

      // Update commitment if provided
      if (commitment_id) {
        const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
        const commitment = commitments[0];
        if (commitment) {
          const newInstalledQty = (commitment.qty_installed || 0) + qty;
          const newCommitment = { ...commitment, qty_installed: newInstalledQty };
          const newStatus = calculateCommitmentState(newCommitment);
          
          await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
            qty_installed: newInstalledQty,
            commitment_status: newStatus,
            commitment_version: (commitment.commitment_version || 1) + 1,
          });

          // Create commitment audit log
          await base44.asServiceRole.entities.CommitmentAuditLog.create({
            commitment_id,
            action_type: 'qty_change',
            previous_values: {
              qty_installed: commitment.qty_installed,
              commitment_status: commitment.commitment_status,
            },
            new_values: {
              qty_installed: newInstalledQty,
              commitment_status: newStatus,
              delta: qty,
            },
            trigger_source: 'install',
            validation_passed: true,
          });
        }
      }

      // Create inventory audit log
      const auditLog = await base44.asServiceRole.entities.InventoryAuditLog.create({
        part_id,
        project_id,
        commitment_id: commitment_id || null,
        inventory_item_id: inventoryItem?.id || null,
        action_type: 'install',
        qty_before: inventoryItem ? (inventoryItem.quantity_on_hand || 0) : null,
        qty_after: result.updated_inventory_balance,
        qty_changed: qty,
        location_id: inventoryItem?.location_id || from_location_id || null,
        notes: notes || `Installed ${qty} units for ${task?.name || 'project'}`,
        performed_by: user.id,
        performed_at: now,
        related_entity_type: task_part_link_id ? 'TaskPartLink' : null,
        related_entity_id: task_part_link_id || null,
      });

      result.audit_log_id = auditLog.id;
    }

    // ====================
    // UNSUPPORTED MUTATION TYPE
    // ====================
    else {
      return Response.json({ 
        error: `Unsupported mutation_type: ${mutation_type}. Supported: receive, move, install`,
        code: 'INVALID_MUTATION_TYPE'
      }, { status: 400 });
    }

    return Response.json({
      success: true,
      ...result,
    });

  } catch (error) {
    console.error('Inventory mutation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});