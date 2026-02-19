import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * executeSupplyAction - Unified Supply Dispatcher
 * 
 * This is the ONLY entry point for supply mutations.
 * No component may write to commitment/inventory entities directly.
 * 
 * Supported actions:
 * - ADJUST_REQUIRED: Change required_total, auto-reserve from available stock
 * - AUTO_RESERVE: Reserve from available physical stock
 * - CREATE_PO: Create purchase order for gap quantity
 * - RECEIVE: Receive inventory from PO, update physical_stock
 * - INSTALL: Consume reserved/received inventory
 * - REVERSE_INSTALL: Undo installation
 * - ALLOCATE_POOL: Allocate billing pool to commitment
 * - CANCEL_COMMITMENT: Cancel a commitment
 * 
 * All actions:
 * 1. Validate invariants before mutation
 * 2. Execute atomic updates
 * 3. Emit lifecycle events
 * 4. Return updated state
 */

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

    const { action_type, commitment_ids, payload = {}, dry_run = false } = await req.json();
    
    if (!action_type) {
      return Response.json({ error: 'action_type required' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const context = {
      base44,
      user,
      timestamp,
      dry_run,
      lifecycle_events: [],
      mutations: []
    };

    let result;
    
    switch (action_type) {
      case 'ADJUST_REQUIRED':
        result = await adjustRequired(context, commitment_ids, payload);
        break;
      case 'AUTO_RESERVE':
        result = await autoReserve(context, commitment_ids, payload);
        break;
      case 'CREATE_PO':
        result = await createPO(context, commitment_ids, payload);
        break;
      case 'RECEIVE':
        result = await receive(context, commitment_ids, payload);
        break;
      case 'ADD_STOCK':
        result = await addStock(context, payload);
        break;
      case 'INSTALL':
        result = await install(context, commitment_ids, payload);
        break;
      case 'REVERSE_INSTALL':
        result = await reverseInstall(context, commitment_ids, payload);
        break;
      case 'ALLOCATE_POOL':
        result = await allocatePool(context, commitment_ids, payload);
        break;
      case 'CANCEL_COMMITMENT':
        result = await cancelCommitment(context, commitment_ids, payload);
        break;
      default:
        return Response.json({ error: `Unknown action_type: ${action_type}` }, { status: 400 });
    }

    // Write lifecycle events if not dry run
    // Filter out events without commitment_id (LifecycleEvent requires it)
    if (!dry_run && context.lifecycle_events.length > 0) {
      for (const event of context.lifecycle_events) {
        if (event.commitment_id) {
          await base44.asServiceRole.entities.LifecycleEvent.create(event);
        }
      }
    }

    return Response.json({
      success: true,
      action_type,
      dry_run,
      ...result,
      lifecycle_events: context.lifecycle_events.length,
      mutations: context.mutations
    });

  } catch (error) {
    console.error("executeSupplyAction error:", error);
    return Response.json({ 
      error: error.message,
      action_failed: true
    }, { status: 500 });
  }
});

// ============================================================================
// ACTION IMPLEMENTATIONS
// ============================================================================

/**
 * ADJUST_REQUIRED - Canonical "Add to Project" / Qty Edit action
 * 
 * This is the SINGLE entry point for changing required quantities.
 * It handles: create-if-missing, auto-reserve, recompute to_order, return fresh view model.
 * 
 * Inputs:
 * - commitment_ids[0] OR { project_id, part_id } (creates commitment if missing)
 * - required_total_delta OR required_total_set (one must be provided)
 * - source_type: SHOP_PURCHASED (default), CLIENT_SUPPLIED, AK_CUSTOM, TAKE_OFF
 * - dry_run: preview changes without persisting
 * 
 * Returns: updated commitment + part inventory snapshot + view model row
 */
