import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * executeSupplyAction - Unified Supply Dispatcher
 * 
 * This is the ONLY entry point for supply mutations.
 * No component may write to commitment/inventory entities directly.
 * 
 * STABILIZATION FIX: All helper functions (rebalance, recompute) are INLINED
 * to avoid nested asServiceRole.functions.invoke() calls that cause 403 errors.
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
      inventory_audit_logs: [],
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
      case 'RECEIVE_STOCK':
        result = await addStock(context, payload);
        break;
      case 'INSTALL':
        result = await install(context, commitment_ids, payload);
        break;
      case 'REVERSE_INSTALL':
        result = await reverseInstall(context, commitment_ids, payload);
        break;
      case 'ALLOCATE_POOL':
        throw new Error('ALLOCATE_POOL action has been removed. Use InvoiceBatch for billing.');
      case 'CANCEL_COMMITMENT':
        result = await cancelCommitment(context, commitment_ids, payload);
        break;
      default:
        return Response.json({ error: `Unknown action_type: ${action_type}` }, { status: 400 });
    }

    // Write lifecycle events if not dry run
    if (!dry_run && context.lifecycle_events.length > 0) {
      for (const event of context.lifecycle_events) {
        if (event.commitment_id) {
          await base44.asServiceRole.entities.LifecycleEvent.create(event);
        }
      }
    }
    
    // Write inventory audit logs if not dry run
    if (!dry_run && context.inventory_audit_logs && context.inventory_audit_logs.length > 0) {
      for (const log of context.inventory_audit_logs) {
        await base44.asServiceRole.entities.InventoryAuditLog.create(log);
      }
    }

    const rebalance_occurred = context.mutations.some(m => 
      m.action === 'RECEIVE' || m.action === 'ADD_STOCK' || m.action === 'REVERSE_INSTALL'
    );
    const toast_notification = rebalance_occurred 
      ? { message: 'Stock auto-allocated to project', type: 'success' }
      : null;

    return Response.json({
      toast_notification,
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
      success: false,
      error: error.message,
      action_failed: true
    }, { status: 500 });
  }
});

// ============================================================================
// INLINED HELPERS (avoid nested function.invoke calls)
// ============================================================================

/**
 * INLINED rebalancePartReservations - CANONICAL reservation math
 * Replaces: base44.asServiceRole.functions.invoke('rebalancePartReservations', ...)
 */
async function inlineRebalance(ctx, part_id, isDryRun) {
  const [part] = await ctx.base44.asServiceRole.entities.Part.filter({ id: part_id });
  if (!part) throw new Error(`REBALANCE_PART_NOT_FOUND: ${part_id}`);

  const physical_stock = part.physical_stock ?? 0;

  const allCommitments = await ctx.base44.asServiceRole.entities.PartCommitment.filter({ part_id });
  const openCommitments = allCommitments.filter(c => 
    c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed'
  );

  // Priority sort: highest priority first, then FIFO
  const priorityOrder = { 'Critical': 4, 'High': 3, 'Normal': 2, 'Low': 1 };
  openCommitments.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] || 2;
    const bPriority = priorityOrder[b.priority] || 2;
    if (bPriority !== aPriority) return bPriority - aPriority;
    const aDate = new Date(a.created_date);
    const bDate = new Date(b.created_date);
    if (aDate.getTime() !== bDate.getTime()) return aDate - bDate;
    return (a.id || '').localeCompare(b.id || '');
  });

  let remaining_stock = physical_stock;
  const updates = [];

  for (const c of openCommitments) {
    const required_total = c.required_total ?? 0;
    const qty_installed = c.qty_installed ?? 0;
    const covered_from_po = c.covered_from_po ?? 0;
    const current_reserved = c.reserved_from_stock ?? 0;
    const current_to_order = c.qty_to_order ?? 0;

    const remaining_required = Math.max(0, required_total - qty_installed);
    const need_from_stock = Math.max(0, remaining_required - covered_from_po);
    const new_reserved = Math.min(remaining_stock, need_from_stock);
    const new_to_order = Math.max(0, remaining_required - new_reserved - covered_from_po);

    remaining_stock = Math.max(0, remaining_stock - new_reserved);

    const needs_update = (new_reserved !== current_reserved) || (new_to_order !== current_to_order);

    if (needs_update) {
      updates.push({
        commitment_id: c.id,
        project_id: c.project_id,
        required_total,
        qty_installed,
        remaining_required,
        covered_from_po,
        old_reserved: current_reserved,
        new_reserved,
        old_to_order: current_to_order,
        new_to_order,
        delta_reserved: new_reserved - current_reserved
      });
    }

    // Invariant check
    const sum = new_reserved + covered_from_po + new_to_order;
    if (Math.abs(sum - remaining_required) > 0.001) {
      throw new Error(`REBALANCE_INVARIANT_VIOLATION: commitment=${c.id} sum=${sum} expected=${remaining_required}`);
    }
  }

  // Over-allocation check
  const total_reserved = openCommitments.reduce((sum, c) => {
    const update = updates.find(u => u.commitment_id === c.id);
    return sum + (update ? update.new_reserved : (c.reserved_from_stock ?? 0));
  }, 0);

  if (total_reserved > physical_stock + 0.001) {
    throw new Error(`REBALANCE_OVER_ALLOCATION: physical=${physical_stock} total_reserved=${total_reserved}`);
  }

  // Apply updates
  if (!isDryRun && updates.length > 0) {
    for (const u of updates) {
      await ctx.base44.asServiceRole.entities.PartCommitment.update(u.commitment_id, {
        reserved_from_stock: u.new_reserved,
        qty_reserved: u.new_reserved,
        qty_to_order: u.new_to_order,
        last_recomputed_at: ctx.timestamp
      });
    }
  }

  return {
    success: true,
    part_id,
    physical_stock,
    commitments_updated: updates.length,
    remaining_stock_after: remaining_stock,
    updates,
  };
}

