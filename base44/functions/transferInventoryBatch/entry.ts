import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * CANONICAL BATCH INVENTORY TRANSFER — Storage Platform V2 Phase 1
 *
 * Accepts a batch of inventory lines to move in ONE user operation.
 * Pre-validates the entire batch before executing any mutations.
 * Each line produces its own InventoryTransfer + AuditLog but shares a batch_id.
 *
 * IDEMPOTENCY: Uses InventoryMutationLog.idempotency_key per line.
 * A repeated batch_id with same lines is idempotent per-line.
 *
 * PARTIAL FAILURE: Since Base44 has no DB transactions, this uses a
 * validate-all-then-execute strategy with per-line error tracking.
 * Each successfully executed line is committed; failures don't roll back
 * prior lines but ARE reported per-line so the caller knows exact state.
 *
 * CONTAINER MOVE: transfer_type='container_move' moves a container itself.
 * Only updates StorageContainer.location_id + syncs contained items' location_id.
 * Does NOT change inventory quantities.
 */

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      transfer_type,     // 'inventory_move' | 'container_move' | 'put_away' | 'project_stage' | 'return_to_stock' | 'admin_correction'
      source_location_id,
      source_container_id,
      destination_location_id,
      destination_container_id,
      container_id,       // for container_move: the container being relocated
      project_id,
      source_receipt_id,
      batch_id,
      idempotency_key,
      notes,
      lines,              // [{inventory_item_id, part_id, qty}] — for inventory moves
    } = payload;

    const now = new Date().toISOString();
    const effectiveBatchId = batch_id || `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const effectiveTransferType = transfer_type || 'inventory_move';

    // ═══════════════════════════════════════
    // CONTAINER MOVE — separate path
    // ═══════════════════════════════════════
    if (effectiveTransferType === 'container_move') {
      if (!container_id) return Response.json({ error: 'container_id required for container_move' }, { status: 400 });
      if (!destination_location_id) return Response.json({ error: 'destination_location_id required' }, { status: 400 });

      // Idempotency check
      const containerMoveKey = idempotency_key || `ctr_move_${container_id}_${destination_location_id}_${Date.now()}`;
      const [existingMutation] = await base44.asServiceRole.entities.InventoryMutationLog.filter({ idempotency_key: containerMoveKey });
      if (existingMutation?.result_status === 'success') {
        return Response.json({ success: true, idempotent_hit: true, batch_id: effectiveBatchId });
      }

      // Validate container
      const [container] = await base44.asServiceRole.entities.StorageContainer.filter({ id: container_id });
      if (!container) return Response.json({ error: 'Container not found' }, { status: 404 });
      if (container.active === false || container.status === 'archived') {
        return Response.json({ error: 'Container is not active' }, { status: 400 });
      }

      const fromLocationId = container.location_id;
      if (fromLocationId === destination_location_id) {
        return Response.json({ error: 'Container is already at this location' }, { status: 400 });
      }

      // Validate destination
      const [destLocation] = await base44.asServiceRole.entities.Location.filter({ id: destination_location_id });
      if (!destLocation) return Response.json({ error: 'Destination location not found' }, { status: 404 });

      // Execute: update container location
      await base44.asServiceRole.entities.StorageContainer.update(container_id, {
        location_id: destination_location_id,
      });

      // Sync contained items' location_id (Phase 1 backward compatibility)
      const containedItems = await base44.asServiceRole.entities.InventoryItem.filter({ container_id });
      for (const item of containedItems) {
        if (item.location_id !== destination_location_id) {
          await base44.asServiceRole.entities.InventoryItem.update(item.id, { location_id: destination_location_id });
        }
      }

      // Record transfer
      const transfer = await base44.asServiceRole.entities.InventoryTransfer.create({
        part_id: 'CONTAINER_MOVE',
        from_location_id: fromLocationId || 'NONE',
        to_location_id: destination_location_id,
        qty_moved: containedItems.length,
        transfer_type: 'container_move',
        container_id,
        transfer_status: 'completed',
        transfer_reason: 'other',
        performed_by: user.id,
        performed_at: now,
        batch_id: effectiveBatchId,
        project_id: container.project_id || project_id || null,
        notes: notes || `Moved container ${container.short_code || container.name}`,
      });

      // Record audit
      await base44.asServiceRole.entities.InventoryAuditLog.create({
        part_id: 'CONTAINER_MOVE',
        action_type: 'move',
        from_location_id: fromLocationId,
        to_location_id: destination_location_id,
        notes: `Container ${container.short_code || container.name} moved (${containedItems.length} items inside)`,
        performed_by: user.id,
        performed_at: now,
        related_entity_type: 'StorageContainer',
        related_entity_id: container_id,
      });

      // Record mutation log
      await base44.asServiceRole.entities.InventoryMutationLog.create({
        idempotency_key: containerMoveKey,
        mutation_type: 'move',
        part_id: null,
        from_location_id: fromLocationId,
        to_location_id: destination_location_id,
        qty: containedItems.length,
        user_id: user.id,
        result_status: 'success',
        mutation_record_id: transfer.id,
        execution_time_ms: Date.now() - startTime,
        payload_snapshot: JSON.stringify({ transfer_type: 'container_move', container_id, destination_location_id }),
      });

      return Response.json({
        success: true,
        transfer_type: 'container_move',
        batch_id: effectiveBatchId,
        container_id,
        from_location_id: fromLocationId,
        to_location_id: destination_location_id,
        items_synced: containedItems.length,
        transfer_id: transfer.id,
      });
    }

    // ═══════════════════════════════════════
    // INVENTORY BATCH MOVE — main path
    // ═══════════════════════════════════════
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return Response.json({ error: 'lines[] required for inventory moves' }, { status: 400 });
    }

    // ─── PHASE 1: PRE-VALIDATION ───
    const errors = [];
    const validated = [];

    // Resolve destination
    let destLocationId = destination_location_id;
    let destContainerId = destination_container_id || null;

    if (destContainerId) {
      const [destContainer] = await base44.asServiceRole.entities.StorageContainer.filter({ id: destContainerId });
      if (!destContainer) return Response.json({ error: 'Destination container not found' }, { status: 404 });
      if (destContainer.active === false || destContainer.status === 'archived') {
        return Response.json({ error: 'Destination container is not active' }, { status: 400 });
      }
      // Container's location is the effective destination
      destLocationId = destContainer.location_id || destLocationId;
    }

    if (!destLocationId) return Response.json({ error: 'destination_location_id required (or destination container must have a location)' }, { status: 400 });

    const [destLocation] = await base44.asServiceRole.entities.Location.filter({ id: destLocationId });
    if (!destLocation) return Response.json({ error: 'Destination location not found' }, { status: 404 });

    // Validate each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineKey = `line_${i}`;

      if (!line.inventory_item_id) { errors.push({ index: i, error: 'inventory_item_id required', code: 'MISSING_FIELD' }); continue; }
      if (!line.qty || line.qty <= 0) { errors.push({ index: i, error: 'qty must be positive', code: 'INVALID_QTY' }); continue; }

      const [invItem] = await base44.asServiceRole.entities.InventoryItem.filter({ id: line.inventory_item_id });
      if (!invItem) { errors.push({ index: i, error: 'Inventory item not found', code: 'NOT_FOUND' }); continue; }

      // Validate source matches
      if (source_location_id && invItem.location_id !== source_location_id) {
        errors.push({ index: i, error: 'Item not at source location', code: 'SOURCE_MISMATCH' }); continue;
      }
      if (source_container_id && invItem.container_id !== source_container_id) {
        errors.push({ index: i, error: 'Item not in source container', code: 'CONTAINER_MISMATCH' }); continue;
      }

      const available = (invItem.quantity_on_hand || 0) - (invItem.quantity_reserved || 0);
      if (line.qty > available) {
        errors.push({ index: i, error: `Insufficient qty: available=${available}, requested=${line.qty}`, code: 'INSUFFICIENT_QTY' }); continue;
      }

      // Same location+container check
      if (invItem.location_id === destLocationId && (invItem.container_id || null) === destContainerId) {
        errors.push({ index: i, error: 'Already at destination', code: 'SAME_LOCATION' }); continue;
      }

      validated.push({ index: i, invItem, line });
    }

    // If ALL lines failed validation, return without executing
    if (validated.length === 0 && errors.length > 0) {
      return Response.json({ success: false, batch_id: effectiveBatchId, total: lines.length, executed: 0, failed: errors.length, errors });
    }

    // ─── PHASE 2: EXECUTE ───
    const results = [];
    for (const { index, invItem, line } of validated) {
      const lineIdempotencyKey = `${effectiveBatchId}_line_${index}_${invItem.id}_${line.qty}`;

      // Per-line idempotency
      const [existingLine] = await base44.asServiceRole.entities.InventoryMutationLog.filter({ idempotency_key: lineIdempotencyKey });
      if (existingLine?.result_status === 'success') {
        results.push({ index, idempotent_hit: true, mutation_log_id: existingLine.id });
        continue;
      }

      try {
        const fromLocationId = invItem.location_id;
        const fromContainerId = invItem.container_id || null;

        // Decrement source
        const newSourceQty = (invItem.quantity_on_hand || 0) - line.qty;
        await base44.asServiceRole.entities.InventoryItem.update(invItem.id, { quantity_on_hand: newSourceQty });

        // Find or create destination InventoryItem
        const destFilter = { part_id: invItem.part_id, location_id: destLocationId };
        if (destContainerId) destFilter.container_id = destContainerId;
        let [destItem] = await base44.asServiceRole.entities.InventoryItem.filter(destFilter);

        // Exact match: same part + same location + same container
        if (destItem && (destItem.container_id || null) === destContainerId) {
          const newDestQty = (destItem.quantity_on_hand || 0) + line.qty;
          await base44.asServiceRole.entities.InventoryItem.update(destItem.id, { quantity_on_hand: newDestQty });
        } else {
          destItem = await base44.asServiceRole.entities.InventoryItem.create({
            part_id: invItem.part_id,
            location_id: destLocationId,
            container_id: destContainerId,
            quantity_on_hand: line.qty,
            quantity_reserved: 0,
            purchase_cost: invItem.purchase_cost || 0,
            received_date: invItem.received_date,
            source_type: 'internal_transfer',
            notes: 'Created by batch transfer',
          });
        }

        // Record transfer
        const transfer = await base44.asServiceRole.entities.InventoryTransfer.create({
          part_id: invItem.part_id,
          inventory_item_id: invItem.id,
          from_location_id: fromLocationId || 'UNASSIGNED',
          to_location_id: destLocationId,
          qty_moved: line.qty,
          transfer_type: effectiveTransferType,
          from_container_id: fromContainerId,
          to_container_id: destContainerId,
          transfer_status: 'completed',
          transfer_reason: effectiveTransferType === 'project_stage' ? 'project_staging' : 'other',
          performed_by: user.id,
          performed_at: now,
          batch_id: effectiveBatchId,
          project_id: project_id || null,
          source_receipt_id: source_receipt_id || null,
          notes: notes || null,
        });

        // Record audit
        await base44.asServiceRole.entities.InventoryAuditLog.create({
          part_id: invItem.part_id,
          inventory_item_id: invItem.id,
          action_type: 'move',
          qty_before: invItem.quantity_on_hand,
          qty_after: newSourceQty,
          qty_changed: line.qty,
          from_location_id: fromLocationId,
          to_location_id: destLocationId,
          notes: notes || `Batch transfer ${line.qty} units`,
          performed_by: user.id,
          performed_at: now,
          related_entity_type: 'InventoryTransfer',
          related_entity_id: transfer.id,
        });

        // Record mutation log
        const mutLog = await base44.asServiceRole.entities.InventoryMutationLog.create({
          idempotency_key: lineIdempotencyKey,
          mutation_type: 'move',
          part_id: invItem.part_id,
          from_location_id: fromLocationId,
          to_location_id: destLocationId,
          qty: line.qty,
          inventory_item_id: invItem.id,
          user_id: user.id,
          result_status: 'success',
          mutation_record_id: transfer.id,
          qty_before: invItem.quantity_on_hand,
          qty_after: newSourceQty,
          execution_time_ms: Date.now() - startTime,
          payload_snapshot: JSON.stringify({ batch_id: effectiveBatchId, line_index: index }),
        });

        results.push({ index, success: true, transfer_id: transfer.id, mutation_log_id: mutLog.id });
      } catch (lineError) {
        errors.push({ index, error: lineError.message || 'Execution error', code: 'EXECUTION_ERROR' });
        // Log failed mutation
        try {
          await base44.asServiceRole.entities.InventoryMutationLog.create({
            idempotency_key: lineIdempotencyKey,
            mutation_type: 'move',
            part_id: invItem.part_id,
            user_id: user.id,
            result_status: 'failed',
            error_message: lineError.message,
            execution_time_ms: Date.now() - startTime,
          });
        } catch (e) { /* log failure is non-blocking */ }
      }
    }

    return Response.json({
      success: errors.length === 0,
      batch_id: effectiveBatchId,
      transfer_type: effectiveTransferType,
      total: lines.length,
      executed: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});