async function adjustRequired(ctx, commitment_ids, payload) {
  const { 
    required_total_delta, 
    required_total_set,
    new_required_total, // legacy param - maps to required_total_set
    source_type = 'SHOP_PURCHASED',
    project_id,
    part_id
  } = payload;

  // Support legacy param name
  const effectiveRequiredSet = required_total_set ?? new_required_total;
  
  // Validate: must have delta OR set value
  if (effectiveRequiredSet === undefined && required_total_delta === undefined) {
    throw new Error('Either required_total_delta or required_total_set must be provided');
  }

  let commitmentId = commitment_ids?.[0];
  let commitment = null;
  let part = null;
  let isNewCommitment = false;

  // If no commitment_id, try to find or create by project_id + part_id
  if (!commitmentId) {
    if (!project_id || !part_id) {
      throw new Error('Either commitment_id OR (project_id + part_id) required');
    }

    // Check if commitment already exists
    const existingCommitments = await ctx.base44.entities.PartCommitment.filter({
      project_id,
      part_id,
      commitment_status: { $nin: ['cancelled', 'closed'] }
    });

    if (existingCommitments.length > 0) {
      commitment = existingCommitments[0];
      commitmentId = commitment.id;
    } else {
      // Need to create - fetch part for pricing
      const parts = await ctx.base44.entities.Part.filter({ id: part_id });
      part = parts[0];
      if (!part) throw new Error('Part not found');

      // Determine initial required_total
      const initialRequired = effectiveRequiredSet ?? Math.max(1, required_total_delta ?? 1);
      
      if (ctx.dry_run) {
        isNewCommitment = true;
      } else {
        // Create commitment with canonical fields
        const retail_effective = part.retail_override ?? part.retail_matrix_price ?? part.default_retail ?? 0;
        
        commitment = await ctx.base44.asServiceRole.entities.PartCommitment.create({
          project_id,
          part_id,
          required_total: initialRequired,
          reserved_from_stock: 0,
          covered_from_po: 0,
          qty_installed: 0,
          supply_source_type: mapSourceType(source_type),
          // Legacy fields for compatibility
          qty_committed: initialRequired,
          qty_reserved: 0,
          qty_to_order: initialRequired,
          qty_ordered: 0,
          qty_received: 0,
          commitment_status: 'planned',
          coverage_status: 'NOT_COVERED',
          source_type: 'manual_attachment',
          billing_status: 'billable',
          unit_cost_snapshot: part.cost ?? 0,
          unit_retail_snapshot: retail_effective,
          planned_cost_total: (part.cost ?? 0) * initialRequired,
          planned_retail_total: retail_effective * initialRequired,
          commitment_version: 1,
          state_version: 1,
          last_recomputed_at: ctx.timestamp
        });

        commitmentId = commitment.id;
        isNewCommitment = true;

        ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'CREATE' });
        ctx.lifecycle_events.push({
          commitment_id: commitmentId,
          event_type: 'COMMITMENT_CREATED',
          trigger_source: 'UNIFIED_ENGINE',
          triggered_by: ctx.user.email,
          actor_email: ctx.user.email,
          part_id,
          project_id,
          metadata: JSON.stringify({
            required_total: initialRequired,
            source_type
          }),
          event_date: ctx.timestamp
        });
      }
    }
  }

  // Fetch commitment if not yet loaded
  if (!commitment && commitmentId) {
    const commitments = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
    commitment = commitments[0];
    if (!commitment) throw new Error('Commitment not found');
  }

  // Fetch part if not yet loaded
  if (!part) {
    const parts = await ctx.base44.entities.Part.filter({ id: commitment?.part_id || part_id });
    part = parts[0];
    if (!part) throw new Error('Part not found');
  }

  // Calculate new required_total
  const current_required = commitment?.required_total ?? commitment?.qty_committed ?? 0;
  let new_required;
  
  if (effectiveRequiredSet !== undefined) {
    new_required = Math.max(0, effectiveRequiredSet);
  } else {
    new_required = Math.max(0, current_required + (required_total_delta ?? 0));
  }

  // =========== AUTO-RESERVE LOGIC ===========
  // Get part inventory state
  const physical_stock = part.physical_stock ?? 0;
  
  // Get total allocated to OTHER commitments for this part
  const otherCommitments = await ctx.base44.entities.PartCommitment.filter({
    part_id: part.id,
    id: commitmentId ? { $ne: commitmentId } : undefined,
    commitment_status: { $nin: ['cancelled', 'closed'] }
  });
  
  const other_allocated = otherCommitments.reduce((sum, c) => {
    return sum + (c.reserved_from_stock ?? c.qty_reserved ?? 0);
  }, 0);
  
  const available = Math.max(0, physical_stock - other_allocated);
  
  // Calculate new reservation (auto-reserve up to available)
  const current_reserved = commitment?.reserved_from_stock ?? commitment?.qty_reserved ?? 0;
  const new_reserved = Math.min(new_required, available + current_reserved);
  
  // Calculate covered_from_po (unchanged by this action)
  const covered_from_po = commitment?.covered_from_po ?? 0;
  
  // Compute to_order (the gap)
  const to_order = Math.max(0, new_required - new_reserved - covered_from_po);

  // Compute coverage status
  const coverage_total = new_reserved + covered_from_po;
  let coverage_status = 'NOT_COVERED';
  if (coverage_total >= new_required && new_required > 0) {
    coverage_status = 'FULLY_COVERED';
  } else if (coverage_total > 0) {
    coverage_status = 'PARTIALLY_COVERED';
  }

  // =========== DRY RUN PREVIEW ===========
  if (ctx.dry_run) {
    const preview = {
      commitment_id: commitmentId ?? 'NEW',
      is_new_commitment: isNewCommitment || !commitmentId,
      project_id: commitment?.project_id || project_id,
      part_id: part.id,
      part_name: part.part_name,
      old_required: current_required,
      new_required,
      delta: new_required - current_required,
      old_reserved: current_reserved,
      new_reserved,
      covered_from_po,
      to_order,
      coverage_status,
      coverage_pct: new_required > 0 ? Math.round((coverage_total / new_required) * 100) : 100,
      source_type,
      inventory_snapshot: {
        physical_stock,
        other_allocated,
        available,
        on_order_total: 0 // Would need line item query
      }
    };
    return { preview };
  }

  // =========== PERSIST CHANGES ===========
  const retail_effective = part.retail_override ?? part.retail_matrix_price ?? part.default_retail ?? 0;
  
  const updateData = {
    required_total: new_required,
    reserved_from_stock: new_reserved,
    covered_from_po,
    supply_source_type: mapSourceType(source_type),
    // Legacy fields kept in sync during migration
    qty_committed: new_required,
    qty_reserved: new_reserved,
    qty_to_order: to_order,
    coverage_status,
    // Pricing recompute
    planned_cost_total: (commitment?.unit_cost_snapshot ?? part.cost ?? 0) * new_required,
    planned_retail_total: (commitment?.unit_retail_snapshot ?? retail_effective) * new_required,
    // State versioning
    commitment_version: (commitment?.commitment_version ?? 0) + 1,
    state_version: (commitment?.state_version ?? 0) + 1,
    last_recomputed_at: ctx.timestamp
  };

  // If not a new commitment, update it
  if (!isNewCommitment && commitmentId) {
    await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, updateData);
  }

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'ADJUST_REQUIRED' });
  
  // Only emit lifecycle event for actual changes, not initial creation
  if (!isNewCommitment && (new_required !== current_required || new_reserved !== current_reserved)) {
    const event_type = new_required > current_required ? 'QTY_INCREASED' : 'QTY_DECREASED';
    ctx.lifecycle_events.push({
      commitment_id: commitmentId,
      event_type,
      actor_email: ctx.user.email,
      trigger_source: 'UNIFIED_ENGINE',
      triggered_by: ctx.user.email,
      old_values: JSON.stringify({ required_total: current_required, reserved_from_stock: current_reserved }),
      new_values: JSON.stringify({ required_total: new_required, reserved_from_stock: new_reserved, to_order }),
      part_id: part.id,
      project_id: commitment?.project_id || project_id,
      qty_delta: new_required - current_required,
      event_date: ctx.timestamp
    });
  }

  // =========== RETURN VIEW MODEL ROW ===========
  const [project] = await ctx.base44.entities.Project.filter({ id: commitment?.project_id || project_id });
  
  return {
    success: true,
    commitment_id: commitmentId,
    is_new_commitment: isNewCommitment,
    // Canonical state
    required_total: new_required,
    reserved_from_stock: new_reserved,
    covered_from_po,
    to_order,
    coverage_status,
    coverage_pct: new_required > 0 ? Math.round(((new_reserved + covered_from_po) / new_required) * 100) : 100,
    // Context
    project_id: commitment?.project_id || project_id,
    project_name: project?.name,
    part_id: part.id,
    part_name: part.part_name,
    source_type,
    // Inventory snapshot
    inventory_snapshot: {
      physical_stock,
      allocated_total: other_allocated + new_reserved,
      available: Math.max(0, physical_stock - other_allocated - new_reserved),
      on_order_total: 0 // TODO: sum from line items
    },
    // Next action hint
    next_action: to_order > 0 ? 'CREATE_PO' : (new_reserved > (commitment?.qty_installed ?? 0) ? 'INSTALL' : 'COMPLETE')
  };
}