/**
 * INLINED recomputePartPhysicalStock
 * Replaces: base44.asServiceRole.functions.invoke('recomputePartPhysicalStock', ...)
 */
async function inlineRecomputePhysicalStock(ctx, part_id, isDryRun) {
  const [parts, inventoryItems] = await Promise.all([
    ctx.base44.asServiceRole.entities.Part.filter({ id: part_id }),
    ctx.base44.asServiceRole.entities.InventoryItem.filter({ part_id })
  ]);

  const part = parts[0];
  if (!part) throw new Error('Part not found for recompute');

  const computed_physical_stock = inventoryItems.reduce((sum, item) => {
    return sum + (item.quantity_on_hand ?? 0);
  }, 0);

  const current_physical_stock = part.physical_stock ?? 0;
  const needs_update = Math.abs(computed_physical_stock - current_physical_stock) > 0.001;

  if (needs_update && !isDryRun) {
    await ctx.base44.asServiceRole.entities.Part.update(part_id, {
      physical_stock: computed_physical_stock
    });
  }

  return { computed_physical_stock, current_physical_stock, needs_update, updated: needs_update && !isDryRun };
}

// ============================================================================
// ACTION IMPLEMENTATIONS
// ============================================================================

function mapSourceType(source_type) {
  const mapping = {
    'SHOP_PURCHASED': 'VENDOR', 'VENDOR': 'VENDOR',
    'CLIENT_SUPPLIED': 'CLIENT_SUPPLIED', 'AK_CUSTOM': 'AK_CUSTOM',
    'TAKE_OFF': 'TAKE_OFF', 'STOCK': 'STOCK'
  };
  return mapping[source_type] || 'VENDOR';
}

