import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * executeSupplyAction - Unified Supply Dispatcher
 * 
 * This is the ONLY entry point for supply mutations.
 * No component may write to commitment/inventory entities directly.
 * 
 * ============================================================================
 * SUPPORTED ACTIONS & EVENT CONTRACTS
 * ============================================================================
 * 
 * COMMITMENT-SCOPED ACTIONS (emit LifecycleEvent with commitment_id):
 * - ADJUST_REQUIRED: Change required_total, auto-reserve from available stock
 * - AUTO_RESERVE: Reserve from available physical stock
 * - CREATE_PO: Create purchase order for gap quantity
 * - RECEIVE: Receive inventory from PO, update physical_stock (commitment-linked)
 * - INSTALL: Consume reserved/received inventory
 * - REVERSE_INSTALL: Undo installation
 * - ALLOCATE_POOL: Allocate billing pool to commitment
 * - CANCEL_COMMITMENT: Cancel a commitment
 * 
 * PART-SCOPED ACTIONS (emit InventoryAuditLog, NOT LifecycleEvent):
 * - RECEIVE_STOCK / ADD_STOCK: Add inventory without PO (found stock, gifts, transfers)
 *   Input: { part_id, qty, location_id?, note?, purchase_cost? }
 *   Outputs: Updates Part.physical_stock, creates InventoryAuditLog
 * 
 * ============================================================================
 * EVENT CONTRACT ENFORCEMENT
 * ============================================================================
 * - LifecycleEvent REQUIRES commitment_id (schema enforced)
 * - Part-scoped actions MUST NOT create LifecycleEvent
 * - Instead, part-scoped actions create InventoryAuditLog entries
 * 
 * All actions:
 * 1. Validate invariants before mutation
 * 2. Execute atomic updates
 * 3. Emit appropriate events (LifecycleEvent or InventoryAuditLog)
 * 4. Return updated state + invalidation_context for UI cache busting
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
      inventory_audit_logs: [], // For part-scoped actions
      mutations: []
    };

    let result;
    
    // Define which actions are commitment-scoped vs part-scoped
    const COMMITMENT_SCOPED_ACTIONS = [
      'ADJUST_REQUIRED', 'AUTO_RESERVE', 'CREATE_PO', 'RECEIVE', 
      'INSTALL', 'REVERSE_INSTALL', 'ALLOCATE_POOL', 'CANCEL_COMMITMENT'
    ];
    const PART_SCOPED_ACTIONS = ['ADD_STOCK', 'RECEIVE_STOCK'];
    
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
      case 'RECEIVE_STOCK': // Alias for ADD_STOCK
        result = await addStock(context, payload);
        break;
      case 'INSTALL':
        result = await install(context, commitment_ids, payload);
        break;
      case 'REVERSE_INSTALL':
        result = await reverseInstall(context, commitment_ids, payload);
        break;
      case 'ALLOCATE_POOL':
        // PHASE 9E: Pool-based billing PERMANENTLY REMOVED
        // Forward model uses InvoiceBatch exclusively
        throw new Error('ALLOCATE_POOL action has been removed. Use InvoiceBatch for billing.');
      case 'CANCEL_COMMITMENT':
        result = await cancelCommitment(context, commitment_ids, payload);
        break;
      default:
        return Response.json({ error: `Unknown action_type: ${action_type}` }, { status: 400 });
    }

    // Write lifecycle events if not dry run
    // ENFORCEMENT: LifecycleEvent REQUIRES commitment_id per schema
    // Part-scoped actions should use InventoryAuditLog instead
    if (!dry_run && context.lifecycle_events.length > 0) {
      for (const event of context.lifecycle_events) {
        // Runtime assertion: commitment-scoped events MUST have commitment_id
        if (event.commitment_id) {
          await base44.asServiceRole.entities.LifecycleEvent.create(event);
        } else {
          // Log warning but don't fail - event was incorrectly constructed
          console.warn(`Skipping LifecycleEvent without commitment_id: ${event.event_type}`);
        }
      }
    }
    
    // Write inventory audit logs if not dry run
    if (!dry_run && context.inventory_audit_logs && context.inventory_audit_logs.length > 0) {
      for (const log of context.inventory_audit_logs) {
        await base44.asServiceRole.entities.InventoryAuditLog.create(log);
      }
    }

    // PHASE 9I: Include toast notification for auto-reservation
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
    part_id,
    reopen_if_closed = false // PHASE 3: Support reopening closed/cancelled commitments
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
  let wasReopened = false;

  // If commitment_id provided, fetch it (including closed/cancelled if reopen_if_closed)
  if (commitmentId) {
    const commitments = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
    commitment = commitments[0];
    if (!commitment) throw new Error('Commitment not found');

    // PHASE 3: Reopen closed/cancelled commitments if requested
    if (reopen_if_closed && ['closed', 'cancelled'].includes(commitment.commitment_status)) {
      wasReopened = true;
      // Will be updated below after part fetch
    }
  }

  // If no commitment_id, try to find or create by project_id + part_id
  if (!commitmentId) {
    if (!project_id || !part_id) {
      throw new Error('Either commitment_id OR (project_id + part_id) required');
    }

    // Check if commitment already exists (exclude archived, include closed/cancelled if reopen enabled)
    const existingCommitments = await ctx.base44.entities.PartCommitment.filter({
      project_id,
      part_id,
      is_archived: { $ne: true }
    });

    // Prefer active commitments, then closed/cancelled if reopen_if_closed
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
      // Need to create - fetch part for pricing
      const parts = await ctx.base44.entities.Part.filter({ id: part_id });
      part = parts[0];
      if (!part) throw new Error('Part not found');

      // Determine initial required_total
      const initialRequired = effectiveRequiredSet ?? Math.max(1, required_total_delta ?? 1);
      
      if (ctx.dry_run) {
        isNewCommitment = true;
      } else {
        // PHASE 15V: HARD LOCK pricing snapshot at commitment creation
        const unit_cost = part.cost || 0;
        
        // retail_effective MUST follow pricing_mode - CANONICAL SELECTOR
        let retail_effective = 0;
        const pricing_mode = part.pricing_mode || 'matrix';
        
        if (pricing_mode === 'manual') {
          if (!part.retail_override || part.retail_override <= 0) {
            throw new Error(`PRICING_MODE_INVALID: Part ${part.part_name} has manual mode but no retail_override`);
          }
          retail_effective = part.retail_override;
        } else {
          // Matrix mode - retail_matrix_price must be whole dollar
          retail_effective = Math.round(part.retail_matrix_price || 0);
        }
        
        // Determine pricing integrity
        let pricing_integrity_status = 'ok';
        if (unit_cost <= 0) pricing_integrity_status = 'missing_cost';
        else if (retail_effective <= 0) pricing_integrity_status = 'missing_retail';
        else if (retail_effective < unit_cost) pricing_integrity_status = 'margin_negative';
        
        // PHASE 10: Create commitment with CANONICAL billing_status
        // billing_status MUST be 'unbilled' - supply flows never set invoiced/paid
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
          // CANONICAL: All new commitments start unbilled
          // Billing status is financial-only; supply lifecycle must not change it
          billing_status: 'unbilled',
          requires_prepay: payload.requires_prepay || false, // FIX C: Support prepay flag
          unit_cost_snapshot: unit_cost,
          unit_retail_snapshot: retail_effective,
          planned_cost_total: unit_cost * initialRequired,
          planned_retail_total: retail_effective * initialRequired,
          pricing_integrity_status, // Track pricing health
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

  // Fetch commitment if not yet loaded (handles case where commitment_id was passed directly)
  if (!commitment && commitmentId) {
    const commitments = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
    commitment = commitments[0];
    if (!commitment) throw new Error('Commitment not found');

    // PHASE 3: Check for reopen if commitment was passed directly
    if (reopen_if_closed && ['closed', 'cancelled'].includes(commitment.commitment_status)) {
      wasReopened = true;
    }
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
  
  // =========== DELTA COMMITMENT MODEL ENFORCEMENT ===========
  // PHASE: Scope Add Architecture
  // If delta is POSITIVE on an existing commitment, create a scope addition instead
  const delta = new_required - current_required;
  
  if (!isNewCommitment && delta > 0 && commitmentId) {
    // Check if commitment has lifecycle progress that would make upward mutation dangerous
    const has_lifecycle_progress = 
      (commitment?.invoiced_qty || 0) > 0 ||
      (commitment?.qty_installed || 0) > 0 ||
      (commitment?.covered_from_po || 0) > 0;
    
    if (has_lifecycle_progress) {
      // HARD RULE: Create scope addition instead of mutating
      console.log(`[DELTA_MODEL] Commitment ${commitmentId} has lifecycle progress, creating scope addition for +${delta}`);
      
      if (ctx.dry_run) {
        return {
          preview: {
            action: 'WILL_CREATE_SCOPE_ADDITION',
            commitment_id: commitmentId,
            delta,
            reason: 'Commitment has lifecycle progress (invoiced/installed/on PO)',
            parent_commitment_id: commitmentId
          }
        };
      }
      
      // Create scope addition commitment
      const scopeAddResult = await ctx.base44.asServiceRole.functions.invoke('createScopeAddCommitment', {
        project_id: commitment.project_id,
        part_id: part.id,
        deltaQty: delta,
        parent_commitment_id: commitmentId
      });
      
      if (scopeAddResult.data?.error) {
        throw new Error(scopeAddResult.data.error);
      }
      
      ctx.mutations.push({ entity: 'PartCommitment', id: scopeAddResult.data.commitment_id, action: 'SCOPE_ADDITION_CREATE' });
      ctx.lifecycle_events.push({
        commitment_id: commitmentId,
        event_type: 'SCOPE_ADDITION_CREATED',
        trigger_source: 'UNIFIED_ENGINE',
        triggered_by: ctx.user.email,
        actor_email: ctx.user.email,
        old_values: JSON.stringify({ required_total: current_required }),
        new_values: JSON.stringify({ 
          new_commitment_id: scopeAddResult.data.commitment_id,
          delta_qty: delta,
          model: 'DELTA_COMMITMENT'
        }),
        part_id: part.id,
        project_id: commitment.project_id,
        event_date: ctx.timestamp
      });
      
      return {
        success: true,
        action: 'SCOPE_ADDITION_CREATED',
        parent_commitment_id: commitmentId,
        parent_required_total: current_required,
        new_commitment_id: scopeAddResult.data.commitment_id,
        new_commitment: scopeAddResult.data.commitment,
        delta_qty: delta,
        pricing: scopeAddResult.data.pricing,
        message: `Created scope addition commitment for +${delta} units. Parent unchanged.`
      };
    }
  }

  // =========== PHASE 9G: DEFER TO CANONICAL REBALANCE ===========
  // Reservation math is handled by rebalancePartReservations after commit
  // Here we just prepare the data - rebalance will be called at the end
  
  const covered_from_po = commitment?.covered_from_po ?? 0;
  
  // Temporary values - will be recomputed by rebalance
  const new_reserved = 0; // Placeholder
  const to_order = Math.max(0, new_required - covered_from_po); // Placeholder

  // =========== DRY RUN PREVIEW ===========
  if (ctx.dry_run) {
    // Get preview from rebalance
    const rebalancePreview = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
      part_id: part.id,
      dry_run: true
    });
    
    const physical_stock = part.physical_stock ?? 0;
    
    const preview = {
      commitment_id: commitmentId ?? 'NEW',
      is_new_commitment: isNewCommitment || !commitmentId,
      project_id: commitment?.project_id || project_id,
      part_id: part.id,
      part_name: part.part_name,
      old_required: current_required,
      new_required,
      delta: new_required - current_required,
      covered_from_po,
      source_type,
      rebalance_preview: rebalancePreview.data,
      inventory_snapshot: {
        physical_stock,
        on_order_total: 0
      }
    };
    return { preview };
  }

  // =========== PERSIST CHANGES ===========
  // PHASE 15V: retail_effective MUST follow pricing_mode - CANONICAL SELECTOR
  const pricing_mode = part.pricing_mode || 'matrix';
  let retail_effective;
  if (pricing_mode === 'manual') {
    retail_effective = part.retail_override || 0;
  } else {
    // Matrix mode - ensure whole dollar
    retail_effective = Math.round(part.retail_matrix_price || 0);
  }
  
  // Update commitment with required_total and covered_from_po
  // reserved_from_stock and to_order will be set by rebalance
  const updateData = {
    required_total: new_required,
    covered_from_po,
    supply_source_type: mapSourceType(source_type),
    // Legacy fields
    qty_committed: new_required,
    // Pricing recompute
    planned_cost_total: (commitment?.unit_cost_snapshot ?? part.cost ?? 0) * new_required,
    planned_retail_total: (commitment?.unit_retail_snapshot ?? retail_effective) * new_required,
    // State versioning
    commitment_version: (commitment?.commitment_version ?? 0) + 1,
    state_version: (commitment?.state_version ?? 0) + 1,
    last_recomputed_at: ctx.timestamp
  };

  // PHASE 3: Reopen closed/cancelled commitments if requested
  if (wasReopened) {
    updateData.commitment_status = 'planned';
    updateData.coverage_status = 'NOT_COVERED';
    // Clear cancellation fields
    updateData.cancelled_at = null;
    updateData.cancelled_reason = null;
    updateData.cancelled_by = null;
    
    ctx.lifecycle_events.push({
      commitment_id: commitmentId,
      event_type: 'COMMITMENT_REOPENED',
      trigger_source: 'UNIFIED_ENGINE',
      triggered_by: ctx.user.email,
      actor_email: ctx.user.email,
      old_values: JSON.stringify({ commitment_status: commitment.commitment_status }),
      new_values: JSON.stringify({ commitment_status: 'planned' }),
      part_id: part.id,
      project_id: commitment?.project_id || project_id,
      event_date: ctx.timestamp
    });
  }

  // If not a new commitment, update it
  if (!isNewCommitment && commitmentId) {
    await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, updateData);
  }

  ctx.mutations.push({ entity: 'PartCommitment', id: commitmentId, action: 'ADJUST_REQUIRED' });
  
  // PHASE 9G: Call canonical rebalance for this part
  const rebalanceResult = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
    part_id: part.id,
    dry_run: ctx.dry_run
  });
  
  if (rebalanceResult.data?.error) {
    throw new Error(rebalanceResult.data.error);
  }
  
  // Get updated values from rebalance
  const updatedCommitment = rebalanceResult.data?.updates?.find(u => u.commitment_id === commitmentId);
  const final_reserved = updatedCommitment?.new_reserved ?? 0;
  const final_to_order = updatedCommitment?.new_to_order ?? 0;
  
  // Emit lifecycle event for actual changes
  if (!isNewCommitment && new_required !== current_required) {
    const event_type = new_required > current_required ? 'QTY_INCREASED' : 'QTY_DECREASED';
    ctx.lifecycle_events.push({
      commitment_id: commitmentId,
      event_type,
      actor_email: ctx.user.email,
      trigger_source: 'UNIFIED_ENGINE',
      triggered_by: ctx.user.email,
      old_values: JSON.stringify({ required_total: current_required }),
      new_values: JSON.stringify({ required_total: new_required, reserved_from_stock: final_reserved, to_order: final_to_order }),
      part_id: part.id,
      project_id: commitment?.project_id || project_id,
      qty_delta: new_required - current_required,
      event_date: ctx.timestamp
    });
  }

  // =========== RETURN VIEW MODEL ROW ===========
  const [project] = await ctx.base44.entities.Project.filter({ id: commitment?.project_id || project_id });
  const physical_stock = part.physical_stock ?? 0;
  
  // Compute coverage status from final values
  const coverage_total = final_reserved + covered_from_po;
  let coverage_status = 'NOT_COVERED';
  if (coverage_total >= new_required && new_required > 0) {
    coverage_status = 'FULLY_COVERED';
  } else if (coverage_total > 0) {
    coverage_status = 'PARTIALLY_COVERED';
  }
  
  return {
    success: true,
    commitment_id: commitmentId,
    is_new_commitment: isNewCommitment,
    // Canonical state (from rebalance)
    required_total: new_required,
    reserved_from_stock: final_reserved,
    covered_from_po,
    to_order: final_to_order,
    coverage_status,
    coverage_pct: new_required > 0 ? Math.round((coverage_total / new_required) * 100) : 100,
    // Context
    project_id: commitment?.project_id || project_id,
    project_name: project?.name,
    part_id: part.id,
    part_name: part.part_name,
    source_type,
    // Inventory snapshot
    inventory_snapshot: {
      physical_stock,
      on_order_total: 0
    },
    // Next action hint
    next_action: final_to_order > 0 ? 'CREATE_PO' : (final_reserved > (commitment?.qty_installed ?? 0) ? 'INSTALL' : 'COMPLETE'),
    // Rebalance details
    rebalance_result: rebalanceResult.data
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
 * 
 * PHASE 12R-HARDENING: Delegates to canonical rebalancePartReservations
 * to prevent drift between manual reservation logic and rebalance.
 */
async function autoReserve(ctx, commitment_ids, payload) {
  if (!commitment_ids || commitment_ids.length === 0) {
    return { results: [], message: 'No commitments provided' };
  }

  // Get unique part_ids from commitments
  const partIds = new Set();
  const commitmentDetails = [];
  
  for (const commitmentId of commitment_ids) {
    const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
    if (!commitment) continue;
    
    partIds.add(commitment.part_id);
    commitmentDetails.push({
      commitment_id: commitmentId,
      part_id: commitment.part_id,
      old_reserved: commitment.reserved_from_stock ?? 0
    });
  }

  // PHASE 12R: Delegate to canonical rebalance for each affected part
  const rebalanceResults = [];
  
  for (const part_id of partIds) {
    const rebalanceResult = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
      part_id,
      dry_run: ctx.dry_run
    });
    
    if (rebalanceResult.data?.error) {
      throw new Error(rebalanceResult.data.error);
    }
    
    rebalanceResults.push(rebalanceResult.data);
    
    if (!ctx.dry_run) {
      ctx.mutations.push({ entity: 'Part', id: part_id, action: 'AUTO_RESERVE_REBALANCE' });
    }
  }

  // Build results from rebalance output
  const results = commitmentDetails.map(cd => {
    // Find the rebalance result for this part
    const partRebalance = rebalanceResults.find(r => r.part_id === cd.part_id);
    const update = partRebalance?.updates?.find(u => u.commitment_id === cd.commitment_id);
    
    return {
      commitment_id: cd.commitment_id,
      part_id: cd.part_id,
      old_reserved: cd.old_reserved,
      new_reserved: update?.new_reserved ?? cd.old_reserved,
      delta_reserved: update?.delta_reserved ?? 0,
      rebalanced: !!update
    };
  });

  // Emit lifecycle events for commitments that changed
  if (!ctx.dry_run) {
    for (const r of results) {
      if (r.delta_reserved > 0) {
        ctx.lifecycle_events.push({
          commitment_id: r.commitment_id,
          event_type: 'AUTO_RESERVE',
          actor_email: ctx.user.email,
          trigger_source: 'UNIFIED_ENGINE',
          triggered_by: ctx.user.email,
          metadata: JSON.stringify({ 
            reserved: r.delta_reserved, 
            new_total: r.new_reserved,
            via_rebalance: true 
          }),
          event_date: ctx.timestamp
        });
      }
    }
  }

  return { 
    results,
    rebalance_summary: {
      parts_rebalanced: partIds.size,
      commitments_updated: results.filter(r => r.delta_reserved !== 0).length
    }
  };
}