/**
 * Map UI source type to schema enum
 */
function mapSourceType(source_type) {
  const mapping = {
    'SHOP_PURCHASED': 'VENDOR',
    'VENDOR': 'VENDOR',
    'CLIENT_SUPPLIED': 'CLIENT_SUPPLIED',
    'AK_CUSTOM': 'AK_CUSTOM',
    'TAKE_OFF': 'TAKE_OFF',
    'STOCK': 'STOCK'
  };
  return mapping[source_type] || 'VENDOR';
}

/**
 * AUTO_RESERVE - Reserve from available physical stock
 */
async function autoReserve(ctx, commitment_ids, payload) {
  const results = [];

  for (const commitmentId of (commitment_ids || [])) {
    const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
    if (!commitment) continue;

    const [part] = await ctx.base44.entities.Part.filter({ id: commitment.part_id });
    if (!part) continue;

    const required = commitment.required_total ?? commitment.qty_committed ?? 0;
    const current_reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
    const physical_stock = part.physical_stock ?? 0;

    // Get other allocations
    const otherCommitments = await ctx.base44.entities.PartCommitment.filter({
      part_id: commitment.part_id,
      id: { $ne: commitmentId },
      commitment_status: { $nin: ['cancelled', 'closed'] }
    });
    
    const other_allocated = otherCommitments.reduce((sum, c) => {
      return sum + (c.reserved_from_stock ?? c.qty_reserved ?? 0);
    }, 0);

    const available = Math.max(0, physical_stock - other_allocated - current_reserved);
    const can_reserve = Math.min(available, required - current_reserved);
    const new_reserved = current_reserved + can_reserve;

    if (ctx.dry_run) {
      results.push({
        commitment_id: commitmentId,
        current_reserved,
        available,
        can_reserve,
        new_reserved
      });
      continue;
    }

    if (can_reserve > 0) {
      await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
        reserved_from_stock: new_reserved,
        qty_reserved: new_reserved,
        qty_to_order: Math.max(0, required - new_reserved),
        commitment_version: (commitment.commitment_version ?? 0) + 1
      });

      ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'AUTO_RESERVE' });
      ctx.lifecycle_events.push({
        entity_type: 'PartCommitment',
        entity_id: commitmentId,
        event_type: 'AUTO_RESERVE',
        actor_email: ctx.user.email,
        details: JSON.stringify({ reserved: can_reserve, new_total: new_reserved }),
        created_date: ctx.timestamp
      });
    }

    results.push({
      commitment_id: commitmentId,
      reserved: can_reserve,
      new_reserved
    });
  }

  return { results };
}