async function adjustRequired(ctx, commitment_ids, payload) {
  const { 
    required_total_delta, required_total_set, new_required_total,
    source_type = 'SHOP_PURCHASED', project_id, part_id,
    reopen_if_closed = false
  } = payload;

  const effectiveRequiredSet = required_total_set ?? new_required_total;
  
  if (effectiveRequiredSet === undefined && required_total_delta === undefined) {
    throw new Error('Either required_total_delta or required_total_set must be provided');
  }

  let commitmentId = commitment_ids?.[0];
  let commitment = null;
  let part = null;
  let isNewCommitment = false;
  let wasReopened = false;

  if (commitmentId) {
    const commitments = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
    commitment = commitments[0];
    if (!commitment) throw new Error('Commitment not found');
    if (reopen_if_closed && ['closed', 'cancelled'].includes(commitment.commitment_status)) {
      wasReopened = true;
    }
  }

  if (!commitmentId) {
    if (!project_id || !part_id) throw new Error('Either commitment_id OR (project_id + part_id) required');

    const existingCommitments = await ctx.base44.entities.PartCommitment.filter({
      project_id, part_id, is_archived: { $ne: true }
    });

    const activeCommitment = existingCommitments.find(c => !['cancelled', 'closed'].includes(c.commitment_status));
    const closedCommitment = existingCommitments.find(c => ['cancelled', 'closed'].includes(c.commitment_status));

    if (activeCommitment) {
      commitment = activeCommitment;
      commitmentId = commitment.id;
    } else if (reopen_if_closed && closedCommitment) {
      commitment = closedCommitment;
      commitmentId = commitment.id;
      wasReopened = true;
    } else {
      const parts = await ctx.base44.entities.Part.filter({ id: part_id });
      part = parts[0];
      if (!part) throw new Error('Part not found');

      const initialRequired = effectiveRequiredSet ?? Math.max(1, required_total_delta ?? 1);
      
      if (ctx.dry_run) {
        isNewCommitment = true;
      } else {
        const unit_cost = part.cost || 0;
        const pricing_mode = part.pricing_mode || 'matrix';
        let retail_effective = 0;
        
        if (pricing_mode === 'manual') {
          if (!part.retail_override || part.retail_override <= 0) {
            throw new Error(`PRICING_MODE_INVALID: Part ${part.part_name} has manual mode but no retail_override`);
          }
          retail_effective = part.retail_override;
        } else {
          retail_effective = Math.round(part.retail_matrix_price || 0);
        }
        
        let pricing_integrity_status = 'ok';
        if (unit_cost <= 0) pricing_integrity_status = 'missing_cost';
        else if (retail_effective <= 0) pricing_integrity_status = 'missing_retail';
        else if (retail_effective < unit_cost) pricing_integrity_status = 'margin_negative';
        
        commitment = await ctx.base44.asServiceRole.entities.PartCommitment.create({
          project_id, part_id,
          required_total: initialRequired, reserved_from_stock: 0, covered_from_po: 0, qty_installed: 0,
          supply_source_type: mapSourceType(source_type),
          qty_committed: initialRequired, qty_reserved: 0, qty_to_order: initialRequired,
          qty_ordered: 0, qty_received: 0,
          commitment_status: 'planned', coverage_status: 'NOT_COVERED',
          source_type: 'manual_attachment', billing_status: 'unbilled',
          requires_prepay: payload.requires_prepay || false,
          unit_cost_snapshot: unit_cost, unit_retail_snapshot: retail_effective,
          planned_cost_total: unit_cost * initialRequired,
          planned_retail_total: retail_effective * initialRequired,
          pricing_integrity_status,
          commitment_version: 1, state_version: 1, last_recomputed_at: ctx.timestamp
        });

        commitmentId = commitment.id;
        isNewCommitment = true;
        ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'CREATE' });
        ctx.lifecycle_events.push({
          commitment_id: commitmentId, event_type: 'COMMITMENT_CREATED',
          trigger_source: 'UNIFIED_ENGINE', triggered_by: ctx.user.email,
          actor_email: ctx.user.email, part_id, project_id,
          metadata: JSON.stringify({ required_total: initialRequired, source_type }),
          event_date: ctx.timestamp
        });
      }
    }
  }

  if (!commitment && commitmentId) {
    const commitments = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
    commitment = commitments[0];
    if (!commitment) throw new Error('Commitment not found');
    if (reopen_if_closed && ['closed', 'cancelled'].includes(commitment.commitment_status)) {
      wasReopened = true;
    }
  }

  if (!part) {
    const parts = await ctx.base44.entities.Part.filter({ id: commitment?.part_id || part_id });
    part = parts[0];
    if (!part) throw new Error('Part not found');
  }

  const current_required = commitment?.required_total ?? commitment?.qty_committed ?? 0;
  let new_required;
  
  if (effectiveRequiredSet !== undefined) {
    new_required = Math.max(0, effectiveRequiredSet);
  } else {
    new_required = Math.max(0, current_required + (required_total_delta ?? 0));
  }
  
  // Delta commitment model enforcement
  const delta = new_required - current_required;
  
  if (!isNewCommitment && delta > 0 && commitmentId) {
    const has_lifecycle_progress = 
      (commitment?.invoiced_qty || 0) > 0 ||
      (commitment?.qty_installed || 0) > 0 ||
      (commitment?.covered_from_po || 0) > 0;
    
    if (has_lifecycle_progress) {
      if (ctx.dry_run) {
        return { preview: { action: 'WILL_CREATE_SCOPE_ADDITION', commitment_id: commitmentId, delta } };
      }
      
      // INLINE scope addition instead of nested function call
      const unit_cost_snapshot = part.cost || 0;
      const pricing_mode = part.pricing_mode || 'matrix';
      let unit_retail_snapshot = 0;
      if (pricing_mode === 'manual') {
        unit_retail_snapshot = part.retail_override || 0;
      } else {
        unit_retail_snapshot = part.retail_matrix_price || 0;
      }
      
      const scopeCommitment = await ctx.base44.asServiceRole.entities.PartCommitment.create({
        project_id: commitment.project_id, part_id: part.id,
        required_total: delta, reserved_from_stock: 0, covered_from_po: 0,
        qty_installed: 0, invoiced_qty: 0, invoiced_amount: 0,
        billing_status: 'unbilled', commitment_status: 'planned', coverage_status: 'NOT_COVERED',
        source_type: 'scope_addition', parent_commitment_id: commitmentId,
        allocation_source: 'manual_commitment',
        unit_cost_snapshot, unit_retail_snapshot,
        planned_cost_total: unit_cost_snapshot * delta,
        planned_retail_total: unit_retail_snapshot * delta,
        qty_committed: delta, qty_to_order: delta, qty_ordered: 0, qty_received: 0,
        qty_reserved: 0, qty_allocated: 0, qty_cancelled: 0,
        supply_source_type: 'VENDOR', order_line_item_ids: [],
        commitment_version: 1, state_version: 0,
        last_recomputed_at: ctx.timestamp,
        requires_prepay: false,
      });
      
      ctx.mutations.push({ entity: 'PartCommitment', id: scopeCommitment.id, action: 'SCOPE_ADDITION_CREATE' });
      
      return {
        success: true, action: 'SCOPE_ADDITION_CREATED',
        parent_commitment_id: commitmentId, new_commitment_id: scopeCommitment.id,
        new_commitment: scopeCommitment, delta_qty: delta,
        message: `Created scope addition commitment for +${delta} units.`
      };
    }
  }

  const covered_from_po = commitment?.covered_from_po ?? 0;

  if (ctx.dry_run) {
    const rebalancePreview = await inlineRebalance(ctx, part.id, true);
    return {
      preview: {
        commitment_id: commitmentId ?? 'NEW', is_new_commitment: isNewCommitment || !commitmentId,
        project_id: commitment?.project_id || project_id, part_id: part.id,
        old_required: current_required, new_required, delta: new_required - current_required,
        covered_from_po, rebalance_preview: rebalancePreview,
      }
    };
  }

  // Persist changes
  const pricing_mode = part.pricing_mode || 'matrix';
  let retail_effective;
  if (pricing_mode === 'manual') { retail_effective = part.retail_override || 0; }
  else { retail_effective = Math.round(part.retail_matrix_price || 0); }
  
  const updateData = {
    required_total: new_required, covered_from_po,
    supply_source_type: mapSourceType(source_type),
    qty_committed: new_required,
    planned_cost_total: (commitment?.unit_cost_snapshot ?? part.cost ?? 0) * new_required,
    planned_retail_total: (commitment?.unit_retail_snapshot ?? retail_effective) * new_required,
    commitment_version: (commitment?.commitment_version ?? 0) + 1,
    state_version: (commitment?.state_version ?? 0) + 1,
    last_recomputed_at: ctx.timestamp
  };

  if (wasReopened) {
    updateData.commitment_status = 'planned';
    updateData.coverage_status = 'NOT_COVERED';
    updateData.cancelled_at = null;
    updateData.cancelled_reason = null;
    updateData.cancelled_by = null;
  }

  if (!isNewCommitment && commitmentId) {
    await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, updateData);
  }

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'ADJUST_REQUIRED' });
  
  // INLINE rebalance (replaces nested function call)
  const rebalanceResult = await inlineRebalance(ctx, part.id, ctx.dry_run);
  
  const updatedCommitment = rebalanceResult.updates?.find(u => u.commitment_id === commitmentId);
  const final_reserved = updatedCommitment?.new_reserved ?? 0;
  const final_to_order = updatedCommitment?.new_to_order ?? 0;
  
  if (!isNewCommitment && new_required !== current_required) {
    ctx.lifecycle_events.push({
      commitment_id: commitmentId,
      event_type: new_required > current_required ? 'QTY_INCREASED' : 'QTY_DECREASED',
      actor_email: ctx.user.email, trigger_source: 'UNIFIED_ENGINE', triggered_by: ctx.user.email,
      old_values: JSON.stringify({ required_total: current_required }),
      new_values: JSON.stringify({ required_total: new_required, reserved_from_stock: final_reserved }),
      part_id: part.id, project_id: commitment?.project_id || project_id,
      event_date: ctx.timestamp
    });
  }

  const [project] = await ctx.base44.entities.Project.filter({ id: commitment?.project_id || project_id });
  const coverage_total = final_reserved + covered_from_po;
  let coverage_status = 'NOT_COVERED';
  if (coverage_total >= new_required && new_required > 0) coverage_status = 'FULLY_COVERED';
  else if (coverage_total > 0) coverage_status = 'PARTIALLY_COVERED';
  
  return {
    success: true, commitment_id: commitmentId, is_new_commitment: isNewCommitment,
    required_total: new_required, reserved_from_stock: final_reserved,
    covered_from_po, to_order: final_to_order, coverage_status,
    project_id: commitment?.project_id || project_id, project_name: project?.name,
    part_id: part.id, part_name: part.part_name, source_type,
    next_action: final_to_order > 0 ? 'CREATE_PO' : 'COMPLETE',
    rebalance_result: rebalanceResult
  };
}