/**
 * CREATE_PO - Create purchase order for gap quantity
 * Phase 6.2A: Each vendor PO has its own freight_cost and tariff_cost
 * Phase 10B: HARD GUARDS for commitment and vendor
 */
async function createPO(ctx, commitment_ids, payload) {
  const { vendor_id, po_prefix = 'AK', vendor_order_data = {} } = payload;
  
  // PHASE 10B: HARD GUARD - commitment_ids required
  if (!commitment_ids || commitment_ids.length === 0) {
    throw new Error('PO_COMMITMENT_REQUIRED: commitment_ids array is required for CREATE_PO');
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

    // PHASE 10B: HARD GUARD - vendor_id is REQUIRED
    const effectiveVendor = vendor_id || part.default_vendor_id;
    if (!effectiveVendor) {
      // PHASE 10B: This is now a HARD ERROR, not just a blocked item
      throw new Error(`PO_VENDOR_REQUIRED: Commitment ${commitment.id} (${part.part_name}) has no vendor_id`);
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

    // Phase 6.2A: Get per-vendor order data (freight/tariff are vendor-specific)
    const vendorData = vendor_order_data[vendorId] || {};

    // Create order - each PO has its own freight_cost and tariff_cost
    const order = await ctx.base44.asServiceRole.entities.Order.create({
      po_number,
      po_prefix: vendorData.po_prefix || po_prefix,
      vendor_id: vendorId,
      order_number: vendorData.order_number || null,
      order_url: vendorData.order_url || null,
      order_date: vendorData.order_date || new Date().toISOString().slice(0, 10),
      eta_date: vendorData.eta_date || null,
      notes: vendorData.notes || null,
      // Phase 6.2A: Freight/tariff are vendor-specific, NOT duplicated across split POs
      freight_cost: vendorData.freight_cost || 0,
      tariff_cost: vendorData.tariff_cost || 0,
      status: 'Draft'
    });

    // Create line items and update commitments
    for (const item of items) {
      // PHASE DATA INTEGRITY: HARD GUARD - qty_ordered MUST be positive
      const requestedQty = Number(item.qty);
      if (!requestedQty || requestedQty <= 0 || !Number.isFinite(requestedQty)) {
        throw new Error(`CREATE_PO_INVALID_QTY_ORDERED: qty_ordered must be positive, got ${item.qty} for ${item.part.part_name}`);
      }
      
      const lineItem = await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.create({
        order_id: order.id,
        part_id: item.part.id,
        commitment_id: item.commitment.id,
        vendor_id: vendorId,
        // CANONICAL: qty_ordered is IMMUTABLE after creation - locked at PO creation time
        // PHASE 1: SNAPSHOT - this value NEVER changes after creation
        qty_ordered: requestedQty,
        qty_received: 0,
        // Pricing snapshots - locked at creation
        unit_cost: item.unit_cost,
        unit_retail: item.commitment.unit_retail_snapshot ?? 0,
        extended_cost: item.unit_cost * requestedQty,
        status: 'Ordered'
      });
      
      // AUDIT LOG: Record the exact qty_ordered written
      console.log(`[CREATE_PO] Line created: id=${lineItem.id}, part=${item.part.part_name}, qty_ordered=${requestedQty}, unit_cost=${item.unit_cost}`);

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

    // Extract project_ids from commitments for cache invalidation
    const projectIds = [...new Set(items.map(i => i.commitment.project_id).filter(Boolean))];
    
    created_orders.push({
      order_id: order.id,
      po_number,
      vendor_id: vendorId,
      line_count: items.length,
      project_ids: projectIds, // PHASE 1: Include for forceAppRefresh context extraction
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

  console.log(`[BATCH_RECEIVE_START] order_id=${order_id}, lines_count=${lines.length}`);
  console.log(`[BATCH_RECEIVE_PAYLOAD] ${JSON.stringify(lines.map(l => ({ id: l.line_item_id, receive_qty: l.receive_qty, qty_received: l.qty_received, location_id: l.location_id })))}`);

  const results = [];
  const errors = [];
  const skipped = [];
  let total_received = 0;
  const affectedPartIds = new Set();

  for (const line of lines) {
    // Accept receive_qty (canonical) or qty_received (legacy fallback)
    const qty = line.receive_qty ?? line.qty_received ?? 0;
    if (!line.line_item_id || qty <= 0) {
      const reason = !line.line_item_id ? 'MISSING_LINE_ITEM_ID' : `QTY_ZERO_OR_NEGATIVE (receive_qty=${line.receive_qty}, qty_received=${line.qty_received}, resolved=${qty})`;
      console.warn(`[BATCH_RECEIVE_SKIPPED] line_item_id=${line.line_item_id || 'null'}, reason=${reason}`);
      skipped.push({ line_item_id: line.line_item_id || null, reason });
      continue;
    }

    try {
      console.log(`[BATCH_RECEIVE_LINE] Processing line_item_id=${line.line_item_id}, qty=${qty}, location=${line.location_id || 'default'}`);
      const result = await receiveSingleLineForBatch(ctx, line.line_item_id, qty, line.location_id);
      console.log(`[BATCH_RECEIVE_SUCCESS] line_item_id=${line.line_item_id}, qty=${qty}, new_status=${result.line_status}`);
      results.push(result);
      total_received += qty;
      if (result.part_id) affectedPartIds.add(result.part_id);
    } catch (lineError) {
      console.error(`[BATCH_RECEIVE_ERROR] line_item_id=${line.line_item_id} failed: ${lineError.message}`);
      errors.push({ line_item_id: line.line_item_id, error: lineError.message });
    }
  }

  // BATCH OPTIMIZATION: Recompute + rebalance ONCE per affected part (not per line)
  // This avoids N×2 nested function invocations that risk timeout on large batches
  for (const partId of affectedPartIds) {
    try {
      console.log(`[BATCH_RECEIVE_RECOMPUTE] part_id=${partId}`);
      const recomputeResult = await ctx.base44.asServiceRole.functions.invoke('recomputePartPhysicalStock', {
        part_id: partId, dry_run: false
      });
      if (recomputeResult.data?.error) {
        console.error(`[BATCH_RECEIVE_RECOMPUTE_ERROR] part_id=${partId}: ${recomputeResult.data.error}`);
      }
      const rebalanceResult = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
        part_id: partId, dry_run: false
      });
      if (rebalanceResult.data?.error) {
        console.error(`[BATCH_RECEIVE_REBALANCE_ERROR] part_id=${partId}: ${rebalanceResult.data.error}`);
      }
      ctx.mutations.push({ entity: 'Part', id: partId, action: 'BATCH_RECOMPUTE_REBALANCE' });
    } catch (postErr) {
      console.error(`[BATCH_RECEIVE_POST_PROCESS_ERROR] part_id=${partId}: ${postErr.message}`);
    }
  }

  console.log(`[BATCH_RECEIVE_COMPLETE] processed=${results.length}, skipped=${skipped.length}, errors=${errors.length}, total_qty=${total_received}, parts_rebalanced=${affectedPartIds.size}`);

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
    lines_submitted: lines.length,
    lines_received: results.length,
    lines_skipped: skipped.length,
    lines_errored: errors.length,
    total_qty_received: total_received,
    results,
    skipped: skipped.length > 0 ? skipped : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Receive a single line item FOR BATCH mode (lightweight).
 * Skips recomputePartPhysicalStock + rebalancePartReservations 
 * (caller does those once per part after the loop).
 */
async function receiveSingleLineForBatch(ctx, line_item_id, qty_received, location_id) {
  const [lineItem] = await ctx.base44.entities.PartPurchaseLineItem.filter({ id: line_item_id });
  if (!lineItem) throw new Error(`Line item ${line_item_id} not found`);

  const [part] = await ctx.base44.entities.Part.filter({ id: lineItem.part_id });
  if (!part) throw new Error('Part not found');

  const ordered = lineItem.qty_ordered ?? 0;
  const already_received = lineItem.qty_received ?? 0;
  const remaining = Math.max(0, ordered - already_received);

  if (qty_received > remaining) {
    throw new Error(
      `RECEIVE_OVERFLOW: Cannot receive ${qty_received} of ${part.part_name}. ` +
      `Only ${remaining} remaining (ordered=${ordered}, already_received=${already_received})`
    );
  }
  if (qty_received <= 0) {
    throw new Error(`RECEIVE_INVALID_QTY: qty_received must be positive, got ${qty_received}`);
  }

  // Location enforcement
  let effective_location_id = location_id;
  if (!effective_location_id) {
    const systemLocations = await ctx.base44.asServiceRole.entities.Location.filter({
      location_area: 'UNASSIGNED_SYSTEM'
    });
    if (systemLocations.length === 0) {
      const newLoc = await ctx.base44.asServiceRole.entities.Location.create({
        location_area: 'UNASSIGNED_SYSTEM',
        description: 'System default location for inventory without explicit assignment',
        active: true
      });
      effective_location_id = newLoc.id;
    } else {
      effective_location_id = systemLocations[0].id;
    }
  }

  if (ctx.dry_run) {
    return {
      preview: { line_item_id, part_name: part.part_name, qty_receiving: qty_received,
        remaining_after: remaining - qty_received, location_id: effective_location_id }
    };
  }

  // Update line item
  const new_line_received = already_received + qty_received;
  const line_status = new_line_received >= ordered ? 'Received' : 'Partial';
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id, {
    qty_received: new_line_received, status: line_status
  });
  console.log(`[RECEIVE] Line updated: id=${line_item_id}, new_received=${new_line_received}, status=${line_status}`);

  // Upsert InventoryItem
  const existingItems = await ctx.base44.asServiceRole.entities.InventoryItem.filter({
    part_id: part.id, location_id: effective_location_id
  });
  if (existingItems.length > 1) {
    throw new Error(`INVENTORY_LOCATION_DUPLICATE_ERROR: Found ${existingItems.length} records. Call consolidateInventoryLocations() to fix.`);
  } else if (existingItems.length === 1) {
    const existing = existingItems[0];
    await ctx.base44.asServiceRole.entities.InventoryItem.update(existing.id, {
      quantity_on_hand: (existing.quantity_on_hand ?? 0) + qty_received
    });
    ctx.mutations.push({ entity: 'InventoryItem', id: existing.id, action: 'RECEIVE_UPDATE' });
  } else {
    const invItem = await ctx.base44.asServiceRole.entities.InventoryItem.create({
      part_id: part.id, location_id: effective_location_id, quantity_on_hand: qty_received,
      quantity_reserved: 0, received_date: new Date().toISOString().split('T')[0],
      notes: `Received from PO line ${line_item_id}`
    });
    ctx.mutations.push({ entity: 'InventoryItem', id: invItem.id, action: 'RECEIVE_CREATE' });
  }

  // Update commitment if linked
  if (lineItem.commitment_id) {
    const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: lineItem.commitment_id });
    if (commitment) {
      const current_covered = commitment.covered_from_po ?? 0;
      const new_covered = Math.max(0, current_covered - qty_received);
      await ctx.base44.asServiceRole.entities.PartCommitment.update(lineItem.commitment_id, {
        covered_from_po: new_covered,
        qty_received: (commitment.qty_received ?? 0) + qty_received,
        commitment_status: 'received',
        commitment_version: (commitment.commitment_version ?? 0) + 1
      });
      ctx.mutations.push({ entity: 'PartCommitment', id: lineItem.commitment_id, action: 'RECEIVE' });
    }
  }

  // NOTE: recomputePartPhysicalStock + rebalancePartReservations are DEFERRED to batch caller

  // Create inventory receipt
  await ctx.base44.asServiceRole.entities.InventoryReceipt.create({
    part_id: part.id, order_id: lineItem.order_id, line_item_id,
    qty_received, location_id: effective_location_id,
    received_by: ctx.user.email, received_date: ctx.timestamp
  });

  ctx.mutations.push({ entity: 'PartPurchaseLineItem', id: line_item_id, action: 'RECEIVE' });
  ctx.lifecycle_events.push({
    entity_type: 'Part', entity_id: part.id, event_type: 'INVENTORY_RECEIVED',
    actor_email: ctx.user.email,
    details: JSON.stringify({ qty: qty_received, from_po: lineItem.order_id, location_id: effective_location_id }),
    created_date: ctx.timestamp
  });

  return {
    line_item_id, part_id: part.id, part_name: part.part_name,
    qty_received, line_status
  };
}

/**
 * Receive a single line item (FULL version — used by non-batch callers)
 * 
 * PHASE 14: RECEIVE LOGIC - InventoryItem authoritative
 * 1. Upsert InventoryItem by (part_id, location_id)
 * 2. Recompute Part.physical_stock from InventoryItem sum
 * 3. Update commitment.covered_from_po (received moves to physical)
 * 4. Call rebalancePartReservations
 */
async function receiveSingleLine(ctx, line_item_id, qty_received, location_id) {
  // Fetch line item
  const [lineItem] = await ctx.base44.entities.PartPurchaseLineItem.filter({ id: line_item_id });
  if (!lineItem) throw new Error(`Line item ${line_item_id} not found`);

  const [part] = await ctx.base44.entities.Part.filter({ id: lineItem.part_id });
  if (!part) throw new Error('Part not found');

  // CANONICAL: qty_ordered is IMMUTABLE - read only, never update
  const ordered = lineItem.qty_ordered ?? 0;
  const already_received = lineItem.qty_received ?? 0;
  
  // CANONICAL: qty_remaining is always derived, never stored
  const remaining = Math.max(0, ordered - already_received);

  // DATA INTEGRITY GUARD: Cannot receive more than remaining
  if (qty_received > remaining) {
    throw new Error(
      `RECEIVE_OVERFLOW: Cannot receive ${qty_received} of ${part.part_name}. ` +
      `Only ${remaining} remaining (ordered=${ordered}, already_received=${already_received})`
    );
  }
  
  // DATA INTEGRITY GUARD: Cannot receive negative or zero
  if (qty_received <= 0) {
    throw new Error(`RECEIVE_INVALID_QTY: qty_received must be positive, got ${qty_received}`);
  }

  // PHASE 14: Location enforcement - default to UNASSIGNED_SYSTEM
  let effective_location_id = location_id;
  if (!effective_location_id) {
    const systemLocations = await ctx.base44.asServiceRole.entities.Location.filter({
      location_area: 'UNASSIGNED_SYSTEM'
    });
    
    if (systemLocations.length === 0) {
      const newLoc = await ctx.base44.asServiceRole.entities.Location.create({
        location_area: 'UNASSIGNED_SYSTEM',
        description: 'System default location for inventory without explicit assignment',
        active: true
      });
      effective_location_id = newLoc.id;
    } else {
      effective_location_id = systemLocations[0].id;
    }
  }

  const old_physical = part.physical_stock ?? 0;

  if (ctx.dry_run) {
    return {
      preview: {
        line_item_id,
        part_name: part.part_name,
        qty_receiving: qty_received,
        remaining_after: remaining - qty_received,
        estimated_new_physical_stock: old_physical + qty_received,
        location_id: effective_location_id
      }
    };
  }

  // Update line item - ONLY qty_received changes, qty_ordered is IMMUTABLE
  const new_line_received = already_received + qty_received;
  const line_status = new_line_received >= ordered ? 'Received' : 'Partial';
  
  // CANONICAL: Only update qty_received and status - NEVER touch qty_ordered
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id, {
    qty_received: new_line_received,
    status: line_status
    // NOTE: qty_ordered is NEVER updated here - it's immutable after creation
  });
  
  console.log(`[RECEIVE] Line updated: id=${line_item_id}, new_received=${new_line_received}, status=${line_status}`);

  // PHASE 14: Upsert InventoryItem (authoritative source)
  const existingItems = await ctx.base44.asServiceRole.entities.InventoryItem.filter({
    part_id: part.id,
    location_id: effective_location_id
  });
  
  if (existingItems.length > 1) {
    throw new Error(
      `INVENTORY_LOCATION_DUPLICATE_ERROR: Found ${existingItems.length} records. ` +
      `Call consolidateInventoryLocations() to fix.`
    );
  } else if (existingItems.length === 1) {
    const existing = existingItems[0];
    await ctx.base44.asServiceRole.entities.InventoryItem.update(existing.id, {
      quantity_on_hand: (existing.quantity_on_hand ?? 0) + qty_received
    });
    ctx.mutations.push({ entity: 'InventoryItem', id: existing.id, action: 'RECEIVE_UPDATE' });
  } else {
    const invItem = await ctx.base44.asServiceRole.entities.InventoryItem.create({
      part_id: part.id,
      location_id: effective_location_id,
      quantity_on_hand: qty_received,
      quantity_reserved: 0,
      received_date: new Date().toISOString().split('T')[0],
      notes: `Received from PO line ${line_item_id}`
    });
    ctx.mutations.push({ entity: 'InventoryItem', id: invItem.id, action: 'RECEIVE_CREATE' });
  }

  // PHASE 14: Recompute Part.physical_stock from InventoryItem sum
  const recomputeResult = await ctx.base44.asServiceRole.functions.invoke('recomputePartPhysicalStock', {
    part_id: part.id,
    dry_run: false
  });
  
  if (recomputeResult.data?.error) {
    throw new Error(recomputeResult.data.error);
  }
  
  const new_physical = recomputeResult.data?.computed_physical_stock ?? (old_physical + qty_received);

  // Update commitment if linked - only update covered_from_po
  if (lineItem.commitment_id) {
    const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: lineItem.commitment_id });
    if (commitment) {
      // Receiving decreases covered_from_po (goods moved from PO to physical stock)
      const current_covered = commitment.covered_from_po ?? 0;
      const new_covered = Math.max(0, current_covered - qty_received);
      
      await ctx.base44.asServiceRole.entities.PartCommitment.update(lineItem.commitment_id, {
        covered_from_po: new_covered,
        qty_received: (commitment.qty_received ?? 0) + qty_received,
        commitment_status: 'received',
        commitment_version: (commitment.commitment_version ?? 0) + 1
      });

      ctx.mutations.push({ entity: 'PartCommitment', id: lineItem.commitment_id, action: 'RECEIVE' });
    }
  }

  // PHASE 14: Call canonical rebalance for this part
  const rebalanceResult = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
    part_id: part.id,
    dry_run: false
  });
  
  if (rebalanceResult.data?.error) {
    throw new Error(rebalanceResult.data.error);
  }

  // Create inventory receipt
  await ctx.base44.asServiceRole.entities.InventoryReceipt.create({
    part_id: part.id,
    order_id: lineItem.order_id,
    line_item_id,
    qty_received,
    location_id: effective_location_id,
    received_by: ctx.user.email,
    received_date: ctx.timestamp
  });

  ctx.mutations.push({ entity: 'PartPurchaseLineItem', id: line_item_id, action: 'RECEIVE' });
  ctx.mutations.push({ entity: 'Part', id: part.id, action: 'PHYSICAL_STOCK_RECOMPUTED' });
  
  ctx.lifecycle_events.push({
    entity_type: 'Part',
    entity_id: part.id,
    event_type: 'INVENTORY_RECEIVED',
    actor_email: ctx.user.email,
    details: JSON.stringify({ qty: qty_received, from_po: lineItem.order_id, location_id: effective_location_id }),
    created_date: ctx.timestamp
  });

  return {
    line_item_id,
    part_id: part.id,
    part_name: part.part_name,
    qty_received,
    new_physical_stock: new_physical,
    line_status,
    recompute_result: recomputeResult.data,
    rebalance_result: rebalanceResult.data
  };
}