/**
 * CREATE_PO - Create purchase order for gap quantity
 */
async function createPO(ctx, commitment_ids, payload) {
  const { vendor_id, po_prefix = 'AK' } = payload;
  
  if (!commitment_ids || commitment_ids.length === 0) {
    throw new Error('commitment_ids required');
  }

  // Fetch all commitments
  const commitments = await ctx.base44.entities.PartCommitment.filter({
    id: { $in: commitment_ids }
  });

  // Group by vendor
  const vendorGroups = new Map();
  const blocked = [];

  for (const commitment of commitments) {
    const [part] = await ctx.base44.entities.Part.filter({ id: commitment.part_id });
    if (!part) {
      blocked.push({ commitment_id: commitment.id, reason_code: 'PART_NOT_FOUND' });
      continue;
    }

    const effectiveVendor = vendor_id || part.default_vendor_id;
    if (!effectiveVendor) {
      blocked.push({ 
        commitment_id: commitment.id, 
        reason_code: 'NO_VENDOR',
        part_name: part.part_name
      });
      continue;
    }

    const required = commitment.required_total ?? commitment.qty_committed ?? 0;
    const reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
    const covered_po = commitment.covered_from_po ?? 0;
    const gap = Math.max(0, required - reserved - covered_po);

    if (gap <= 0) {
      blocked.push({ 
        commitment_id: commitment.id, 
        reason_code: 'NO_GAP',
        gap: 0
      });
      continue;
    }

    if (!vendorGroups.has(effectiveVendor)) {
      vendorGroups.set(effectiveVendor, []);
    }
    
    vendorGroups.set(effectiveVendor, [...vendorGroups.get(effectiveVendor), {
      commitment,
      part,
      qty: gap,
      unit_cost: commitment.unit_cost_snapshot ?? part.cost ?? 0
    }]);
  }

  if (ctx.dry_run) {
    return {
      preview: {
        vendor_groups: Array.from(vendorGroups.entries()).map(([vendorId, items]) => ({
          vendor_id: vendorId,
          line_count: items.length,
          items: items.map(i => ({
            commitment_id: i.commitment.id,
            part_name: i.part.part_name,
            qty: i.qty,
            unit_cost: i.unit_cost
          }))
        }))
      },
      blocked
    };
  }

  // Create POs
  const created_orders = [];
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  for (const [vendorId, items] of vendorGroups) {
    // Get next sequence
    let seq = 1;
    const existingOrders = await ctx.base44.entities.Order.filter({
      po_number: { $regex: `^${po_prefix}_${dateStr}` }
    });
    if (existingOrders.length > 0) {
      const maxSeq = existingOrders.reduce((max, o) => {
        const parts = o.po_number.split('_');
        const s = parseInt(parts[2] || '0', 10);
        return Math.max(max, s);
      }, 0);
      seq = maxSeq + 1;
    }

    const po_number = `${po_prefix}_${dateStr}_${String(seq).padStart(3, '0')}`;

    // Create order
    const order = await ctx.base44.asServiceRole.entities.Order.create({
      po_number,
      po_prefix,
      vendor_id: vendorId,
      order_date: new Date().toISOString().slice(0, 10),
      status: 'Draft'
    });

    // Create line items and update commitments
    for (const item of items) {
      const lineItem = await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.create({
        order_id: order.id,
        part_id: item.part.id,
        commitment_id: item.commitment.id,
        vendor_id: vendorId,
        qty_ordered: item.qty,
        qty_received: 0,
        unit_cost: item.unit_cost,
        extended_cost: item.unit_cost * item.qty,
        status: 'Ordered'
      });

      // Update commitment
      const current_covered = item.commitment.covered_from_po ?? 0;
      const current_line_ids = item.commitment.order_line_item_ids || [];
      
      await ctx.base44.asServiceRole.entities.PartCommitment.update(item.commitment.id, {
        covered_from_po: current_covered + item.qty,
        qty_ordered: (item.commitment.qty_ordered ?? 0) + item.qty,
        qty_to_order: 0,
        order_line_item_ids: [...current_line_ids, lineItem.id],
        commitment_status: 'ordered',
        commitment_version: (item.commitment.commitment_version ?? 0) + 1
      });

      ctx.mutations.push({ entity: 'PartPurchaseLineItem', id: lineItem.id, action: 'CREATE' });
      ctx.mutations.push({ entity: 'PartCommitment', id: item.commitment.id, action: 'CREATE_PO' });
    }

    ctx.lifecycle_events.push({
      entity_type: 'Order',
      entity_id: order.id,
      event_type: 'PO_CREATED',
      actor_email: ctx.user.email,
      details: JSON.stringify({ 
        po_number, 
        vendor_id: vendorId, 
        line_count: items.length 
      }),
      created_date: ctx.timestamp
    });

    created_orders.push({
      order_id: order.id,
      po_number,
      vendor_id: vendorId,
      line_count: items.length
    });
  }

  return { created_orders, blocked };
}