async function autoReserve(ctx, commitment_ids, payload) {
  if (!commitment_ids || commitment_ids.length === 0) {
    return { results: [], message: 'No commitments provided' };
  }

  const partIds = new Set();
  const commitmentDetails = [];
  
  for (const commitmentId of commitment_ids) {
    const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
    if (!commitment) continue;
    partIds.add(commitment.part_id);
    commitmentDetails.push({ commitment_id: commitmentId, part_id: commitment.part_id, old_reserved: commitment.reserved_from_stock ?? 0 });
  }

  const rebalanceResults = [];
  for (const part_id of partIds) {
    const rebalanceResult = await inlineRebalance(ctx, part_id, ctx.dry_run);
    rebalanceResults.push(rebalanceResult);
    if (!ctx.dry_run) ctx.mutations.push({ entity: 'Part', id: part_id, action: 'AUTO_RESERVE_REBALANCE' });
  }

  const results = commitmentDetails.map(cd => {
    const partRebalance = rebalanceResults.find(r => r.part_id === cd.part_id);
    const update = partRebalance?.updates?.find(u => u.commitment_id === cd.commitment_id);
    return {
      commitment_id: cd.commitment_id, part_id: cd.part_id,
      old_reserved: cd.old_reserved, new_reserved: update?.new_reserved ?? cd.old_reserved,
      delta_reserved: update?.delta_reserved ?? 0, rebalanced: !!update
    };
  });

  if (!ctx.dry_run) {
    for (const r of results) {
      if (r.delta_reserved > 0) {
        ctx.lifecycle_events.push({
          commitment_id: r.commitment_id, event_type: 'AUTO_RESERVE',
          actor_email: ctx.user.email, trigger_source: 'UNIFIED_ENGINE', triggered_by: ctx.user.email,
          metadata: JSON.stringify({ reserved: r.delta_reserved, via_rebalance: true }),
          event_date: ctx.timestamp
        });
      }
    }
  }

  return { results, rebalance_summary: { parts_rebalanced: partIds.size, commitments_updated: results.filter(r => r.delta_reserved !== 0).length } };
}