/**
 * INSTALL - PHASE 14 CANONICAL
 * 
 * Consume reserved inventory via InventoryItem deduction.
 * 
 * CANONICAL RULE:
 * - installable = reserved_from_stock - qty_installed (NO InventoryItem dependency)
 * - Deduct from InventoryItem.quantity_on_hand
 * - Recompute Part.physical_stock from InventoryItem sum
 * - Update commitment: qty_installed++, reserved_from_stock--
 * - Call rebalancePartReservations
 * 
 * HARD GUARD: physical_stock cannot go negative
 */
async function install(ctx, commitment_ids, payload) {
  const { qty_to_install, location_id } = payload;
  const commitmentId = commitment_ids?.[0];
  
  if (!commitmentId || qty_to_install === undefined) {
    throw new Error('commitment_id and qty_to_install required');
  }

  const [commitment] = await ctx.base44.entities.PartCommitment.filter({ id: commitmentId });
  if (!commitment) throw new Error('Commitment not found');

  const [part] = await ctx.base44.entities.Part.filter({ id: commitment.part_id });
  if (!part) throw new Error('Part not found');

  // PHASE 14: Installable = reserved_from_stock - qty_installed (canonical, NO InventoryItem dependency)
  const reserved = commitment.reserved_from_stock ?? 0;
  const current_installed = commitment.qty_installed ?? 0;
  const required = commitment.required_total ?? 0;
  const installable = Math.max(0, reserved - current_installed);

  // For CLIENT_SUPPLIED, don't touch stock
  const supply_type = commitment.supply_source_type ?? 'VENDOR';
  const affects_stock = supply_type !== 'CLIENT_SUPPLIED';

  if (qty_to_install > installable && affects_stock) {
    throw new Error(`Cannot install ${qty_to_install}, only ${installable} installable (reserved=${reserved}, installed=${current_installed})`);
  }

  // PHASE 14: HARD GUARD - Check if install would make stock negative
  if (affects_stock) {
    const current_physical = part.physical_stock ?? 0;
    if (current_physical < qty_to_install) {
      throw new Error(
        `NEGATIVE_STOCK_ATTEMPT: Cannot install ${qty_to_install} of ${part.part_name}, ` +
        `only ${current_physical} in physical stock. Install blocked.`
      );
    }
  }

  if (ctx.dry_run) {
    return {
      preview: {
        commitment_id: commitmentId,
        qty_installing: qty_to_install,
        new_installed: current_installed + qty_to_install,
        installable,
        affects_stock
      }
    };
  }

  const new_installed = current_installed + qty_to_install;
  
  // PHASE 14: Decrement reserved_from_stock when installing
  const new_reserved = Math.max(0, reserved - qty_to_install);
  
  // Update commitment - qty_installed increases, reserved_from_stock decreases
  await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    qty_installed: new_installed,
    reserved_from_stock: new_reserved,
    qty_reserved: new_reserved, // Mirror legacy field
    commitment_status: new_installed >= required ? 'installed' : commitment.commitment_status,
    commitment_version: (commitment.commitment_version ?? 0) + 1
  });

  // PHASE 14: Deduct from InventoryItem (authoritative source)
  if (affects_stock) {
    // Find InventoryItem to deduct from
    let deduct_location_id = location_id;
    
    if (!deduct_location_id) {
      // Find first location with available stock
      const inventoryItems = await ctx.base44.asServiceRole.entities.InventoryItem.filter({ part_id: part.id });
      const itemWithStock = inventoryItems.find(i => (i.quantity_on_hand ?? 0) >= qty_to_install);
      if (itemWithStock) {
        deduct_location_id = itemWithStock.location_id;
      } else {
        // Deduct from multiple locations if needed
        let remaining_to_deduct = qty_to_install;
        for (const item of inventoryItems.filter(i => (i.quantity_on_hand ?? 0) > 0)) {
          const deduct_from_this = Math.min(item.quantity_on_hand ?? 0, remaining_to_deduct);
          if (deduct_from_this > 0) {
            await ctx.base44.asServiceRole.entities.InventoryItem.update(item.id, {
              quantity_on_hand: (item.quantity_on_hand ?? 0) - deduct_from_this
            });
            ctx.mutations.push({ entity: 'InventoryItem', id: item.id, action: 'INSTALL_DEDUCT' });
            remaining_to_deduct -= deduct_from_this;
          }
          if (remaining_to_deduct <= 0) break;
        }
        deduct_location_id = null; // Handled above
      }
    }
    
    // Single location deduction if we found one
    if (deduct_location_id) {
      const [invItem] = await ctx.base44.asServiceRole.entities.InventoryItem.filter({
        part_id: part.id,
        location_id: deduct_location_id
      });
      
      if (invItem) {
        const new_qty = Math.max(0, (invItem.quantity_on_hand ?? 0) - qty_to_install);
        await ctx.base44.asServiceRole.entities.InventoryItem.update(invItem.id, {
          quantity_on_hand: new_qty
        });
        ctx.mutations.push({ entity: 'InventoryItem', id: invItem.id, action: 'INSTALL_DEDUCT' });
      }
    }
    
    // PHASE 14: Recompute Part.physical_stock from InventoryItem sum
    const recomputeResult = await ctx.base44.asServiceRole.functions.invoke('recomputePartPhysicalStock', {
      part_id: part.id,
      dry_run: false
    });
    
    if (recomputeResult.data?.error) {
      throw new Error(recomputeResult.data.error);
    }
    
    ctx.mutations.push({ entity: 'Part', id: part.id, action: 'PHYSICAL_STOCK_RECOMPUTED' });
    
    // PHASE 14: Call canonical rebalance for this part
    const rebalanceResult = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
      part_id: part.id,
      dry_run: false
    });
    
    if (rebalanceResult.data?.error) {
      throw new Error(rebalanceResult.data.error);
    }
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
    total_installed: new_installed,
    new_reserved
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

  // Update commitment - qty_installed decreases
  await ctx.base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
    qty_installed: new_installed,
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
    
    // PHASE 9G: Call canonical rebalance for this part (released stock reallocates)
    const rebalanceResult = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
      part_id: part.id,
      dry_run: false
    });
    
    if (rebalanceResult.data?.error) {
      throw new Error(rebalanceResult.data.error);
    }
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