/**
 * RECEIVE - Receive inventory from PO
 * 
 * Supports two modes:
 * 1. Single line: { line_item_id, qty_received, location_id }
 * 2. Batch (PO-centric): { order_id, lines: [{ line_item_id, qty_received, location_id }] }
 */
async function receive(ctx, commitment_ids, payload) {
  // Check for batch mode
  if (payload.order_id && payload.lines) {
    return receiveBatch(ctx, payload);
  }

  // Single line mode
  const { line_item_id, qty_received, location_id } = payload;
  
  if (!line_item_id || qty_received === undefined) {
    throw new Error('line_item_id and qty_received required');
  }

  return receiveSingleLine(ctx, line_item_id, qty_received, location_id);
}

/**
 * Batch receive multiple lines from a PO
 */
async function receiveBatch(ctx, payload) {
  const { order_id, lines } = payload;
  
  if (!order_id || !lines || lines.length === 0) {
    throw new Error('order_id and lines[] required for batch receiving');
  }

  // Fetch order
  const [order] = await ctx.base44.entities.Order.filter({ id: order_id });
  if (!order) throw new Error('Order not found');

  const results = [];
  let total_received = 0;

  for (const line of lines) {
    if (!line.line_item_id || !line.qty_received || line.qty_received <= 0) {
      continue;
    }

    const result = await receiveSingleLine(ctx, line.line_item_id, line.qty_received, line.location_id);
    results.push(result);
    total_received += line.qty_received;
  }

  // Update order status
  const allLineItems = await ctx.base44.entities.PartPurchaseLineItem.filter({ order_id });
  const allReceived = allLineItems.every(li => (li.qty_received ?? 0) >= (li.qty_ordered ?? 0));
  const someReceived = allLineItems.some(li => (li.qty_received ?? 0) > 0);
  
  const newStatus = allReceived ? 'Received' : (someReceived ? 'Partial' : order.status);
  
  if (newStatus !== order.status) {
    await ctx.base44.asServiceRole.entities.Order.update(order_id, {
      status: newStatus,
      received_date: allReceived ? new Date().toISOString().slice(0, 10) : null
    });
    ctx.mutations.push({ entity: 'Order', id: order_id, action: 'STATUS_UPDATE' });
  }

  ctx.lifecycle_events.push({
    entity_type: 'Order',
    entity_id: order_id,
    event_type: 'BATCH_RECEIVE',
    actor_email: ctx.user.email,
    details: JSON.stringify({ 
      lines_received: results.length,
      total_qty: total_received,
      new_status: newStatus
    }),
    created_date: ctx.timestamp
  });

  return {
    order_id,
    order_status: newStatus,
    lines_received: results.length,
    total_qty_received: total_received,
    results
  };
}

/**
 * Receive a single line item
 */