async function createPO(ctx, commitment_ids, payload) {
  const { vendor_id, po_prefix = 'AK', vendor_order_data = {} } = payload;
  
  if (!commitment_ids || commitment_ids.length === 0) {
    throw new Error('PO_COMMITMENT_REQUIRED: commitment_ids array is required for CREATE_PO');
  }

  const commitments = await ctx.base44.entities.PartCommitment.filter({ id: { $in: commitment_ids } });
  const vendorGroups = new Map();
  const blocked = [];

  for (const commitment of commitments) {
    const [part] = await ctx.base44.entities.Part.filter({ id: commitment.part_id });
    if (!part) { blocked.push({ commitment_id: commitment.id, reason_code: 'PART_NOT_FOUND' }); continue; }

    const effectiveVendor = vendor_id || part.default_vendor_id;
    if (!effectiveVendor) {
      throw new Error(`PO_VENDOR_REQUIRED: Commitment ${commitment.id} (${part.part_name}) has no vendor_id`);
    }

    const required = commitment.required_total ?? commitment.qty_committed ?? 0;
    const reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
    const covered_po = commitment.covered_from_po ?? 0;
    const gap = Math.max(0, required - reserved - covered_po);

    if (gap <= 0) { blocked.push({ commitment_id: commitment.id, reason_code: 'NO_GAP', gap: 0 }); continue; }

    if (!vendorGroups.has(effectiveVendor)) vendorGroups.set(effectiveVendor, []);
    vendorGroups.get(effectiveVendor).push({
      commitment, part, qty: gap,
      unit_cost: commitment.unit_cost_snapshot ?? part.cost ?? 0
    });
  }

  if (ctx.dry_run) {
    return {
      preview: {
        vendor_groups: Array.from(vendorGroups.entries()).map(([vendorId, items]) => ({
          vendor_id: vendorId, line_count: items.length,
          items: items.map(i => ({ commitment_id: i.commitment.id, part_name: i.part.part_name, qty: i.qty, unit_cost: i.unit_cost }))
        }))
      }, blocked
    };
  }

  const created_orders = [];
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  for (const [vendorId, items] of vendorGroups) {
    let seq = 1;
    const existingOrders = await ctx.base44.entities.Order.filter({ po_number: { $regex: `^${po_prefix}_${dateStr}` } });
    if (existingOrders.length > 0) {
      const maxSeq = existingOrders.reduce((max, o) => {
        const parts = o.po_number.split('_');
        return Math.max(max, parseInt(parts[2] || '0', 10));
      }, 0);
      seq = maxSeq + 1;
    }

    const po_number = `${po_prefix}_${dateStr}_${String(seq).padStart(3, '0')}`;
    const vendorData = vendor_order_data[vendorId] || {};

    const order = await ctx.base44.asServiceRole.entities.Order.create({
      po_number, po_prefix: vendorData.po_prefix || po_prefix,
      vendor_id: vendorId, order_number: vendorData.order_number || null,
      order_url: vendorData.order_url || null,
      order_date: vendorData.order_date || new Date().toISOString().slice(0, 10),
      eta_date: vendorData.eta_date || null, notes: vendorData.notes || null,
      freight_cost: vendorData.freight_cost || 0, tariff_cost: vendorData.tariff_cost || 0,
      status: 'Draft'
    });

    for (const item of items) {
      const requestedQty = Number(item.qty);
      if (!requestedQty || requestedQty <= 0 || !Number.isFinite(requestedQty)) {
        throw new Error(`CREATE_PO_INVALID_QTY_ORDERED: qty must be positive, got ${item.qty}`);
      }
      
      const lineItem = await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.create({
        order_id: order.id, part_id: item.part.id, commitment_id: item.commitment.id,
        vendor_id: vendorId, qty_ordered: requestedQty, qty_received: 0,
        unit_cost: item.unit_cost, unit_retail: item.commitment.unit_retail_snapshot ?? 0,
        extended_cost: item.unit_cost * requestedQty, status: 'Ordered'
      });

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

    const projectIds = [...new Set(items.map(i => i.commitment.project_id).filter(Boolean))];
    created_orders.push({ order_id: order.id, po_number, vendor_id: vendorId, line_count: items.length, project_ids });
  }

  return { created_orders, blocked };
}

async function receive(ctx, commitment_ids, payload) {
  if (payload.order_id && payload.lines) {
    return receiveBatch(ctx, payload);
  }
  const { line_item_id, qty_received, location_id } = payload;
  if (!line_item_id || qty_received === undefined) throw new Error('line_item_id and qty_received required');
  return receiveSingleLine(ctx, line_item_id, qty_received, location_id);
}

async function getOrCreateDefaultLocation(ctx) {
  const systemLocations = await ctx.base44.asServiceRole.entities.Location.filter({ location_area: 'UNASSIGNED_SYSTEM' });
  if (systemLocations.length > 0) return systemLocations[0].id;
  const newLoc = await ctx.base44.asServiceRole.entities.Location.create({
    location_area: 'UNASSIGNED_SYSTEM', description: 'System default location', active: true
  });
  return newLoc.id;
}

async function upsertInventoryItem(ctx, part_id, location_id, qty) {
  const existingItems = await ctx.base44.asServiceRole.entities.InventoryItem.filter({ part_id, location_id });
  if (existingItems.length > 1) throw new Error('INVENTORY_LOCATION_DUPLICATE_ERROR');
  
  if (existingItems.length === 1) {
    const existing = existingItems[0];
    await ctx.base44.asServiceRole.entities.InventoryItem.update(existing.id, {
      quantity_on_hand: (existing.quantity_on_hand ?? 0) + qty
    });
    ctx.mutations.push({ entity: 'InventoryItem', id: existing.id, action: 'RECEIVE_UPDATE' });
  } else {
    const invItem = await ctx.base44.asServiceRole.entities.InventoryItem.create({
      part_id, location_id, quantity_on_hand: qty, quantity_reserved: 0,
      received_date: new Date().toISOString().split('T')[0]
    });
    ctx.mutations.push({ entity: 'InventoryItem', id: invItem.id, action: 'RECEIVE_CREATE' });
  }
}

async function receiveBatch(ctx, payload) {
  const { order_id, lines } = payload;
  if (!order_id || !lines || lines.length === 0) throw new Error('order_id and lines[] required');

  const [order] = await ctx.base44.entities.Order.filter({ id: order_id });
  if (!order) throw new Error('Order not found');

  const results = [];
  const errors = [];
  const skipped = [];
  let total_received = 0;
  const affectedPartIds = new Set();

  for (const line of lines) {
    const qty = line.receive_qty ?? line.qty_received ?? 0;
    if (!line.line_item_id || qty <= 0) { skipped.push({ line_item_id: line.line_item_id || null }); continue; }

    try {
      const result = await receiveSingleLineForBatch(ctx, line.line_item_id, qty, line.location_id);
      results.push(result);
      total_received += qty;
      if (result.part_id) affectedPartIds.add(result.part_id);
    } catch (lineError) {
      errors.push({ line_item_id: line.line_item_id, error: lineError.message });
    }
  }

  // BATCH: Recompute + rebalance ONCE per affected part (INLINED)
  for (const partId of affectedPartIds) {
    try {
      await inlineRecomputePhysicalStock(ctx, partId, false);
      await inlineRebalance(ctx, partId, false);
      ctx.mutations.push({ entity: 'Part', id: partId, action: 'BATCH_RECOMPUTE_REBALANCE' });
    } catch (postErr) {
      console.error(`[BATCH_POST_PROCESS_ERROR] part_id=${partId}: ${postErr.message}`);
    }
  }

  // Update order status
  const allLineItems = await ctx.base44.entities.PartPurchaseLineItem.filter({ order_id });
  const allReceived = allLineItems.every(li => (li.qty_received ?? 0) >= (li.qty_ordered ?? 0));
  const someReceived = allLineItems.some(li => (li.qty_received ?? 0) > 0);
  const newStatus = allReceived ? 'Received' : (someReceived ? 'Partial' : order.status);
  
  if (newStatus !== order.status) {
    await ctx.base44.asServiceRole.entities.Order.update(order_id, {
      status: newStatus, received_date: allReceived ? new Date().toISOString().slice(0, 10) : null
    });
  }

  return {
    order_id, order_status: newStatus,
    lines_received: results.length, lines_skipped: skipped.length,
    lines_errored: errors.length, total_qty_received: total_received,
    results, errors: errors.length > 0 ? errors : undefined,
  };
}

async function receiveSingleLineForBatch(ctx, line_item_id, qty_received, location_id) {
  const [lineItem] = await ctx.base44.entities.PartPurchaseLineItem.filter({ id: line_item_id });
  if (!lineItem) throw new Error(`Line item ${line_item_id} not found`);

  const [part] = await ctx.base44.entities.Part.filter({ id: lineItem.part_id });
  if (!part) throw new Error('Part not found');

  const ordered = lineItem.qty_ordered ?? 0;
  const already_received = lineItem.qty_received ?? 0;
  const remaining = Math.max(0, ordered - already_received);

  if (qty_received > remaining) throw new Error(`RECEIVE_OVERFLOW: Cannot receive ${qty_received}, only ${remaining} remaining`);
  if (qty_received <= 0) throw new Error('RECEIVE_INVALID_QTY');

  let effective_location_id = location_id || await getOrCreateDefaultLocation(ctx);

  if (ctx.dry_run) return { preview: { line_item_id, part_name: part.part_name, qty_receiving: qty_received } };

  const new_line_received = already_received + qty_received;
  const line_status = new_line_received >= ordered ? 'Received' : 'Partial';
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id, { qty_received: new_line_received, status: line_status });

  await upsertInventoryItem(ctx, part.id, effective_location_id, qty_received);

  if (lineItem.commitment_id) {
    const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: lineItem.commitment_id });
    if (commitment) {
      await ctx.base44.asServiceRole.entities.PartCommitment.update(lineItem.commitment_id, {
        covered_from_po: Math.max(0, (commitment.covered_from_po ?? 0) - qty_received),
        qty_received: (commitment.qty_received ?? 0) + qty_received,
        commitment_status: 'received',
        commitment_version: (commitment.commitment_version ?? 0) + 1
      });
    }
  }

  await ctx.base44.asServiceRole.entities.InventoryReceipt.create({
    part_id: part.id, order_id: lineItem.order_id, line_item_id,
    qty_received, location_id: effective_location_id,
    received_by: ctx.user.email, received_date: ctx.timestamp
  });

  ctx.mutations.push({ entity: 'PartPurchaseLineItem', id: line_item_id, action: 'RECEIVE' });

  return { line_item_id, part_id: part.id, part_name: part.part_name, qty_received, line_status };
}