// PHASE 9E: allocatePool function REMOVED
// Pool-based billing has been permanently removed.
// Forward model uses InvoiceBatch for all billing operations.

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
  
  // PHASE 9G: Call canonical rebalance for this part (released stock may be allocated elsewhere)
  const rebalanceResult = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
    part_id: commitment.part_id,
    dry_run: false
  });
  
  if (rebalanceResult.data?.error) {
    throw new Error(rebalanceResult.data.error);
  }
  
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
    stock_released: reserved,
    rebalance_result: rebalanceResult.data
  };
}

// ============================================================================
// ADD_STOCK - Canonical stock addition (no commitment)
// ============================================================================

/**
 * ADD_STOCK - PHASE 14 CANONICAL
 * 
 * Add physical inventory without a PO or commitment.
 * 
 * CANONICAL RULE: InventoryItem is authoritative.
 * 1. Upsert InventoryItem by (part_id, location_id)
 * 2. Recompute Part.physical_stock from InventoryItem sum
 * 3. Call rebalancePartReservations
 * 
 * NO direct Part.physical_stock increment - derived only.
 * 
 * Inputs:
 * - part_id: ID of the part
 * - qty: Quantity to add (positive)
 * - location_id: Storage location (REQUIRED - defaults to UNASSIGNED_SYSTEM)
 * - note: Optional note describing why
 * - purchase_cost: Optional cost per unit
 * 
 * Returns: updated part snapshot + inventory state
 */