async function receiveSingleLine(ctx, line_item_id, qty_received, location_id) {
  // Fetch line item
  const [lineItem] = await ctx.base44.entities.PartPurchaseLineItem.filter({ id: line_item_id });
  if (!lineItem) throw new Error(`Line item ${line_item_id} not found`);

  const [part] = await ctx.base44.entities.Part.filter({ id: lineItem.part_id });
  if (!part) throw new Error('Part not found');

  const ordered = lineItem.qty_ordered ?? 0;
  const already_received = lineItem.qty_received ?? 0;
  const remaining = ordered - already_received;

  if (qty_received > remaining) {
    throw new Error(`Cannot receive ${qty_received} of ${part.part_name}, only ${remaining} remaining`);
  }

  if (ctx.dry_run) {
    return {
      preview: {
        line_item_id,
        part_name: part.part_name,
        qty_receiving: qty_received,
        remaining_after: remaining - qty_received,
        new_physical_stock: (part.physical_stock ?? 0) + qty_received
      }
    };
  }

  // Update line item
  const new_line_received = already_received + qty_received;
  const line_status = new_line_received >= ordered ? 'Received' : 'Partial';
  
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id, {
    qty_received: new_line_received,
    status: line_status
  });

  // Update part physical stock
  const new_physical = (part.physical_stock ?? 0) + qty_received;
  await ctx.base44.asServiceRole.entities.Part.update(part.id, {
    physical_stock: new_physical
  });

  // Update commitment if linked
  if (lineItem.commitment_id) {
    const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: lineItem.commitment_id });
    if (commitment) {
      // Receiving decreases covered_from_po (it's now physical stock)
      // and the reserved_from_stock increases (auto-reserve the received)
      const current_covered = commitment.covered_from_po ?? 0;
      const current_reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
      
      await ctx.base44.asServiceRole.entities.PartCommitment.update(lineItem.commitment_id, {
        covered_from_po: Math.max(0, current_covered - qty_received),
        reserved_from_stock: current_reserved + qty_received,
        qty_received: (commitment.qty_received ?? 0) + qty_received,
        qty_reserved: current_reserved + qty_received,
        commitment_status: 'received',
        commitment_version: (commitment.commitment_version ?? 0) + 1
      });

      ctx.mutations.push({ entity: 'PartCommitment', id: lineItem.commitment_id, action: 'RECEIVE' });
    }
  }

  // Create inventory receipt
  await ctx.base44.asServiceRole.entities.InventoryReceipt.create({
    part_id: part.id,
    order_id: lineItem.order_id,
    line_item_id,
    qty_received,
    location_id: location_id || null,
    received_by: ctx.user.email,
    received_date: ctx.timestamp
  });

  ctx.mutations.push({ entity: 'PartPurchaseLineItem', id: line_item_id, action: 'RECEIVE' });
  ctx.mutations.push({ entity: 'Part', id: part.id, action: 'RECEIVE' });
  
  ctx.lifecycle_events.push({
    entity_type: 'Part',
    entity_id: part.id,
    event_type: 'INVENTORY_RECEIVED',
    actor_email: ctx.user.email,
    details: JSON.stringify({ qty: qty_received, from_po: lineItem.order_id, location_id }),
    created_date: ctx.timestamp
  });

  return {
    line_item_id,
    part_id: part.id,
    part_name: part.part_name,
    qty_received,
    new_physical_stock: new_physical,
    line_status
  };
}

/**
 * INSTALL - Consume reserved inventory
 */
async function install(ctx, commitment_ids, payload) {
  const { qty_to_install } = payload;
  const commitmentId = commitment_ids?.[0];
  
  if (!commitmentId || qty_to_install === undefined) {
    throw new Error('commitment_id and qty_to_install required');
  }

  const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
  if (!commitment) throw new Error('Commitment not found');

  const [part] = await ctx.base44.entities.Part.filter({ id: commitment.part_id });
  if (!part) throw new Error('Part not found');

  const reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
  const current_installed = commitment.qty_installed ?? 0;
  const required = commitment.required_total ?? commitment.qty_committed ?? 0;
  const available_to_install = reserved - current_installed;

  // For CLIENT_SUPPLIED, don't touch stock
  const supply_type = commitment.supply_source_type ?? 'VENDOR';
  const affects_stock = supply_type !== 'CLIENT_SUPPLIED';

  if (qty_to_install > available_to_install && affects_stock) {
    throw new Error(`Cannot install ${qty_to_install}, only ${available_to_install} available`);
  }

  if (ctx.dry_run) {
    return {
      preview: {
        commitment_id: commitmentId,
        qty_installing: qty_to_install,
        new_installed: current_installed + qty_to_install,
        affects_stock
      }
    };
  }

  const new_installed = current_installed + qty_to_install;
  
  // Update commitment
  await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    qty_installed: new_installed,
    reserved_from_stock: affects_stock ? reserved - qty_to_install : reserved,
    qty_reserved: affects_stock ? reserved - qty_to_install : reserved,
    commitment_status: new_installed >= required ? 'installed' : commitment.commitment_status,
    commitment_version: (commitment.commitment_version ?? 0) + 1
  });

  // Update part physical stock (if affects stock)
  if (affects_stock) {
    const new_physical = Math.max(0, (part.physical_stock ?? 0) - qty_to_install);
    await ctx.base44.asServiceRole.entities.Part.update(part.id, {
      physical_stock: new_physical
    });
    ctx.mutations.push({ entity: 'Part', id: part.id, action: 'INSTALL' });
  }

  // Create InstalledPart record
  await ctx.base44.asServiceRole.entities.InstalledPart.create({
    part_id: part.id,
    project_id: commitment.project_id,
    commitment_id: commitmentId,
    qty_installed: qty_to_install,
    installed_by: ctx.user.email,
    installed_date: ctx.timestamp
  });

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'INSTALL' });
  
  ctx.lifecycle_events.push({
    entity_type: 'PartCommitment',
    entity_id: commitmentId,
    event_type: 'INSTALLED',
    actor_email: ctx.user.email,
    details: JSON.stringify({ qty: qty_to_install, total_installed: new_installed }),
    created_date: ctx.timestamp
  });

  return {
    commitment_id: commitmentId,
    qty_installed: qty_to_install,
    total_installed: new_installed
  };
}