async function receiveSingleLine(ctx, line_item_id, qty_received, location_id) {
  const [lineItem] = await ctx.base44.entities.PartPurchaseLineItem.filter({ id: line_item_id });
  if (!lineItem) throw new Error(`Line item ${line_item_id} not found`);

  const [part] = await ctx.base44.entities.Part.filter({ id: lineItem.part_id });
  if (!part) throw new Error('Part not found');

  const ordered = lineItem.qty_ordered ?? 0;
  const already_received = lineItem.qty_received ?? 0;
  const remaining = Math.max(0, ordered - already_received);

  if (qty_received > remaining) throw new Error(`RECEIVE_OVERFLOW: Cannot receive ${qty_received}, only ${remaining} remaining`);
  if (qty_received <= 0) throw new Error('RECEIVE_INVALID_QTY');

  let effective_location_id = location_id || await getOrCreateDefaultLocation(ctx);

  if (ctx.dry_run) {
    return { preview: { line_item_id, part_name: part.part_name, qty_receiving: qty_received, remaining_after: remaining - qty_received } };
  }

  const new_line_received = already_received + qty_received;
  const line_status = new_line_received >= ordered ? 'Received' : 'Partial';
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id, { qty_received: new_line_received, status: line_status });

  await upsertInventoryItem(ctx, part.id, effective_location_id, qty_received);

  // INLINED recompute (replaces nested function call)
  const recomputeResult = await inlineRecomputePhysicalStock(ctx, part.id, false);
  const new_physical = recomputeResult.computed_physical_stock;

  if (lineItem.commitment_id) {
    const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: lineItem.commitment_id });
    if (commitment) {
      await ctx.base44.asServiceRole.entities.PartCommitment.update(lineItem.commitment_id, {
        covered_from_po: Math.max(0, (commitment.covered_from_po ?? 0) - qty_received),
        qty_received: (commitment.qty_received ?? 0) + qty_received,
        commitment_status: 'received',
        commitment_version: (commitment.commitment_version ?? 0) + 1
      });
      ctx.mutations.push({ entity: 'PartCommitment', id: lineItem.commitment_id, action: 'RECEIVE' });
    }
  }

  // INLINED rebalance (replaces nested function call)
  const rebalanceResult = await inlineRebalance(ctx, part.id, false);

  await ctx.base44.asServiceRole.entities.InventoryReceipt.create({
    part_id: part.id, order_id: lineItem.order_id, line_item_id,
    qty_received, location_id: effective_location_id,
    received_by: ctx.user.email, received_date: ctx.timestamp
  });

  ctx.mutations.push({ entity: 'PartPurchaseLineItem', id: line_item_id, action: 'RECEIVE' });
  ctx.mutations.push({ entity: 'Part', id: part.id, action: 'PHYSICAL_STOCK_RECOMPUTED' });

  return { line_item_id, part_id: part.id, part_name: part.part_name, qty_received, new_physical_stock: new_physical, line_status };
}