async function addStock(ctx, payload) {
  const { part_id, qty, note, purchase_cost } = payload;
  let { location_id } = payload;

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

  // PHASE 14: Location enforcement - default to UNASSIGNED_SYSTEM
  if (!location_id) {
    // Find or create UNASSIGNED_SYSTEM location
    const systemLocations = await ctx.base44.asServiceRole.entities.Location.filter({
      location_area: 'UNASSIGNED_SYSTEM'
    });
    
    if (systemLocations.length === 0) {
      // Create system location
      const newLoc = await ctx.base44.asServiceRole.entities.Location.create({
        location_area: 'UNASSIGNED_SYSTEM',
        description: 'System default location for inventory without explicit assignment',
        active: true
      });
      location_id = newLoc.id;
    } else {
      location_id = systemLocations[0].id;
    }
  }

  const old_physical = part.physical_stock ?? 0;

  if (ctx.dry_run) {
    return {
      preview: {
        part_id,
        part_name: part.part_name,
        qty_adding: quantity,
        old_physical_stock: old_physical,
        estimated_new_physical_stock: old_physical + quantity,
        location_id
      }
    };
  }

  // PHASE 14: Upsert InventoryItem (authoritative source)
  let inventoryItemId = null;
  const existingItems = await ctx.base44.asServiceRole.entities.InventoryItem.filter({
    part_id,
    location_id
  });
  
  if (existingItems.length > 1) {
    throw new Error(
      `INVENTORY_LOCATION_DUPLICATE_ERROR: Found ${existingItems.length} records for part ${part.part_name} at location ${location_id}. ` +
      `Call consolidateInventoryLocations() to fix.`
    );
  } else if (existingItems.length === 1) {
    // UPDATE existing record
    const existing = existingItems[0];
    const new_quantity = (existing.quantity_on_hand ?? 0) + quantity;
    
    await ctx.base44.asServiceRole.entities.InventoryItem.update(existing.id, {
      quantity_on_hand: new_quantity,
      notes: `${existing.notes || ''}\n[${new Date().toISOString()}] Added ${quantity} via ADD_STOCK`.trim()
    });
    
    inventoryItemId = existing.id;
    ctx.mutations.push({ entity: 'InventoryItem', id: existing.id, action: 'UPDATE' });
  } else {
    // CREATE new record
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

  // PHASE 14: Recompute Part.physical_stock from InventoryItem sum (authoritative)
  const recomputeResult = await ctx.base44.asServiceRole.functions.invoke('recomputePartPhysicalStock', {
    part_id,
    dry_run: false
  });
  
  if (recomputeResult.data?.error) {
    throw new Error(recomputeResult.data.error);
  }
  
  const new_physical = recomputeResult.data?.computed_physical_stock ?? (old_physical + quantity);
  ctx.mutations.push({ entity: 'Part', id: part_id, action: 'PHYSICAL_STOCK_RECOMPUTED' });

  // PHASE 14: Call canonical rebalance for this part
  const rebalanceResult = await ctx.base44.asServiceRole.functions.invoke('rebalancePartReservations', {
    part_id,
    dry_run: false
  });
  
  if (rebalanceResult.data?.error) {
    throw new Error(rebalanceResult.data.error);
  }

  // Create audit log entry
  await ctx.base44.asServiceRole.entities.InventoryAuditLog.create({
    part_id,
    action_type: 'ADD_STOCK',
    qty_delta: quantity,
    old_qty: old_physical,
    new_qty: new_physical,
    location_id,
    notes: note || null,
    performed_by: ctx.user.email,
    performed_at: ctx.timestamp
  });

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
    recompute_result: recomputeResult.data,
    invalidation_context: {
      part_ids: [part_id],
      invalidateAll: true
    }
  };
}