/**
 * REVERSE_INSTALL - Undo installation
 */
async function reverseInstall(ctx, commitment_ids, payload) {
  const { qty_to_reverse, reason } = payload;
  const commitmentId = commitment_ids?.[0];
  
  if (!commitmentId || qty_to_reverse === undefined) {
    throw new Error('commitment_id and qty_to_reverse required');
  }

  const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
  if (!commitment) throw new Error('Commitment not found');

  const [part] = await ctx.base44.entities.Part.filter({ id: commitment.part_id });
  if (!part) throw new Error('Part not found');

  const current_installed = commitment.qty_installed ?? 0;
  if (qty_to_reverse > current_installed) {
    throw new Error(`Cannot reverse ${qty_to_reverse}, only ${current_installed} installed`);
  }

  const supply_type = commitment.supply_source_type ?? 'VENDOR';
  const affects_stock = supply_type !== 'CLIENT_SUPPLIED';

  if (ctx.dry_run) {
    return {
      preview: {
        commitment_id: commitmentId,
        qty_reversing: qty_to_reverse,
        new_installed: current_installed - qty_to_reverse,
        affects_stock
      }
    };
  }

  const new_installed = current_installed - qty_to_reverse;
  const current_reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;

  // Update commitment
  await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    qty_installed: new_installed,
    reserved_from_stock: affects_stock ? current_reserved + qty_to_reverse : current_reserved,
    qty_reserved: affects_stock ? current_reserved + qty_to_reverse : current_reserved,
    commitment_status: 'allocated',
    commitment_version: (commitment.commitment_version ?? 0) + 1
  });

  // Update part physical stock (if affects stock)
  if (affects_stock) {
    const new_physical = (part.physical_stock ?? 0) + qty_to_reverse;
    await ctx.base44.asServiceRole.entities.Part.update(part.id, {
      physical_stock: new_physical
    });
    ctx.mutations.push({ entity: 'Part', id: part.id, action: 'REVERSE_INSTALL' });
  }

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'REVERSE_INSTALL' });
  
  ctx.lifecycle_events.push({
    entity_type: 'PartCommitment',
    entity_id: commitmentId,
    event_type: 'INSTALL_REVERSED',
    actor_email: ctx.user.email,
    details: JSON.stringify({ qty: qty_to_reverse, reason, new_installed }),
    created_date: ctx.timestamp
  });

  return {
    commitment_id: commitmentId,
    qty_reversed: qty_to_reverse,
    new_installed
  };
}

/**
 * ALLOCATE_POOL - Allocate billing pool to commitment
 */
async function allocatePool(ctx, commitment_ids, payload) {
  const { pool_id, amount } = payload;
  const commitmentId = commitment_ids?.[0];
  
  if (!commitmentId || !pool_id || amount === undefined) {
    throw new Error('commitment_id, pool_id, and amount required');
  }

  // Delegate to commitmentService for pool operations
  const result = await ctx.base44.functions.invoke('commitmentService', {
    action: 'allocatePool',
    pool_id,
    commitment_id: commitmentId,
    amount
  });

  if (result.data?.error) {
    throw new Error(result.data.error);
  }

  ctx.mutations.push({ entity: 'PoolAllocation', id: 'new', action: 'ALLOCATE_POOL' });
  
  return result.data;
}

/**
 * CANCEL_COMMITMENT - Cancel a commitment
 */