async function install(ctx, commitment_ids, payload) {
  const { qty_to_install, location_id } = payload;
  const commitmentId = commitment_ids?.[0];
  if (!commitmentId || qty_to_install === undefined) throw new Error('commitment_id and qty_to_install required');

  const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
  if (!commitment) throw new Error('Commitment not found');

  const [part] = await ctx.base44.entities.Part.filter({ id: commitment.part_id });
  if (!part) throw new Error('Part not found');

  const reserved = commitment.reserved_from_stock ?? 0;
  const current_installed = commitment.qty_installed ?? 0;
  const required = commitment.required_total ?? 0;
  const installable = Math.max(0, reserved - current_installed);
  const supply_type = commitment.supply_source_type ?? 'VENDOR';
  const affects_stock = supply_type !== 'CLIENT_SUPPLIED';

  if (qty_to_install > installable && affects_stock) throw new Error(`Cannot install ${qty_to_install}, only ${installable} installable`);

  if (affects_stock && (part.physical_stock ?? 0) < qty_to_install) {
    throw new Error(`NEGATIVE_STOCK_ATTEMPT: Cannot install ${qty_to_install}, only ${part.physical_stock ?? 0} in stock`);
  }

  if (ctx.dry_run) return { preview: { commitment_id: commitmentId, qty_installing: qty_to_install, installable, affects_stock } };

  const new_installed = current_installed + qty_to_install;
  const new_reserved = Math.max(0, reserved - qty_to_install);
  
  await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    qty_installed: new_installed, reserved_from_stock: new_reserved, qty_reserved: new_reserved,
    commitment_status: new_installed >= required ? 'installed' : commitment.commitment_status,
    commitment_version: (commitment.commitment_version ?? 0) + 1
  });

  if (affects_stock) {
    // Deduct from inventory items
    const inventoryItems = await ctx.base44.asServiceRole.entities.InventoryItem.filter({ part_id: part.id });
    let remaining_to_deduct = qty_to_install;
    
    if (location_id) {
      const [invItem] = inventoryItems.filter(i => i.location_id === location_id);
      if (invItem) {
        await ctx.base44.asServiceRole.entities.InventoryItem.update(invItem.id, {
          quantity_on_hand: Math.max(0, (invItem.quantity_on_hand ?? 0) - qty_to_install)
        });
        remaining_to_deduct = 0;
      }
    }
    
    if (remaining_to_deduct > 0) {
      for (const item of inventoryItems.filter(i => (i.quantity_on_hand ?? 0) > 0)) {
        const deduct = Math.min(item.quantity_on_hand ?? 0, remaining_to_deduct);
        if (deduct > 0) {
          await ctx.base44.asServiceRole.entities.InventoryItem.update(item.id, {
            quantity_on_hand: (item.quantity_on_hand ?? 0) - deduct
          });
          remaining_to_deduct -= deduct;
        }
        if (remaining_to_deduct <= 0) break;
      }
    }
    
    // INLINED recompute + rebalance
    await inlineRecomputePhysicalStock(ctx, part.id, false);
    await inlineRebalance(ctx, part.id, false);
    ctx.mutations.push({ entity: 'Part', id: part.id, action: 'PHYSICAL_STOCK_RECOMPUTED' });
  }

  await ctx.base44.asServiceRole.entities.InstalledPart.create({
    part_id: part.id, project_id: commitment.project_id, commitment_id: commitmentId,
    qty_installed: qty_to_install, installed_by: ctx.user.email, installed_date: ctx.timestamp
  });

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'INSTALL' });

  return { commitment_id: commitmentId, qty_installed: qty_to_install, total_installed: new_installed, new_reserved };
}

