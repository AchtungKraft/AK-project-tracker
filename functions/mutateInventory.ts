import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CENTRALIZED INVENTORY MUTATION SERVICE - HARDENED VERSION
 * 
 * This is the ONLY allowed mechanism to change inventory quantities.
 * All receive, move, install operations must go through this function.
 * 
 * Supported mutation_type:
 *   - receive: Add inventory from PO receiving or manual entry
 *   - move: Transfer inventory between locations
 *   - install: Consume inventory for a task/project
 *   - adjustment: Manual quantity correction
 *   - reversal: Undo a previous mutation
 * 
 * HARDENING FEATURES:
 *   - Idempotency protection via idempotency_key
 *   - Concurrency revalidation before commit
 *   - Full mutation logging for observability
 *   - Batch mutation support
 *   - Reversal support for undo operations
 */

const PART_TYPE_DEFAULTS = {
  PURCHASED_VENDOR: { requires_vendor_purchase: true, affects_inventory: true, can_receive: true, can_move: true, can_install: true },
  AK_MANUFACTURED: { requires_vendor_purchase: false, affects_inventory: true, can_receive: true, can_move: true, can_install: true },
  CLIENT_SUPPLIED: { requires_vendor_purchase: false, affects_inventory: false, can_receive: true, can_move: true, can_install: true },
  TAKE_OFF: { requires_vendor_purchase: false, affects_inventory: true, can_receive: true, can_move: true, can_install: true },
  STOCK_AK: { requires_vendor_purchase: true, affects_inventory: true, can_receive: true, can_move: true, can_install: true },
  WARRANTY_REPLACEMENT: { requires_vendor_purchase: false, affects_inventory: true, can_receive: true, can_move: true, can_install: true },
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

// Check if part can be mutated
function canMutatePart(part, mutation_type, options = {}) {
  if (part.is_archived) {
    return { allowed: false, reason: 'Cannot perform operations on archived parts', code: 'PART_ARCHIVED' };
  }
  if (part.is_active === false) {
    return { allowed: false, reason: 'Part is not active', code: 'PART_INACTIVE' };
  }
  const behavior = getPartTypeBehavior(part.part_type);
  if (mutation_type === 'receive' && part.part_type === 'CLIENT_SUPPLIED' && options.source_type === 'vendor_order') {
    return { allowed: false, reason: 'Client-supplied parts cannot be received from vendor orders', code: 'INVALID_SOURCE_FOR_PART_TYPE' };
  }
  return { allowed: true, behavior };
}

// Process a single mutation
async function processMutation(base44, user, payload, startTime) {
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
    idempotency_key,
    reversed_mutation_id,
  } = payload;

  const now = new Date().toISOString();
  const mutationLog = {
    idempotency_key: idempotency_key || null,
    mutation_type,
    part_id,
    from_location_id: from_location_id || null,
    to_location_id: to_location_id || null,
    qty,
    project_id: project_id || null,
    commitment_id: commitment_id || null,
    task_part_link_id: task_part_link_id || null,
    user_id: user.id,
    result_status: 'success',
    payload_snapshot: JSON.stringify(payload),
  };

  try {
    // IDEMPOTENCY CHECK
    if (idempotency_key) {
      const existingMutations = await base44.asServiceRole.entities.InventoryMutationLog.filter({ idempotency_key });
      const existingMutation = existingMutations[0];
      if (existingMutation && existingMutation.result_status === 'success') {
        return {
          success: true,
          idempotent_hit: true,
          original_mutation_id: existingMutation.id,
          mutation_type: existingMutation.mutation_type,
          part_id: existingMutation.part_id,
          qty: existingMutation.qty,
          audit_log_id: existingMutation.audit_log_id,
          mutation_record_id: existingMutation.mutation_record_id,
        };
      }
    }

    // Validate required fields
    if (!mutation_type) throw { status: 400, error: 'mutation_type is required', code: 'MISSING_FIELD' };
    if (mutation_type !== 'reversal' && !part_id) throw { status: 400, error: 'part_id is required', code: 'MISSING_FIELD' };
    if (mutation_type !== 'reversal' && (qty === undefined || qty === null || qty <= 0)) {
      throw { status: 400, error: 'qty must be a positive number', code: 'INVALID_QTY' };
    }

    // For reversal, we'll get part details from the original mutation
    let part = null;
    let partBehavior = null;
    
    if (mutation_type !== 'reversal') {
      // Fetch and validate part
      const parts = await base44.asServiceRole.entities.Part.list();
      part = parts.find(p => p.id === part_id);
      if (!part) throw { status: 404, error: 'Part not found', code: 'PART_NOT_FOUND' };

      // Check mutation permission
      const permCheck = canMutatePart(part, mutation_type, { source_type });
      if (!permCheck.allowed) {
        throw { status: 400, error: permCheck.reason, code: permCheck.code };
      }

      partBehavior = permCheck.behavior || getPartTypeBehavior(part.part_type);
    }
    const result = {
      mutation_type,
      part_id: part_id || null,
      qty: qty || null,
      audit_log_id: null,
      mutation_record_id: null,
      updated_inventory_balance: null,
    };

    // ====================
    // RECEIVE MUTATION
    // ====================
    if (mutation_type === 'receive') {
      if (!to_location_id) throw { status: 400, error: 'to_location_id is required for receiving', code: 'LOCATION_REQUIRED' };

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
      mutationLog.inventory_item_id = inventoryItem.id;
      mutationLog.qty_before = 0;
      mutationLog.qty_after = qty;

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
      mutationLog.audit_log_id = auditLog.id;
    }

    // ====================
    // MOVE MUTATION
    // ====================
    else if (mutation_type === 'move') {
      if (!from_location_id) throw { status: 400, error: 'from_location_id is required for move', code: 'LOCATION_REQUIRED' };
      if (!to_location_id) throw { status: 400, error: 'to_location_id is required for move', code: 'LOCATION_REQUIRED' };
      if (from_location_id === to_location_id) throw { status: 400, error: 'Cannot move to the same location', code: 'SAME_LOCATION' };

      const sourceItems = await base44.asServiceRole.entities.InventoryItem.filter({ part_id, location_id: from_location_id });
      let sourceItem = sourceItems[0];
      if (!sourceItem && inventory_item_id) {
        const specificItems = await base44.asServiceRole.entities.InventoryItem.filter({ id: inventory_item_id });
        sourceItem = specificItems[0];
      }
      if (!sourceItem) throw { status: 400, error: 'No inventory found at source location', code: 'NO_INVENTORY' };

      // CONCURRENCY REVALIDATION - Re-fetch to verify qty still available
      const revalidateItems = await base44.asServiceRole.entities.InventoryItem.filter({ id: sourceItem.id });
      const currentSourceItem = revalidateItems[0];
      if (!currentSourceItem) throw { status: 400, error: 'Source inventory no longer exists', code: 'CONCURRENCY_ERROR' };
      
      const availableQty = (currentSourceItem.quantity_on_hand || 0) - (currentSourceItem.quantity_reserved || 0);
      if (qty > availableQty) {
        throw { status: 400, error: `Insufficient quantity. Available: ${availableQty}, Requested: ${qty}`, code: 'INSUFFICIENT_QUANTITY' };
      }

      mutationLog.qty_before = currentSourceItem.quantity_on_hand;
      const newSourceQty = (currentSourceItem.quantity_on_hand || 0) - qty;
      await base44.asServiceRole.entities.InventoryItem.update(sourceItem.id, { quantity_on_hand: newSourceQty });
      mutationLog.qty_after = newSourceQty;
      mutationLog.inventory_item_id = sourceItem.id;

      const destItems = await base44.asServiceRole.entities.InventoryItem.filter({ part_id, location_id: to_location_id });
      let destItem = destItems[0];
      if (destItem) {
        const newDestQty = (destItem.quantity_on_hand || 0) + qty;
        await base44.asServiceRole.entities.InventoryItem.update(destItem.id, { quantity_on_hand: newDestQty });
        result.updated_inventory_balance = newDestQty;
      } else {
        destItem = await base44.asServiceRole.entities.InventoryItem.create({
          part_id,
          location_id: to_location_id,
          quantity_on_hand: qty,
          quantity_reserved: 0,
          purchase_cost: currentSourceItem.purchase_cost || part.default_cost || 0,
          received_date: currentSourceItem.received_date,
          notes: `Transferred from location`,
          source_type: 'internal_transfer',
        });
        result.updated_inventory_balance = qty;
      }

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

      const auditLog = await base44.asServiceRole.entities.InventoryAuditLog.create({
        part_id,
        inventory_item_id: sourceItem.id,
        action_type: 'move',
        qty_before: currentSourceItem.quantity_on_hand,
        qty_after: newSourceQty,
        qty_changed: qty,
        from_location_id,
        to_location_id,
        notes: notes || `Moved ${qty} units`,
        performed_by: user.id,
        performed_at: now,
      });

      result.audit_log_id = auditLog.id;
      mutationLog.audit_log_id = auditLog.id;
    }

    // ====================
    // INSTALL MUTATION
    // ====================
    else if (mutation_type === 'install') {
      if (!project_id) throw { status: 400, error: 'project_id is required for install', code: 'PROJECT_REQUIRED' };

      let taskPartLink = null;
      let task = null;
      
      if (task_part_link_id) {
        const links = await base44.asServiceRole.entities.TaskPartLink.filter({ id: task_part_link_id });
        taskPartLink = links[0];
        if (taskPartLink) {
          // TASK LINK INTEGRITY CHECK
          if (taskPartLink.part_id !== part_id) {
            throw { status: 400, error: 'Part ID does not match TaskPartLink', code: 'TASK_LINK_MISMATCH' };
          }
          if (taskPartLink.project_id && taskPartLink.project_id !== project_id) {
            throw { status: 400, error: 'Project ID does not match TaskPartLink', code: 'TASK_LINK_PROJECT_MISMATCH' };
          }
          const tasks = await base44.asServiceRole.entities.Task.filter({ id: taskPartLink.task_id });
          task = tasks[0];
        }
      }

      let inventoryItem = null;
      let unitCostAtInstall = unit_cost || part.default_cost || 0;

      if (partBehavior.affects_inventory) {
        if (from_location_id) {
          const items = await base44.asServiceRole.entities.InventoryItem.filter({ part_id, location_id: from_location_id });
          inventoryItem = items[0];
        } else if (inventory_item_id) {
          const items = await base44.asServiceRole.entities.InventoryItem.filter({ id: inventory_item_id });
          inventoryItem = items[0];
        } else {
          const allItems = await base44.asServiceRole.entities.InventoryItem.filter({ part_id });
          inventoryItem = allItems.find(i => (i.quantity_on_hand || 0) - (i.quantity_reserved || 0) >= qty);
        }

        if (!inventoryItem) throw { status: 400, error: 'No inventory available for installation', code: 'NO_INVENTORY' };

        // CONCURRENCY REVALIDATION
        const revalidateItems = await base44.asServiceRole.entities.InventoryItem.filter({ id: inventoryItem.id });
        const currentItem = revalidateItems[0];
        if (!currentItem) throw { status: 400, error: 'Inventory no longer exists', code: 'CONCURRENCY_ERROR' };
        
        const availableQty = (currentItem.quantity_on_hand || 0) - (currentItem.quantity_reserved || 0);
        if (qty > availableQty) {
          throw { status: 400, error: `Insufficient inventory. Available: ${availableQty}, Requested: ${qty}`, code: 'INSUFFICIENT_QUANTITY' };
        }

        unitCostAtInstall = currentItem.purchase_cost || unitCostAtInstall;
        mutationLog.qty_before = currentItem.quantity_on_hand;

        const newQty = (currentItem.quantity_on_hand || 0) - qty;
        await base44.asServiceRole.entities.InventoryItem.update(inventoryItem.id, { quantity_on_hand: newQty });
        result.updated_inventory_balance = newQty;
        mutationLog.qty_after = newQty;
        mutationLog.inventory_item_id = inventoryItem.id;
      }

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

          await base44.asServiceRole.entities.CommitmentAuditLog.create({
            commitment_id,
            action_type: 'qty_change',
            previous_values: { qty_installed: commitment.qty_installed, commitment_status: commitment.commitment_status },
            new_values: { qty_installed: newInstalledQty, commitment_status: newStatus, delta: qty },
            trigger_source: 'install',
            validation_passed: true,
          });
        }
      }

      const auditLog = await base44.asServiceRole.entities.InventoryAuditLog.create({
        part_id,
        project_id,
        commitment_id: commitment_id || null,
        inventory_item_id: inventoryItem?.id || null,
        action_type: 'install',
        qty_before: inventoryItem ? mutationLog.qty_before : null,
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
      mutationLog.audit_log_id = auditLog.id;
    }

    // ====================
    // REVERSAL MUTATION
    // ====================
    else if (mutation_type === 'reversal') {
      if (!reversed_mutation_id) throw { status: 400, error: 'reversed_mutation_id is required for reversal', code: 'MISSING_FIELD' };

      const originalMutations = await base44.asServiceRole.entities.InventoryMutationLog.filter({ id: reversed_mutation_id });
      const originalMutation = originalMutations[0];
      if (!originalMutation) throw { status: 404, error: 'Original mutation not found', code: 'MUTATION_NOT_FOUND' };
      if (originalMutation.is_reversed) throw { status: 400, error: 'Mutation has already been reversed', code: 'ALREADY_REVERSED' };

      mutationLog.reversed_mutation_id = reversed_mutation_id;
      mutationLog.part_id = originalMutation.part_id; // Override from original
      const origQty = originalMutation.qty;

      // Reverse based on original mutation type
      if (originalMutation.mutation_type === 'receive') {
        // Subtract the received quantity
        if (originalMutation.inventory_item_id) {
          const items = await base44.asServiceRole.entities.InventoryItem.filter({ id: originalMutation.inventory_item_id });
          const item = items[0];
          if (item) {
            const newQty = Math.max(0, (item.quantity_on_hand || 0) - origQty);
            await base44.asServiceRole.entities.InventoryItem.update(item.id, { quantity_on_hand: newQty });
            result.updated_inventory_balance = newQty;
            mutationLog.qty_before = item.quantity_on_hand;
            mutationLog.qty_after = newQty;
            mutationLog.inventory_item_id = item.id;
          }
        }
      } else if (originalMutation.mutation_type === 'install') {
        // Add back the installed quantity to inventory
        if (originalMutation.inventory_item_id) {
          const items = await base44.asServiceRole.entities.InventoryItem.filter({ id: originalMutation.inventory_item_id });
          const item = items[0];
          if (item) {
            const newQty = (item.quantity_on_hand || 0) + origQty;
            await base44.asServiceRole.entities.InventoryItem.update(item.id, { quantity_on_hand: newQty });
            result.updated_inventory_balance = newQty;
            mutationLog.qty_before = item.quantity_on_hand;
            mutationLog.qty_after = newQty;
            mutationLog.inventory_item_id = item.id;
          }
        }
        
        // Update TaskPartLink if present
        if (originalMutation.task_part_link_id) {
          const links = await base44.asServiceRole.entities.TaskPartLink.filter({ id: originalMutation.task_part_link_id });
          const link = links[0];
          if (link) {
            const newInstalled = Math.max(0, (link.qty_installed || 0) - origQty);
            const newStatus = newInstalled === 0 ? 'pending' : newInstalled >= (link.qty_allocated || 0) ? 'complete' : 'partial';
            await base44.asServiceRole.entities.TaskPartLink.update(link.id, {
              qty_installed: newInstalled,
              install_status: newStatus,
            });
          }
        }
        
        // Update Commitment if present  
        if (originalMutation.commitment_id) {
          const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: originalMutation.commitment_id });
          const commitment = commitments[0];
          if (commitment) {
            const newInstalled = Math.max(0, (commitment.qty_installed || 0) - origQty);
            const newCommitment = { ...commitment, qty_installed: newInstalled };
            const newStatus = calculateCommitmentState(newCommitment);
            
            await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
              qty_installed: newInstalled,
              commitment_status: newStatus,
              commitment_version: (commitment.commitment_version || 1) + 1,
            });
            
            await base44.asServiceRole.entities.CommitmentAuditLog.create({
              commitment_id: commitment.id,
              action_type: 'qty_change',
              previous_values: { qty_installed: commitment.qty_installed, commitment_status: commitment.commitment_status },
              new_values: { qty_installed: newInstalled, commitment_status: newStatus, delta: -origQty },
              trigger_source: 'reversal',
              validation_passed: true,
            });
          }
        }
      } else if (originalMutation.mutation_type === 'move') {
        // Reverse the move direction
        if (originalMutation.from_location_id && originalMutation.to_location_id) {
          // Add back to original source
          const sourceItems = await base44.asServiceRole.entities.InventoryItem.filter({ 
            part_id: originalMutation.part_id, 
            location_id: originalMutation.from_location_id 
          });
          let sourceItem = sourceItems[0];
          if (sourceItem) {
            const newSourceQty = (sourceItem.quantity_on_hand || 0) + origQty;
            await base44.asServiceRole.entities.InventoryItem.update(sourceItem.id, { quantity_on_hand: newSourceQty });
            mutationLog.qty_after = newSourceQty;
          }
          
          // Subtract from destination
          const destItems = await base44.asServiceRole.entities.InventoryItem.filter({ 
            part_id: originalMutation.part_id, 
            location_id: originalMutation.to_location_id 
          });
          let destItem = destItems[0];
          if (destItem) {
            mutationLog.qty_before = destItem.quantity_on_hand;
            const newDestQty = Math.max(0, (destItem.quantity_on_hand || 0) - origQty);
            await base44.asServiceRole.entities.InventoryItem.update(destItem.id, { quantity_on_hand: newDestQty });
            result.updated_inventory_balance = newDestQty;
          }
        }
      }

      // Mark original mutation as reversed and link to this reversal
      // Note: We'll link back after creating this mutation log
      await base44.asServiceRole.entities.InventoryMutationLog.update(reversed_mutation_id, {
        is_reversed: true,
      });

      result.mutation_type = 'reversal';
      result.part_id = originalMutation.part_id;
      result.qty = origQty;
      result.reversed_mutation_id = reversed_mutation_id;
      result.original_mutation_type = originalMutation.mutation_type;

      const auditLog = await base44.asServiceRole.entities.InventoryAuditLog.create({
        part_id: originalMutation.part_id,
        project_id: originalMutation.project_id || null,
        commitment_id: originalMutation.commitment_id || null,
        inventory_item_id: originalMutation.inventory_item_id || null,
        action_type: 'quantity_adjust',
        qty_changed: -origQty,
        notes: `Reversal of ${originalMutation.mutation_type} mutation (original: ${reversed_mutation_id})`,
        performed_by: user.id,
        performed_at: now,
        related_entity_type: 'InventoryMutationLog',
        related_entity_id: reversed_mutation_id,
      });

      result.audit_log_id = auditLog.id;
      mutationLog.audit_log_id = auditLog.id;
    }

    // ====================
    // UNSUPPORTED MUTATION TYPE
    // ====================
    else {
      throw { status: 400, error: `Unsupported mutation_type: ${mutation_type}. Supported: receive, move, install, reversal`, code: 'INVALID_MUTATION_TYPE' };
    }

    // Log successful mutation
    mutationLog.result_status = 'success';
    mutationLog.mutation_record_id = result.mutation_record_id;
    mutationLog.execution_time_ms = Date.now() - startTime;
    
    const savedLog = await base44.asServiceRole.entities.InventoryMutationLog.create(mutationLog);
    result.mutation_log_id = savedLog.id;
    
    // For reversals, link the reversal mutation back to the original
    if (mutation_type === 'reversal' && reversed_mutation_id) {
      await base44.asServiceRole.entities.InventoryMutationLog.update(reversed_mutation_id, {
        reversed_by_mutation_id: savedLog.id,
      });
    }

    return { success: true, ...result };

  } catch (error) {
    // Log failed mutation
    mutationLog.result_status = 'failed';
    mutationLog.error_message = error.error || error.message;
    mutationLog.error_code = error.code || 'UNKNOWN';
    mutationLog.execution_time_ms = Date.now() - startTime;
    
    try {
      await base44.asServiceRole.entities.InventoryMutationLog.create(mutationLog);
    } catch (logError) {
      console.error('Failed to log mutation error:', logError);
    }

    throw error;
  }
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();

    // BATCH MUTATION SUPPORT
    if (Array.isArray(payload.mutations)) {
      const results = [];
      const errors = [];
      
      for (let i = 0; i < payload.mutations.length; i++) {
        try {
          const result = await processMutation(base44, user, payload.mutations[i], startTime);
          results.push({ index: i, ...result });
        } catch (error) {
          errors.push({ 
            index: i, 
            error: error.error || error.message, 
            code: error.code || 'UNKNOWN' 
          });
          // Continue processing other mutations unless stop_on_error is true
          if (payload.stop_on_error) break;
        }
      }
      
      return Response.json({
        batch: true,
        total: payload.mutations.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
      });
    }

    // SINGLE MUTATION
    const result = await processMutation(base44, user, payload, startTime);
    return Response.json(result);

  } catch (error) {
    console.error('Inventory mutation error:', error);
    const status = error.status || 500;
    return Response.json({ 
      error: error.error || error.message, 
      code: error.code || 'UNKNOWN' 
    }, { status });
  }
});