async function cancelCommitment(ctx, commitment_ids, payload) {
  const { reason } = payload;
  const commitmentId = commitment_ids?.[0];
  
  if (!commitmentId) throw new Error('commitment_id required');

  const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
  if (!commitment) throw new Error('Commitment not found');

  if (commitment.commitment_status === 'cancelled') {
    throw new Error('Commitment already cancelled');
  }

  // Determine cancellation type
  let cancellation_type = 'before_order';
  if (commitment.billing_status === 'paid') {
    cancellation_type = 'after_paid';
  } else if (commitment.billing_status === 'invoiced') {
    cancellation_type = 'after_invoice';
  } else if ((commitment.covered_from_po ?? commitment.qty_ordered ?? 0) > 0) {
    cancellation_type = 'before_invoice';
  }

  if (ctx.dry_run) {
    return {
      preview: {
        commitment_id: commitmentId,
        cancellation_type,
        current_status: commitment.commitment_status,
        billing_status: commitment.billing_status
      }
    };
  }

  // Update commitment
  await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    commitment_status: 'cancelled',
    cancelled_at: ctx.timestamp,
    cancelled_by: ctx.user.email,
    cancelled_reason: reason,
    cancellation_type,
    commitment_version: (commitment.commitment_version ?? 0) + 1
  });

  // Release reserved stock back to available
  const reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
  if (reserved > 0) {
    // The stock becomes available again (allocated_stock will decrease when resolver runs)
    ctx.lifecycle_events.push({
      entity_type: 'Part',
      entity_id: commitment.part_id,
      event_type: 'STOCK_RELEASED',
      actor_email: ctx.user.email,
      details: JSON.stringify({ qty: reserved, from_commitment: commitmentId }),
      created_date: ctx.timestamp
    });
  }

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'CANCEL' });
  
  ctx.lifecycle_events.push({
    commitment_id: commitmentId,
    event_type: 'COMMITMENT_CANCELLED',
    trigger_source: 'UNIFIED_ENGINE',
    triggered_by: ctx.user.email,
    actor_email: ctx.user.email,
    part_id: commitment.part_id,
    project_id: commitment.project_id,
    metadata: JSON.stringify({ reason, cancellation_type }),
    event_date: ctx.timestamp
  });

  return {
    commitment_id: commitmentId,
    cancellation_type,
    stock_released: reserved
  };
}

// ============================================================================
// ADD_STOCK - Canonical stock addition (no commitment)
// ============================================================================

/**
 * ADD_STOCK - Add physical inventory without a PO or commitment
 * 
 * This is the canonical way to add "found inventory", "gifts", "transfers in", etc.
 * It updates Part.physical_stock and optionally creates an InventoryItem for location tracking.
 * 
 * Inputs:
 * - part_id: ID of the part
 * - qty: Quantity to add (positive)
 * - location_id: Optional storage location
 * - note: Optional note describing why
 * - purchase_cost: Optional cost per unit
 * 
 * Returns: updated part snapshot + inventory state
 */
async function addStock(ctx, payload) {
  const { part_id, qty, location_id, note, purchase_cost } = payload;

  if (!part_id) {
    throw new Error('part_id is required for ADD_STOCK');
  }
  
  const quantity = Number(qty) || 0;
  if (quantity <= 0) {
    throw new Error('qty must be a positive number');
  }

  // Fetch the part
  const [part] = await ctx.base44.entities.Part.filter({ id: part_id });
  if (!part) throw new Error('Part not found');

  const old_physical = part.physical_stock ?? 0;
  const new_physical = old_physical + quantity;

  if (ctx.dry_run) {
    return {
      preview: {
        part_id,
        part_name: part.part_name,
        qty_adding: quantity,
        old_physical_stock: old_physical,
        new_physical_stock: new_physical,
        location_id
      }
    };
  }

  // Update Part.physical_stock
  await ctx.base44.asServiceRole.entities.Part.update(part_id, {
    physical_stock: new_physical
  });

  ctx.mutations.push({ entity: 'Part', id: part_id, action: 'ADD_STOCK' });

  // Create InventoryItem for location tracking (optional, backward compatibility)
  let inventoryItemId = null;
  if (location_id) {
    const invItem = await ctx.base44.asServiceRole.entities.InventoryItem.create({
      part_id,
      location_id,
      quantity_on_hand: quantity,
      quantity_reserved: 0,
      purchase_cost: purchase_cost ? Number(purchase_cost) : null,
      received_date: new Date().toISOString().split('T')[0],
      notes: note || 'Added via ADD_STOCK action'
    });
    inventoryItemId = invItem.id;
    ctx.mutations.push({ entity: 'InventoryItem', id: invItem.id, action: 'CREATE' });
  }

  // Create audit log entry
  await ctx.base44.asServiceRole.entities.InventoryAuditLog.create({
    part_id,
    action_type: 'ADD_STOCK',
    qty_delta: quantity,
    old_qty: old_physical,
    new_qty: new_physical,
    location_id: location_id || null,
    notes: note || null,
    performed_by: ctx.user.email,
    performed_at: ctx.timestamp
  });

  // Note: Lifecycle events require commitment_id, so we skip for stock-level operations
  // The InventoryAuditLog above serves as the audit trail for stock additions

  // Return updated state
  return {
    success: true,
    part_id,
    part_name: part.part_name,
    qty_added: quantity,
    old_physical_stock: old_physical,
    new_physical_stock: new_physical,
    location_id,
    inventory_item_id: inventoryItemId,
    // Context for invalidation
    invalidation_context: {
      part_ids: [part_id],
      invalidateAll: true
    }
  };
}