async function reverseInstall(ctx, commitment_ids, payload) {
  const { qty_to_reverse, reason } = payload;
  const commitmentId = commitment_ids?.[0];
  if (!commitmentId || qty_to_reverse === undefined) throw new Error('commitment_id and qty_to_reverse required');

  const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
  if (!commitment) throw new Error('Commitment not found');

  const [part] = await ctx.base44.entities.Part.filter({ id: commitment.part_id });
  if (!part) throw new Error('Part not found');

  const current_installed = commitment.qty_installed ?? 0;
  if (qty_to_reverse > current_installed) throw new Error(`Cannot reverse ${qty_to_reverse}, only ${current_installed} installed`);

  const supply_type = commitment.supply_source_type ?? 'VENDOR';
  const affects_stock = supply_type !== 'CLIENT_SUPPLIED';

  if (ctx.dry_run) return { preview: { commitment_id: commitmentId, qty_reversing: qty_to_reverse, affects_stock } };

  const new_installed = current_installed - qty_to_reverse;

  await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    qty_installed: new_installed, commitment_status: 'allocated',
    commitment_version: (commitment.commitment_version ?? 0) + 1
  });

  if (affects_stock) {
    const new_physical = (part.physical_stock ?? 0) + qty_to_reverse;
    await ctx.base44.asServiceRole.entities.Part.update(part.id, { physical_stock: new_physical });
    ctx.mutations.push({ entity: 'Part', id: part.id, action: 'REVERSE_INSTALL' });
    
    // INLINED rebalance
    await inlineRebalance(ctx, part.id, false);
  }

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'REVERSE_INSTALL' });

  return { commitment_id: commitmentId, qty_reversed: qty_to_reverse, new_installed };
}

async function cancelCommitment(ctx, commitment_ids, payload) {
  const { reason } = payload;
  const commitmentId = commitment_ids?.[0];
  if (!commitmentId) throw new Error('commitment_id required');

  const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
  if (!commitment) throw new Error('Commitment not found');
  if (commitment.commitment_status === 'cancelled') throw new Error('Already cancelled');

  let cancellation_type = 'before_order';
  if (commitment.billing_status === 'paid') cancellation_type = 'after_paid';
  else if (commitment.billing_status === 'invoiced') cancellation_type = 'after_invoice';
  else if ((commitment.covered_from_po ?? commitment.qty_ordered ?? 0) > 0) cancellation_type = 'before_invoice';

  if (ctx.dry_run) return { preview: { commitment_id: commitmentId, cancellation_type } };

  await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    commitment_status: 'cancelled', cancelled_at: ctx.timestamp,
    cancelled_by: ctx.user.email, cancelled_reason: reason, cancellation_type,
    commitment_version: (commitment.commitment_version ?? 0) + 1
  });

  const reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'CANCEL' });
  
  // INLINED rebalance
  const rebalanceResult = await inlineRebalance(ctx, commitment.part_id, false);

  ctx.lifecycle_events.push({
    commitment_id: commitmentId, event_type: 'COMMITMENT_CANCELLED',
    trigger_source: 'UNIFIED_ENGINE', triggered_by: ctx.user.email,
    actor_email: ctx.user.email, part_id: commitment.part_id,
    project_id: commitment.project_id,
    metadata: JSON.stringify({ reason, cancellation_type }),
    event_date: ctx.timestamp
  });

  return { commitment_id: commitmentId, cancellation_type, stock_released: reserved };
}

async function addStock(ctx, payload) {
  const { part_id, qty, note, purchase_cost } = payload;
  let { location_id } = payload;

  if (!part_id) throw new Error('part_id is required for ADD_STOCK');
  const quantity = Number(qty) || 0;
  if (quantity <= 0) throw new Error('qty must be a positive number');

  const [part] = await ctx.base44.entities.Part.filter({ id: part_id });
  if (!part) throw new Error('Part not found');

  if (!location_id) location_id = await getOrCreateDefaultLocation(ctx);

  const old_physical = part.physical_stock ?? 0;

  if (ctx.dry_run) {
    return { preview: { part_id, part_name: part.part_name, qty_adding: quantity, old_physical_stock: old_physical } };
  }

  await upsertInventoryItem(ctx, part_id, location_id, quantity);

  // INLINED recompute
  const recomputeResult = await inlineRecomputePhysicalStock(ctx, part_id, false);
  const new_physical = recomputeResult.computed_physical_stock;
  ctx.mutations.push({ entity: 'Part', id: part_id, action: 'PHYSICAL_STOCK_RECOMPUTED' });

  // INLINED rebalance
  await inlineRebalance(ctx, part_id, false);

  await ctx.base44.asServiceRole.entities.InventoryAuditLog.create({
    part_id, action_type: 'ADD_STOCK', qty_delta: quantity,
    old_qty: old_physical, new_qty: new_physical, location_id,
    notes: note || null, performed_by: ctx.user.email, performed_at: ctx.timestamp
  });

  return {
    success: true, part_id, part_name: part.part_name,
    qty_added: quantity, old_physical_stock: old_physical, new_physical_stock: new_physical,
    location_id,
    invalidation_context: { part_ids: [part_id], invalidateAll: true }
  };
}