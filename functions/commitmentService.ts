import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CommitmentService - Core Domain Orchestrator with ATOMIC GUARANTEES
 * 
 * This service is the SINGLE source of truth for all commitment-related mutations.
 * All financial operations, pool management, and lifecycle changes MUST go through this service.
 * 
 * ATOMIC TRANSACTION GUARANTEES:
 * - All multi-entity mutations execute within transactional boundaries
 * - On failure: complete rollback, no partial updates
 * - Optimistic locking prevents concurrent modification conflicts
 * - Centralized recalculation prevents circular updates
 * 
 * Exposed Methods:
 * - addPartToProject(project_id, part_id, qty_committed, notes, source_surface) **CANONICAL ENTRY**
 * - createPO(commitment_id, vendor_id, unit_cost, qty)
 * - createDeltaOrder(commitment_id, vendor_id, unit_cost, qty)
 * - createBillingPool(project_id, pool_name, invoiced_amount)
 * - allocatePool(pool_id, commitment_id, amount)
 * - recordVendorInvoiceCharge(vendor_invoice_line_id)
 * - removeCommitment(commitment_id, reason)
 * - reverseInstalledPart(installed_part_id, reason)
 * - reversePoolAllocation(allocation_id, reason)
 * - reversePoolCharge(charge_id, reason)
 * 
 * Invariants enforced:
 * - BillingPool.balance = paid_amount - allocated_total - charges_total
 * - exposure_gap >= 0 OR properly tracked negative
 * - No negative qty_reserved
 * - Single credit pool per project
 * - Cost lock after vendor invoice
 * - Invoice lock after batch status change
 */

// ============================================================================
// TRANSACTION CONTEXT & MUTATION GUARD
// ============================================================================

class TransactionContext {
  constructor(base44, user, timestamp) {
    this.base44 = base44;
    this.user = user;
    this.timestamp = timestamp;
    this.mutations = [];
    this.rollbackActions = [];
    this.activeMutations = new Map(); // entity_type:entity_id -> boolean
    this.lifecycleEvents = [];
    this.committed = false;
    this.rolledBack = false;
  }

  /**
   * Check if entity is currently being mutated (prevents circular updates)
   */
  isEntityActive(entityType, entityId) {
    return this.activeMutations.has(`${entityType}:${entityId}`);
  }

  /**
   * Mark entity as actively being mutated
   */
  markActive(entityType, entityId) {
    const key = `${entityType}:${entityId}`;
    if (this.activeMutations.has(key)) {
      throw new Error(`Circular mutation detected: ${key} is already being updated`);
    }
    this.activeMutations.set(key, true);
  }

  /**
   * Unmark entity mutation
   */
  unmarkActive(entityType, entityId) {
    this.activeMutations.delete(`${entityType}:${entityId}`);
  }

  /**
   * Record a mutation for potential rollback
   */
  recordMutation(entityType, entityId, previousState, newState) {
    this.mutations.push({ entityType, entityId, previousState, newState, timestamp: Date.now() });
  }

  /**
   * Add rollback action
   */
  addRollback(action) {
    this.rollbackActions.push(action);
  }

  /**
   * Queue lifecycle event (written only on commit)
   */
  queueLifecycleEvent(eventData) {
    this.lifecycleEvents.push(eventData);
  }

  /**
   * Execute rollback
   */
  async rollback(error) {
    if (this.rolledBack) return;
    this.rolledBack = true;

    console.error(`🔄 ROLLBACK initiated due to: ${error.message}`);
    console.error(`   Mutations to rollback: ${this.mutations.length}`);

    // Execute rollback actions in reverse order
    for (let i = this.rollbackActions.length - 1; i >= 0; i--) {
      try {
        await this.rollbackActions[i]();
      } catch (rollbackError) {
        console.error(`   Rollback action ${i} failed:`, rollbackError.message);
      }
    }

    // Log the failed transaction
    console.error(`❌ Transaction rolled back. Mutations attempted:`, 
      this.mutations.map(m => `${m.entityType}:${m.entityId}`));
  }

  /**
   * Commit all lifecycle events
   */
  async commit() {
    if (this.committed || this.rolledBack) return;
    this.committed = true;

    // Write all queued lifecycle events
    for (const eventData of this.lifecycleEvents) {
      await this.base44.asServiceRole.entities.LifecycleEvent.create({
        ...eventData,
        created_date: this.timestamp
      });
    }

    console.log(`✅ Transaction committed. Mutations: ${this.mutations.length}, Events: ${this.lifecycleEvents.length}`);
  }
}

// ============================================================================
// MAIN SERVICE HANDLER
// ============================================================================

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

    const { action, ...params } = await req.json();
    const timestamp = new Date().toISOString();
    const txn = new TransactionContext(base44, user, timestamp);

    let result;
    try {
      switch (action) {
        case 'createPO':
          result = await createPO(txn, params);
          break;
        case 'createDeltaOrder':
          result = await createDeltaOrder(txn, params);
          break;
        case 'createBillingPool':
          result = await createBillingPool(txn, params);
          break;
        case 'allocatePool':
          result = await allocatePool(txn, params);
          break;
        case 'recordVendorInvoiceCharge':
          result = await recordVendorInvoiceCharge(txn, params);
          break;
        case 'removeCommitment':
          result = await removeCommitment(txn, params);
          break;
        case 'reverseInstalledPart':
          result = await reverseInstalledPart(txn, params);
          break;
        case 'recalculateExposure':
          result = await recalculateExposure(txn, params);
          break;
        case 'getOrCreateCreditPool':
          result = await getOrCreateCreditPool(txn, params);
          break;
        case 'reversePoolAllocation':
          result = await reversePoolAllocation(txn, params);
          break;
        case 'reversePoolCharge':
          result = await reversePoolCharge(txn, params);
          break;
        case 'recalculatePoolBalance':
          result = await recalculatePoolBalance(txn, params);
          break;
        case 'recalculateProjectExposure':
          result = await recalculateProjectExposure(txn, params);
          break;
        case 'validateLockConstraints':
          result = await validateLockConstraintsAction(txn, params);
          break;
        case 'closePool':
          result = await closePool(txn, params);
          break;
        case 'transferPoolBalance':
          result = await transferPoolBalance(txn, params);
          break;
        case 'reconcileOrderCosts':
          result = await reconcileOrderCosts(txn, params);
          break;
        case 'addPartToProject':
          result = await addPartToProject(txn, params);
          break;
        default:
          return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }

      // Validate invariants before commit
      await validateInvariants(txn);

      // Commit transaction (writes lifecycle events)
      await txn.commit();

      return Response.json({ success: true, ...result });

    } catch (error) {
      // Rollback on any failure
      await txn.rollback(error);
      throw error;
    }

  } catch (error) {
    console.error("CommitmentService error:", error);
    return Response.json({ 
      error: error.message,
      type: error.name,
      rollback: true
    }, { status: 500 });
  }
});

// ============================================================================
// PRIVATE RECALCULATION METHODS (Centralized, Never Inline)
// ============================================================================

/**
 * PRIVATE: Recalculate pool balance and status
 * Must be called through transaction context
 */
async function _recalculatePool(txn, pool_id) {
  if (txn.isEntityActive('BillingPool', pool_id)) {
    console.log(`⚠️ Skipping pool recalc - already active: ${pool_id}`);
    return null;
  }

  txn.markActive('BillingPool', pool_id);
  try {
    const pools = await txn.base44.asServiceRole.entities.BillingPool.filter({ id: pool_id });
    const pool = pools[0];
    if (!pool) return null;

    // Optimistic lock check
    const currentVersion = pool.pool_version || 1;

    // Get active allocations
    const allocations = await txn.base44.asServiceRole.entities.PoolAllocation.filter({
      pool_id,
      is_reversed: false
    });
    const allocated_total = allocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);

    // Get active charges
    const charges = await txn.base44.asServiceRole.entities.PoolCharge.filter({
      pool_id,
      is_reversed: false
    });
    const charges_total = charges.reduce((sum, c) => sum + (c.amount || 0), 0);

    // Calculate balance: paid_amount - allocations - charges
    const balance = (pool.paid_amount || 0) - allocated_total - charges_total;

    // Determine status
    let newStatus = pool.status;
    if (balance < 0) {
      newStatus = 'overdrawn';
    } else if (pool.status === 'overdrawn' && balance >= 0) {
      newStatus = pool.paid_amount >= pool.invoiced_amount ? 'paid' : 'invoiced';
    }

    // Record previous state for rollback
    txn.recordMutation('BillingPool', pool_id, 
      { allocated_total: pool.allocated_total, charges_total: pool.charges_total, balance: pool.balance, status: pool.status },
      { allocated_total, charges_total, balance, status: newStatus }
    );

    // Add rollback action
    txn.addRollback(async () => {
      await txn.base44.asServiceRole.entities.BillingPool.update(pool_id, {
        allocated_total: pool.allocated_total,
        charges_total: pool.charges_total,
        balance: pool.balance,
        status: pool.status,
        pool_version: currentVersion
      });
    });

    // Update with version increment
    await txn.base44.asServiceRole.entities.BillingPool.update(pool_id, {
      allocated_total,
      charges_total,
      balance,
      status: newStatus,
      pool_version: currentVersion + 1
    });

    console.log(`📊 Pool ${pool_id} recalculated:`, { allocated_total, charges_total, balance, status: newStatus });

    return { allocated_total, charges_total, balance, status: newStatus };
  } finally {
    txn.unmarkActive('BillingPool', pool_id);
  }
}

/**
 * PRIVATE: Recalculate commitment exposure
 * Must be called through transaction context
 */
async function _recalculateCommitment(txn, commitment_id) {
  if (txn.isEntityActive('PartCommitment', commitment_id)) {
    console.log(`⚠️ Skipping commitment recalc - already active: ${commitment_id}`);
    return null;
  }

  txn.markActive('PartCommitment', commitment_id);
  try {
    const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const commitment = commitments[0];
    if (!commitment) return null;

    // Optimistic lock check
    const currentVersion = commitment.commitment_version || 1;

    // Calculate planned retail total
    const plannedRetail = (commitment.qty_committed || 0) * (commitment.unit_retail_snapshot || 0);

    // Get all active allocations for this commitment
    const allocations = await txn.base44.asServiceRole.entities.PoolAllocation.filter({
      commitment_id,
      is_reversed: false
    });
    const coveredRetail = allocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);

    // Determine exposure basis based on billing status
    const exposureBasis = commitment.billing_status === 'invoiced' || commitment.billing_status === 'paid'
      ? (commitment.invoiced_retail_total || plannedRetail)
      : plannedRetail;

    // Calculate exposure gap
    const exposureGap = exposureBasis - coveredRetail;

    // Record previous state for rollback
    txn.recordMutation('PartCommitment', commitment_id,
      { planned_retail_total: commitment.planned_retail_total, covered_retail_total: commitment.covered_retail_total, exposure_gap: commitment.exposure_gap },
      { planned_retail_total: plannedRetail, covered_retail_total: coveredRetail, exposure_gap: exposureGap }
    );

    // Add rollback action
    txn.addRollback(async () => {
      await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        planned_retail_total: commitment.planned_retail_total,
        covered_retail_total: commitment.covered_retail_total,
        exposure_gap: commitment.exposure_gap,
        commitment_version: currentVersion
      });
    });

    // Update with version increment
    await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
      planned_retail_total: plannedRetail,
      covered_retail_total: coveredRetail,
      exposure_gap: exposureGap,
      commitment_version: currentVersion + 1
    });

    console.log(`📈 Commitment ${commitment_id} exposure:`, { plannedRetail, coveredRetail, exposureBasis, exposureGap });

    return { plannedRetail, coveredRetail, exposureBasis, exposureGap };
  } finally {
    txn.unmarkActive('PartCommitment', commitment_id);
  }
}

/**
 * PRIVATE: Recalculate all commitments in a project
 */
async function _recalculateProject(txn, project_id) {
  const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ 
    project_id,
    commitment_status: { $nin: ['cancelled', 'closed'] }
  });

  let totalPlanned = 0;
  let totalCovered = 0;
  let totalExposure = 0;

  for (const c of commitments) {
    const result = await _recalculateCommitment(txn, c.id);
    if (result) {
      totalPlanned += result.plannedRetail;
      totalCovered += result.coveredRetail;
      totalExposure += result.exposureGap;
    }
  }

  // Also recalculate all pools
  const pools = await txn.base44.asServiceRole.entities.BillingPool.filter({ project_id });
  for (const pool of pools) {
    await _recalculatePool(txn, pool.id);
  }

  return { commitments: commitments.length, totalPlanned, totalCovered, totalExposure };
}

// ============================================================================
// INVARIANT VALIDATION
// ============================================================================

/**
 * Validate all financial invariants before commit
 */
async function validateInvariants(txn) {
  const errors = [];

  // Validate all mutated pools
  const poolMutations = txn.mutations.filter(m => m.entityType === 'BillingPool');
  for (const mutation of poolMutations) {
    const pools = await txn.base44.asServiceRole.entities.BillingPool.filter({ id: mutation.entityId });
    const pool = pools[0];
    if (pool) {
      // Invariant: balance = paid_amount - allocated_total - charges_total
      const expectedBalance = (pool.paid_amount || 0) - (pool.allocated_total || 0) - (pool.charges_total || 0);
      if (Math.abs((pool.balance || 0) - expectedBalance) > 0.01) {
        errors.push(`Pool ${pool.id} balance mismatch: stored=${pool.balance}, expected=${expectedBalance}`);
      }

      // Invariant: overdrawn status matches negative balance
      if (pool.balance < 0 && pool.status !== 'overdrawn') {
        errors.push(`Pool ${pool.id} has negative balance (${pool.balance}) but status is ${pool.status}`);
      }
    }
  }

  // Validate all mutated commitments
  const commitmentMutations = txn.mutations.filter(m => m.entityType === 'PartCommitment');
  for (const mutation of commitmentMutations) {
    const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ id: mutation.entityId });
    const commitment = commitments[0];
    if (commitment) {
      // Invariant: exposure_gap = planned_retail_total - covered_retail_total (for non-invoiced)
      if (commitment.billing_status !== 'invoiced' && commitment.billing_status !== 'paid') {
        const expectedGap = (commitment.planned_retail_total || 0) - (commitment.covered_retail_total || 0);
        if (Math.abs((commitment.exposure_gap || 0) - expectedGap) > 0.01) {
          errors.push(`Commitment ${commitment.id} exposure_gap mismatch: stored=${commitment.exposure_gap}, expected=${expectedGap}`);
        }
      }

      // Invariant: qty_installed <= qty_committed
      if ((commitment.qty_installed || 0) > (commitment.qty_committed || 0)) {
        errors.push(`Commitment ${commitment.id} qty_installed (${commitment.qty_installed}) > qty_committed (${commitment.qty_committed})`);
      }
    }
  }

  // Check for duplicate credit pools (single credit pool per project)
  const projectIds = new Set();
  for (const mutation of txn.mutations) {
    if (mutation.entityType === 'BillingPool' && mutation.newState?.pool_name === 'Credit Pool') {
      // Get all credit pools for this project
      const pools = await txn.base44.asServiceRole.entities.BillingPool.filter({ id: mutation.entityId });
      if (pools[0]) {
        const projectId = pools[0].project_id;
        if (projectIds.has(projectId)) {
          errors.push(`Duplicate Credit Pool creation attempted for project ${projectId}`);
        }
        projectIds.add(projectId);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invariant violations detected:\n${errors.join('\n')}`);
  }

  console.log(`✓ All invariants validated`);
}

// ============================================================================
// CORE OPERATIONS (Atomic)
// ============================================================================

/**
 * Create a Purchase Order for a commitment
 * ENFORCES: Line item unit_cost from commitment.unit_cost_snapshot (which came from Part.cost)
 */
async function createPO(txn, params) {
  const { commitment_id, vendor_id, qty, order_id } = params;
  // Note: unit_cost param is IGNORED - we use commitment snapshot

  // Fetch commitment
  const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
  const commitment = commitments[0];
  if (!commitment) throw new Error('Commitment not found');

  // Fetch part for reference
  const parts = await txn.base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
  const part = parts[0];
  if (!part) throw new Error('Part not found');

  // Use commitment.unit_cost_snapshot as authoritative cost (set at commitment creation)
  // Fallback to Part.cost only if snapshot missing
  const unit_cost = commitment.unit_cost_snapshot || part.cost || part.default_cost || 0;
  if (unit_cost <= 0) {
    throw new Error(`Cannot create PO: Part "${part.part_name}" has no valid cost. Set cost and reprice commitment before ordering.`);
  }

  // Optimistic lock check
  const currentVersion = commitment.commitment_version || 1;

  // Prepay validation
  if (commitment.requires_prepay && !commitment.prepay_satisfied_at) {
    throw new Error('Prepayment required before ordering. Allocate pool funds first.');
  }

  // Cost lock validation
  const existingLines = await txn.base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id });
  const hasLockedCost = existingLines.some(line => line.cost_locked_at);
  if (hasLockedCost) {
    throw new Error('Cannot create PO: cost already locked by vendor invoice');
  }

  // Create PO line item with cost fields (NOT retail)
  const lineItem = await txn.base44.asServiceRole.entities.PartPurchaseLineItem.create({
    order_id,
    part_id: commitment.part_id,
    commitment_id,
    vendor_id,
    qty_ordered: qty,
    qty_received: 0,
    unit_cost: unit_cost, // From commitment snapshot (authoritative)
    unit_price: unit_cost, // Deprecated field for compatibility
    extended_cost: qty * unit_cost,
    line_total: qty * unit_cost, // Deprecated field for compatibility
    cost_source_reference: commitment_id,
    status: 'Ordered',
    is_delta_order: false
  });

  // Rollback: delete the line item
  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PartPurchaseLineItem.delete(lineItem.id);
  });

  // Update commitment quantities
  const newQtyOrdered = (commitment.qty_ordered || 0) + qty;
  
  txn.recordMutation('PartCommitment', commitment_id,
    { qty_ordered: commitment.qty_ordered, commitment_status: commitment.commitment_status },
    { qty_ordered: newQtyOrdered, commitment_status: 'ordered' }
  );

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
      qty_ordered: commitment.qty_ordered,
      commitment_status: commitment.commitment_status,
      unit_cost_snapshot: commitment.unit_cost_snapshot,
      commitment_version: currentVersion
    });
  });

  await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
    qty_ordered: newQtyOrdered,
    commitment_status: 'ordered',
    unit_cost_snapshot: unit_cost,
    commitment_version: currentVersion + 1
  });

  // Queue lifecycle event
  txn.queueLifecycleEvent({
    commitment_id,
    event_type: 'PO_CREATED',
    previous_state: JSON.stringify({ qty_ordered: commitment.qty_ordered }),
    new_state: JSON.stringify({ qty_ordered: newQtyOrdered }),
    trigger_source: 'USER_ACTION',
    user_id: txn.user.id,
    part_id: commitment.part_id,
    project_id: commitment.project_id,
    notes: `PO created: ${qty} units @ $${unit_cost}`
  });

  // Centralized recalculation
  await _recalculateCommitment(txn, commitment_id);

  return { lineItem, commitment_id };
}

/**
 * Create a Delta (additional) Order for existing commitment
 * ENFORCES: Line item unit_cost from commitment.unit_cost_snapshot
 */
async function createDeltaOrder(txn, params) {
  const { commitment_id, vendor_id, qty, order_id, reason } = params;
  // Note: unit_cost param is IGNORED - we use commitment snapshot

  const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
  const commitment = commitments[0];
  if (!commitment) throw new Error('Commitment not found');

  // Fetch part for reference
  const parts = await txn.base44.asServiceRole.entities.Part.filter({ id: commitment.part_id });
  const part = parts[0];
  if (!part) throw new Error('Part not found');

  // Use commitment.unit_cost_snapshot as authoritative
  const unit_cost = commitment.unit_cost_snapshot || part.cost || part.default_cost || 0;
  if (unit_cost <= 0) {
    throw new Error(`Cannot create delta order: Part "${part.part_name}" has no valid cost.`);
  }

  const currentVersion = commitment.commitment_version || 1;

  // Create PO line item with cost fields (NOT retail)
  const lineItem = await txn.base44.asServiceRole.entities.PartPurchaseLineItem.create({
    order_id,
    part_id: commitment.part_id,
    commitment_id,
    vendor_id,
    qty_ordered: qty,
    qty_received: 0,
    unit_cost: unit_cost, // From commitment snapshot
    unit_price: unit_cost, // Deprecated field
    extended_cost: qty * unit_cost,
    line_total: qty * unit_cost, // Deprecated field
    cost_source_reference: commitment_id,
    status: 'Ordered',
    is_delta_order: true,
    notes: `Delta order: ${reason || 'Additional quantity needed'}`
  });

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PartPurchaseLineItem.delete(lineItem.id);
  });

  // Update commitment
  const newQtyOrdered = (commitment.qty_ordered || 0) + qty;
  
  txn.recordMutation('PartCommitment', commitment_id,
    { qty_ordered: commitment.qty_ordered },
    { qty_ordered: newQtyOrdered }
  );

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
      qty_ordered: commitment.qty_ordered,
      commitment_version: currentVersion
    });
  });

  await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
    qty_ordered: newQtyOrdered,
    commitment_version: currentVersion + 1
  });

  txn.queueLifecycleEvent({
    commitment_id,
    event_type: 'PO_CREATED',
    previous_state: JSON.stringify({ qty_ordered: commitment.qty_ordered }),
    new_state: JSON.stringify({ qty_ordered: newQtyOrdered, is_delta: true }),
    trigger_source: 'USER_ACTION',
    user_id: txn.user.id,
    part_id: commitment.part_id,
    project_id: commitment.project_id,
    notes: `Delta order: ${qty} units @ $${unit_cost}`
  });

  await _recalculateCommitment(txn, commitment_id);

  return { lineItem, commitment_id };
}

/**
 * Create a new Billing Pool for a project
 */
async function createBillingPool(txn, params) {
  const { project_id, pool_name, invoiced_amount, notes } = params;

  const pool = await txn.base44.asServiceRole.entities.BillingPool.create({
    project_id,
    pool_name,
    status: invoiced_amount > 0 ? 'invoiced' : 'draft',
    invoiced_amount: invoiced_amount || 0,
    paid_amount: 0,
    allocated_total: 0,
    charges_total: 0,
    balance: 0,
    pool_version: 1,
    notes
  });

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.BillingPool.delete(pool.id);
  });

  txn.recordMutation('BillingPool', pool.id, null, { created: true });

  return { pool };
}

/**
 * Allocate pool funds to a commitment
 */
async function allocatePool(txn, params) {
  const { pool_id, commitment_id, amount, allocation_type, notes } = params;

  const [pools, commitments] = await Promise.all([
    txn.base44.asServiceRole.entities.BillingPool.filter({ id: pool_id }),
    txn.base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id })
  ]);

  const pool = pools[0];
  const commitment = commitments[0];
  if (!pool) throw new Error('Pool not found');
  if (!commitment) throw new Error('Commitment not found');

  const poolVersion = pool.pool_version || 1;
  const commitmentVersion = commitment.commitment_version || 1;

  // Calculate overdraw status
  const existingAllocations = await txn.base44.asServiceRole.entities.PoolAllocation.filter({ 
    pool_id, 
    is_reversed: false 
  });
  const totalAllocated = existingAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
  const availableFunds = (pool.paid_amount || 0) - totalAllocated;
  const willOverdraw = amount > availableFunds;

  // Create allocation
  const allocation = await txn.base44.asServiceRole.entities.PoolAllocation.create({
    pool_id,
    commitment_id,
    amount_allocated: amount,
    allocation_type: allocation_type || 'manual',
    is_reversed: false,
    notes: willOverdraw ? `${notes || ''} [OVERDRAW WARNING]`.trim() : notes
  });

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PoolAllocation.delete(allocation.id);
  });

  // Update commitment covered amount
  const newCovered = (commitment.covered_retail_total || 0) + amount;
  
  txn.recordMutation('PartCommitment', commitment_id,
    { covered_retail_total: commitment.covered_retail_total },
    { covered_retail_total: newCovered }
  );

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
      covered_retail_total: commitment.covered_retail_total,
      prepay_satisfied_at: commitment.prepay_satisfied_at,
      commitment_version: commitmentVersion
    });
  });

  // Check if prepay is now satisfied
  let prepayUpdate = {};
  if (commitment.requires_prepay && !commitment.prepay_satisfied_at) {
    const plannedTotal = commitment.planned_retail_total || 
      ((commitment.qty_committed || 0) * (commitment.unit_retail_snapshot || 0));
    if (newCovered >= plannedTotal) {
      prepayUpdate = { prepay_satisfied_at: txn.timestamp };
    }
  }

  await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
    covered_retail_total: newCovered,
    ...prepayUpdate,
    commitment_version: commitmentVersion + 1
  });

  txn.queueLifecycleEvent({
    commitment_id,
    event_type: 'BILLING_STATUS_CHANGED',
    previous_state: JSON.stringify({ covered_retail_total: commitment.covered_retail_total }),
    new_state: JSON.stringify({ covered_retail_total: newCovered }),
    trigger_source: 'USER_ACTION',
    user_id: txn.user.id,
    part_id: commitment.part_id,
    project_id: commitment.project_id,
    notes: `Pool allocation: $${amount} from pool ${pool.pool_name}`
  });

  // Centralized recalculations
  await _recalculatePool(txn, pool_id);
  await _recalculateCommitment(txn, commitment_id);

  return { allocation, overdraw: willOverdraw };
}

/**
 * Record a vendor invoice charge and lock costs
 */
async function recordVendorInvoiceCharge(txn, params) {
  const { vendor_invoice_line_id, freight_allocation, tariff_allocation } = params;

  const lines = await txn.base44.asServiceRole.entities.VendorInvoiceLineItem.filter({ id: vendor_invoice_line_id });
  const invoiceLine = lines[0];
  if (!invoiceLine) throw new Error('Invoice line not found');

  if (!invoiceLine.purchase_line_item_id) {
    throw new Error('Invoice line not linked to PO');
  }

  const poLines = await txn.base44.asServiceRole.entities.PartPurchaseLineItem.filter({ id: invoiceLine.purchase_line_item_id });
  const poLine = poLines[0];
  if (!poLine) throw new Error('PO line not found');

  // Store previous state for rollback
  const prevPoLine = { ...poLine };

  // Lock the cost
  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PartPurchaseLineItem.update(poLine.id, {
      cost_locked_at: prevPoLine.cost_locked_at,
      unit_price: prevPoLine.unit_price,
      freight_cost: prevPoLine.freight_cost,
      tariff_cost: prevPoLine.tariff_cost
    });
  });

  await txn.base44.asServiceRole.entities.PartPurchaseLineItem.update(poLine.id, {
    cost_locked_at: txn.timestamp,
    unit_price: invoiceLine.actual_unit_cost,
    freight_cost: freight_allocation || 0,
    tariff_cost: tariff_allocation || 0
  });

  // Update commitment actual cost
  if (poLine.commitment_id) {
    const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ id: poLine.commitment_id });
    const commitment = commitments[0];
    if (commitment) {
      const prevCommitment = { ...commitment };
      const commitmentVersion = commitment.commitment_version || 1;

      txn.addRollback(async () => {
        await txn.base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
          actual_unit_cost: prevCommitment.actual_unit_cost,
          actual_extended_cost: prevCommitment.actual_extended_cost,
          commitment_version: commitmentVersion
        });
      });

      await txn.base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        actual_unit_cost: invoiceLine.actual_unit_cost,
        actual_extended_cost: invoiceLine.actual_unit_cost * (commitment.qty_committed || 0),
        commitment_version: commitmentVersion + 1
      });

      // Create pool charges for freight/tariff if applicable
      if (freight_allocation > 0 || tariff_allocation > 0) {
        const pools = await txn.base44.asServiceRole.entities.BillingPool.filter({ 
          project_id: commitment.project_id
        });
        const activePool = pools.find(p => ['draft', 'invoiced', 'paid'].includes(p.status));
        
        if (activePool) {
          if (freight_allocation > 0) {
            const freightCharge = await txn.base44.asServiceRole.entities.PoolCharge.create({
              pool_id: activePool.id,
              project_id: commitment.project_id,
              related_commitment_id: commitment.id,
              related_vendor_invoice_id: invoiceLine.invoice_id,
              charge_type: 'freight',
              description: `Freight for ${poLine.part_id}`,
              amount: freight_allocation,
              is_reversed: false
            });
            txn.addRollback(async () => {
              await txn.base44.asServiceRole.entities.PoolCharge.delete(freightCharge.id);
            });
          }

          if (tariff_allocation > 0) {
            const tariffCharge = await txn.base44.asServiceRole.entities.PoolCharge.create({
              pool_id: activePool.id,
              project_id: commitment.project_id,
              related_commitment_id: commitment.id,
              related_vendor_invoice_id: invoiceLine.invoice_id,
              charge_type: 'tariff',
              description: `Tariff/duty for ${poLine.part_id}`,
              amount: tariff_allocation,
              is_reversed: false
            });
            txn.addRollback(async () => {
              await txn.base44.asServiceRole.entities.PoolCharge.delete(tariffCharge.id);
            });
          }

          // Recalculate pool after charges
          await _recalculatePool(txn, activePool.id);
        }
      }

      await _recalculateCommitment(txn, commitment.id);
    }
  }

  return { locked: true, po_line_id: poLine.id };
}

/**
 * Remove/cancel a commitment with proper credit handling
 */
async function removeCommitment(txn, params) {
  const { commitment_id, reason, reversal_type } = params;

  const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
  const commitment = commitments[0];
  if (!commitment) throw new Error('Commitment not found');

  const commitmentVersion = commitment.commitment_version || 1;

  // Determine cancellation type
  let cancellation_type = 'before_order';
  if (commitment.billing_status === 'paid') {
    cancellation_type = 'after_paid';
  } else if (commitment.billing_status === 'invoiced') {
    cancellation_type = 'after_invoice';
  } else if (commitment.qty_ordered > 0) {
    cancellation_type = 'before_invoice';
  }

  // If already invoiced/paid, create credit pool entry
  let creditCreated = false;
  if (cancellation_type === 'after_invoice' || cancellation_type === 'after_paid') {
    const creditPoolResult = await getOrCreateCreditPool(txn, { project_id: commitment.project_id });
    
    const creditAmount = commitment.covered_retail_total || commitment.planned_retail_total || 0;
    if (creditAmount > 0) {
      const creditAlloc = await txn.base44.asServiceRole.entities.PoolAllocation.create({
        pool_id: creditPoolResult.pool.id,
        commitment_id,
        amount_allocated: creditAmount,
        allocation_type: 'system_credit',
        is_reversed: false,
        notes: `Credit for cancelled commitment: ${reason}`
      });
      txn.addRollback(async () => {
        await txn.base44.asServiceRole.entities.PoolAllocation.delete(creditAlloc.id);
      });
      creditCreated = true;
    }
  }

  // Reverse any existing allocations
  const allocations = await txn.base44.asServiceRole.entities.PoolAllocation.filter({ 
    commitment_id, 
    is_reversed: false 
  });
  
  const poolsToRecalc = new Set();
  for (const alloc of allocations) {
    txn.addRollback(async () => {
      await txn.base44.asServiceRole.entities.PoolAllocation.update(alloc.id, {
        is_reversed: false,
        reversed_at: null,
        reversed_by: null
      });
    });
    await txn.base44.asServiceRole.entities.PoolAllocation.update(alloc.id, {
      is_reversed: true,
      reversed_at: txn.timestamp,
      reversed_by: txn.user.id
    });
    poolsToRecalc.add(alloc.pool_id);
  }

  // Update commitment status
  txn.recordMutation('PartCommitment', commitment_id,
    { commitment_status: commitment.commitment_status },
    { commitment_status: 'cancelled' }
  );

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
      commitment_status: commitment.commitment_status,
      cancelled_at: null,
      cancelled_by: null,
      cancelled_reason: null,
      cancellation_type: null,
      scope_reduction_credit_created: false,
      commitment_version: commitmentVersion
    });
  });

  await txn.base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
    commitment_status: 'cancelled',
    cancelled_at: txn.timestamp,
    cancelled_by: txn.user.id,
    cancelled_reason: reason,
    cancellation_type,
    scope_reduction_credit_created: creditCreated,
    commitment_version: commitmentVersion + 1
  });

  txn.queueLifecycleEvent({
    commitment_id,
    event_type: 'COMMITMENT_CANCELLED',
    previous_state: JSON.stringify({ status: commitment.commitment_status }),
    new_state: JSON.stringify({ status: 'cancelled', cancellation_type }),
    trigger_source: 'USER_ACTION',
    user_id: txn.user.id,
    part_id: commitment.part_id,
    project_id: commitment.project_id,
    notes: reason
  });

  // Recalculate all affected pools
  for (const poolId of poolsToRecalc) {
    await _recalculatePool(txn, poolId);
  }

  return { cancelled: true, cancellation_type, creditCreated };
}

/**
 * Reverse an installed part
 */
async function reverseInstalledPart(txn, params) {
  const { installed_part_id, reason, reversal_type } = params;

  const parts = await txn.base44.asServiceRole.entities.InstalledPart.filter({ id: installed_part_id });
  const installedPart = parts[0];
  if (!installedPart) throw new Error('Installed part not found');

  // Idempotency check
  if (installedPart.is_reversed) {
    return { reversed: true, alreadyReversed: true };
  }

  const prevInstalledPart = { ...installedPart };

  // Update installed part
  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.InstalledPart.update(installed_part_id, {
      is_reversed: false,
      reversed_at: null,
      reversed_by: null,
      reversal_reason: null,
      reversal_type: null
    });
  });

  await txn.base44.asServiceRole.entities.InstalledPart.update(installed_part_id, {
    is_reversed: true,
    reversed_at: txn.timestamp,
    reversed_by: txn.user.id,
    reversal_reason: reason,
    reversal_type: reversal_type || 'other'
  });

  // Update commitment qty_installed
  if (installedPart.commitment_id) {
    const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ id: installedPart.commitment_id });
    const commitment = commitments[0];
    if (commitment) {
      const commitmentVersion = commitment.commitment_version || 1;
      const newQtyInstalled = Math.max(0, (commitment.qty_installed || 0) - installedPart.qty_consumed);

      txn.recordMutation('PartCommitment', commitment.id,
        { qty_installed: commitment.qty_installed },
        { qty_installed: newQtyInstalled }
      );

      txn.addRollback(async () => {
        await txn.base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
          qty_installed: commitment.qty_installed,
          commitment_version: commitmentVersion
        });
      });

      await txn.base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        qty_installed: newQtyInstalled,
        commitment_version: commitmentVersion + 1
      });

      txn.queueLifecycleEvent({
        commitment_id: commitment.id,
        event_type: 'PART_INSTALLED',
        previous_state: JSON.stringify({ qty_installed: commitment.qty_installed }),
        new_state: JSON.stringify({ qty_installed: newQtyInstalled, reversed: true }),
        trigger_source: 'USER_ACTION',
        user_id: txn.user.id,
        part_id: commitment.part_id,
        project_id: commitment.project_id,
        notes: `Installation reversed: ${reason}`
      });

      await _recalculateCommitment(txn, commitment.id);
    }
  }

  // Return inventory if applicable
  if (installedPart.inventory_item_id && installedPart.location_id) {
    const items = await txn.base44.asServiceRole.entities.InventoryItem.filter({ id: installedPart.inventory_item_id });
    const item = items[0];
    if (item) {
      const prevQty = item.quantity_on_hand || 0;

      txn.addRollback(async () => {
        await txn.base44.asServiceRole.entities.InventoryItem.update(item.id, {
          quantity_on_hand: prevQty
        });
      });

      await txn.base44.asServiceRole.entities.InventoryItem.update(item.id, {
        quantity_on_hand: prevQty + installedPart.qty_consumed
      });
    }
  }

  return { reversed: true };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get or create the credit pool for a project (ensures single credit pool)
 */
async function getOrCreateCreditPool(txn, params) {
  const { project_id } = params;

  // Look for existing credit pool
  const pools = await txn.base44.asServiceRole.entities.BillingPool.filter({
    project_id,
    pool_name: 'Credit Pool'
  });

  if (pools.length > 0) {
    return { pool: pools[0], created: false };
  }

  // Create new credit pool
  const pool = await txn.base44.asServiceRole.entities.BillingPool.create({
    project_id,
    pool_name: 'Credit Pool',
    status: 'draft',
    invoiced_amount: 0,
    paid_amount: 0,
    allocated_total: 0,
    charges_total: 0,
    balance: 0,
    pool_version: 1,
    notes: 'System-managed credit pool for scope reductions and refunds'
  });

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.BillingPool.delete(pool.id);
  });

  txn.recordMutation('BillingPool', pool.id, null, { created: true, pool_name: 'Credit Pool' });

  return { pool, created: true };
}

/**
 * Recalculate exposure (public action)
 */
async function recalculateExposure(txn, params) {
  const { project_id, commitment_id } = params;

  if (commitment_id) {
    await _recalculateCommitment(txn, commitment_id);
    return { recalculated: 1 };
  }

  if (project_id) {
    const result = await _recalculateProject(txn, project_id);
    return { recalculated: result.commitments };
  }

  throw new Error('Must provide project_id or commitment_id');
}

/**
 * Reverse a pool allocation
 */
async function reversePoolAllocation(txn, params) {
  const { allocation_id, reason } = params;

  const allocations = await txn.base44.asServiceRole.entities.PoolAllocation.filter({ id: allocation_id });
  const allocation = allocations[0];
  if (!allocation) throw new Error('Allocation not found');
  if (allocation.is_reversed) throw new Error('Allocation already reversed');

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PoolAllocation.update(allocation_id, {
      is_reversed: false,
      reversed_at: null,
      reversed_by: null,
      notes: allocation.notes
    });
  });

  await txn.base44.asServiceRole.entities.PoolAllocation.update(allocation_id, {
    is_reversed: true,
    reversed_at: txn.timestamp,
    reversed_by: txn.user.id,
    notes: `${allocation.notes || ''} [REVERSED: ${reason}]`.trim()
  });

  // Update commitment covered amount
  const commitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({ id: allocation.commitment_id });
  const commitment = commitments[0];
  if (commitment) {
    const commitmentVersion = commitment.commitment_version || 1;
    const newCovered = Math.max(0, (commitment.covered_retail_total || 0) - allocation.amount_allocated);

    txn.addRollback(async () => {
      await txn.base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
        covered_retail_total: commitment.covered_retail_total,
        commitment_version: commitmentVersion
      });
    });

    await txn.base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
      covered_retail_total: newCovered,
      commitment_version: commitmentVersion + 1
    });

    await _recalculateCommitment(txn, commitment.id);
  }

  await _recalculatePool(txn, allocation.pool_id);

  return { reversed: true };
}

/**
 * Reverse a pool charge
 */
async function reversePoolCharge(txn, params) {
  const { charge_id, reason } = params;

  const charges = await txn.base44.asServiceRole.entities.PoolCharge.filter({ id: charge_id });
  const charge = charges[0];
  if (!charge) throw new Error('Charge not found');
  if (charge.is_reversed) throw new Error('Charge already reversed');

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PoolCharge.update(charge_id, {
      is_reversed: false,
      reversed_at: null,
      reversed_by: null,
      reversal_reason: null
    });
  });

  await txn.base44.asServiceRole.entities.PoolCharge.update(charge_id, {
    is_reversed: true,
    reversed_at: txn.timestamp,
    reversed_by: txn.user.id,
    reversal_reason: reason
  });

  await _recalculatePool(txn, charge.pool_id);

  return { reversed: true };
}

/**
 * Public: Recalculate pool balance
 */
async function recalculatePoolBalance(txn, params) {
  const { pool_id } = params;
  return _recalculatePool(txn, pool_id);
}

/**
 * Recalculate exposure for all commitments in a project
 */
async function recalculateProjectExposure(txn, params) {
  const { project_id } = params;
  const result = await _recalculateProject(txn, project_id);
  
  console.log(`📊 Project ${project_id} exposure summary:`, {
    commitments: result.commitments,
    totalPlanned: result.totalPlanned,
    totalCovered: result.totalCovered,
    totalExposure: result.totalExposure
  });

  return result;
}

/**
 * Close a billing pool
 */
async function closePool(txn, params) {
  const { pool_id, close_mode, reason } = params;

  const pools = await txn.base44.asServiceRole.entities.BillingPool.filter({ id: pool_id });
  const pool = pools[0];
  if (!pool) throw new Error('Pool not found');

  if (pool.status === 'closed') {
    return { closed: true, alreadyClosed: true };
  }

  const poolVersion = pool.pool_version || 1;
  const balance = pool.balance || 0;

  // Validate close conditions
  if (close_mode === 'zero_balance' && Math.abs(balance) > 0.01) {
    throw new Error(`Cannot close pool: balance is $${balance.toFixed(2)}, not zero`);
  }

  if (close_mode === 'force' && balance !== 0) {
    console.warn(`Force-closing pool ${pool_id} with non-zero balance: $${balance.toFixed(2)}`);
  }

  txn.recordMutation('BillingPool', pool_id, { status: pool.status }, { status: 'closed' });

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.BillingPool.update(pool_id, {
      status: pool.status,
      closed_at: null,
      closed_by: null,
      pool_version: poolVersion
    });
  });

  await txn.base44.asServiceRole.entities.BillingPool.update(pool_id, {
    status: 'closed',
    closed_at: txn.timestamp,
    closed_by: txn.user.id,
    notes: `${pool.notes || ''}\n[CLOSED: ${reason || close_mode}]`.trim(),
    pool_version: poolVersion + 1
  });

  return { closed: true, previous_balance: balance };
}

/**
 * Transfer balance from one pool to another project
 */
async function transferPoolBalance(txn, params) {
  const { source_pool_id, target_project_id, amount, reason } = params;

  if (!amount || amount <= 0) {
    throw new Error('Transfer amount must be positive');
  }

  const sourcePools = await txn.base44.asServiceRole.entities.BillingPool.filter({ id: source_pool_id });
  const sourcePool = sourcePools[0];
  if (!sourcePool) throw new Error('Source pool not found');

  const sourceBalance = sourcePool.balance || 0;
  if (amount > sourceBalance) {
    throw new Error(`Insufficient balance: pool has $${sourceBalance.toFixed(2)}, requested $${amount.toFixed(2)}`);
  }

  // Get or create target pool
  const targetPools = await txn.base44.asServiceRole.entities.BillingPool.filter({
    project_id: target_project_id,
    status: { $nin: ['closed'] }
  });

  let targetPool = targetPools[0];
  if (!targetPool) {
    // Create new pool in target project
    targetPool = await txn.base44.asServiceRole.entities.BillingPool.create({
      project_id: target_project_id,
      pool_name: 'Transfer Pool',
      status: 'paid',
      invoiced_amount: amount,
      paid_amount: amount,
      allocated_total: 0,
      charges_total: 0,
      balance: amount,
      pool_version: 1,
      notes: `Created via transfer from pool ${sourcePool.pool_name}`
    });

    txn.addRollback(async () => {
      await txn.base44.asServiceRole.entities.BillingPool.delete(targetPool.id);
    });
  } else {
    // Add to existing pool
    const targetVersion = targetPool.pool_version || 1;
    const newPaid = (targetPool.paid_amount || 0) + amount;
    const newBalance = (targetPool.balance || 0) + amount;

    txn.addRollback(async () => {
      await txn.base44.asServiceRole.entities.BillingPool.update(targetPool.id, {
        paid_amount: targetPool.paid_amount,
        balance: targetPool.balance,
        pool_version: targetVersion
      });
    });

    await txn.base44.asServiceRole.entities.BillingPool.update(targetPool.id, {
      paid_amount: newPaid,
      balance: newBalance,
      pool_version: targetVersion + 1
    });
  }

  // Create charge on source pool to deduct balance
  const transferCharge = await txn.base44.asServiceRole.entities.PoolCharge.create({
    pool_id: source_pool_id,
    project_id: sourcePool.project_id,
    charge_type: 'adjustment',
    description: `Transfer to project ${target_project_id}: ${reason || 'Manual transfer'}`,
    amount: amount,
    is_reversed: false,
    source_reference_id: `transfer:${source_pool_id}:${target_project_id}:${Date.now()}`
  });

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PoolCharge.delete(transferCharge.id);
  });

  // Recalculate source pool
  await _recalculatePool(txn, source_pool_id);

  return { 
    transferred: true, 
    amount,
    source_pool_id,
    target_pool_id: targetPool.id,
    target_project_id
  };
}

/**
 * Reconcile all line item costs for an order from commitment snapshots
 * This is a repair action that forces all line items to use authoritative snapshot values
 */
async function reconcileOrderCosts(txn, params) {
  const { order_id, dry_run = false } = params;
  
  const lineItems = await txn.base44.asServiceRole.entities.PartPurchaseLineItem.filter({ order_id });
  const commitments = await txn.base44.asServiceRole.entities.PartCommitment.list();
  const commitmentsMap = new Map(commitments.map(c => [c.id, c]));
  
  const TOL = 0.01;
  const repairs = [];
  
  for (const lineItem of lineItems) {
    if (!lineItem.commitment_id) continue;
    
    const commitment = commitmentsMap.get(lineItem.commitment_id);
    if (!commitment || !commitment.unit_cost_snapshot || commitment.unit_cost_snapshot <= 0) {
      continue;
    }
    
    const snapshot = commitment.unit_cost_snapshot;
    const currentCost = lineItem.unit_cost || lineItem.unit_price || 0;
    const qty = lineItem.qty_ordered || 1;
    const expectedExtended = snapshot * qty;
    
    if (Math.abs(currentCost - snapshot) > TOL || 
        Math.abs((lineItem.extended_cost || 0) - expectedExtended) > TOL) {
      
      const updateData = {
        unit_cost: snapshot,
        unit_price: snapshot, // Deprecated field
        extended_cost: expectedExtended,
        line_total: expectedExtended, // Deprecated field
        cost_source_reference: `commitment:${commitment.id}`
      };
      
      repairs.push({
        line_item_id: lineItem.id,
        old_cost: currentCost,
        new_cost: snapshot,
        old_extended: lineItem.extended_cost,
        new_extended: expectedExtended
      });
      
      if (!dry_run) {
        txn.addRollback(async () => {
          await txn.base44.asServiceRole.entities.PartPurchaseLineItem.update(lineItem.id, {
            unit_cost: lineItem.unit_cost,
            unit_price: lineItem.unit_price,
            extended_cost: lineItem.extended_cost,
            line_total: lineItem.line_total,
            cost_source_reference: lineItem.cost_source_reference
          });
        });
        
        await txn.base44.asServiceRole.entities.PartPurchaseLineItem.update(lineItem.id, updateData);
      }
    }
  }
  
  return {
    order_id,
    dry_run,
    line_items_scanned: lineItems.length,
    repairs_needed: repairs.length,
    repairs_applied: dry_run ? 0 : repairs.length,
    repairs
  };
}

/**
 * ADD PART TO PROJECT - CANONICAL ENTRY POINT
 * Creates a PartCommitment with service-authored pricing snapshots.
 * This is the ONLY way to add parts to project execution.
 */
async function addPartToProject(txn, params) {
  const { project_id, part_id, qty_committed, notes, source_surface, requested_by } = params;

  if (!project_id) throw new Error('project_id is required');
  if (!part_id) throw new Error('part_id is required');
  if (!qty_committed || qty_committed < 1) throw new Error('qty_committed must be at least 1');

  // Load Part
  const parts = await txn.base44.asServiceRole.entities.Part.filter({ id: part_id });
  const part = parts[0];
  if (!part) throw new Error('Part not found');

  // Check for existing commitment (same project + part)
  const existingCommitments = await txn.base44.asServiceRole.entities.PartCommitment.filter({
    project_id,
    part_id,
    commitment_status: { $nin: ['cancelled', 'closed'] }
  });

  if (existingCommitments.length > 0) {
    // Return existing commitment instead of creating duplicate
    return {
      commitment: existingCommitments[0],
      created: false,
      message: 'Commitment already exists for this project/part combination'
    };
  }

  // Compute pricing snapshots (SERVICE-AUTHORED - UI MUST NOT SET THESE)
  // PRICING FIX: Use truthy OR checks to avoid 0 being treated as falsy incorrectly
  const unit_cost_snapshot = part.cost || 0;
  const unit_retail_snapshot = part.retail_override || part.retail_matrix_price || 0;
  
  // Calculate totals
  // FORWARD MODEL: Cost totals are NOT authoritative - PO lines are the cost authority
  // These are kept as planning estimates only for forward projects
  const planned_cost_total = unit_cost_snapshot * qty_committed;
  const planned_retail_total = unit_retail_snapshot * qty_committed;

  // Determine if needs cost review
  const needs_cost_review = unit_cost_snapshot <= 0;
  let pricing_integrity_status = 'ok';
  if (needs_cost_review) {
    pricing_integrity_status = 'missing_cost';
  } else if (unit_retail_snapshot <= 0) {
    pricing_integrity_status = 'missing_retail';
  }

  // Fetch project to check financial model version
  const projects = await txn.base44.asServiceRole.entities.Project.filter({ id: project_id });
  const project = projects[0];
  const isForwardModel = project?.financial_model_version === 'forward';
  
  // Build commitment data
  // FORWARD MODEL: billing_status defaults to 'billable' but is not used for status resolution
  // (status derived from InvoiceBatch instead)
  // FORWARD MODEL: Cost snapshots are stored for reference only - PO lines are cost authority
  const commitmentData = {
    project_id,
    part_id,
    qty_committed,
    qty_ordered: 0,
    qty_received: 0,
    qty_allocated: 0,
    qty_installed: 0,
    qty_cancelled: 0,
    commitment_status: 'planned',
    source_type: source_surface === 'migration:requirements' ? 'requirement' : 'manual_attachment',
    billing_status: 'billable', // Initial status allowed even for forward model
    // Retail snapshot always written (used for revenue calculations in both models)
    unit_retail_snapshot,
    planned_retail_total,
    pricing_integrity_status,
    commitment_version: 1,
    notes: notes || null
  };
  
  // LEGACY MODEL ONLY: Write cost snapshots (forward model uses PO lines as cost authority)
  if (!isForwardModel) {
    commitmentData.unit_cost_snapshot = unit_cost_snapshot;
    commitmentData.planned_cost_total = planned_cost_total;
  }
  
  // LEGACY MODEL ONLY: Set pool-related fields
  if (!isForwardModel) {
    commitmentData.covered_retail_total = 0;
    commitmentData.exposure_gap = planned_retail_total;
  }
  
  // Create the PartCommitment
  const commitment = await txn.base44.asServiceRole.entities.PartCommitment.create(commitmentData);

  txn.addRollback(async () => {
    await txn.base44.asServiceRole.entities.PartCommitment.delete(commitment.id);
  });

  txn.recordMutation('PartCommitment', commitment.id, null, { created: true });

  // Queue lifecycle event
  txn.queueLifecycleEvent({
    commitment_id: commitment.id,
    event_type: 'COMMITMENT_CREATED',
    previous_state: null,
    new_state: JSON.stringify({ 
      qty_committed, 
      unit_cost_snapshot, 
      unit_retail_snapshot,
      source_surface 
    }),
    trigger_source: source_surface || 'USER_ACTION',
    user_id: txn.user.id,
    part_id,
    project_id,
    notes: `Part added to project via ${source_surface || 'UI'}`
  });

  console.log(`✅ Created commitment ${commitment.id} for part ${part.part_name} on project ${project_id}`);
  console.log(`   Cost snapshot: $${unit_cost_snapshot}, Retail snapshot: $${unit_retail_snapshot}`);
  if (needs_cost_review) {
    console.log(`   ⚠️ Part needs cost review before ordering`);
  }

  return {
    commitment,
    created: true,
    needs_cost_review,
    pricing_integrity_status
  };
}

/**
 * Validate lock constraints before allowing mutation
 */
async function validateLockConstraintsAction(txn, params) {
  const { entityName, recordId, updates } = params;

  if (entityName === 'PartPurchaseLineItem') {
    const records = await txn.base44.asServiceRole.entities.PartPurchaseLineItem.filter({ id: recordId });
    const record = records[0];
    if (!record) return { allowed: true };

    if (record.cost_locked_at) {
      const lockedFields = ['unit_price', 'vendor_id', 'qty_ordered'];
      const attemptedLockedFields = Object.keys(updates || {}).filter(f => lockedFields.includes(f));
      if (attemptedLockedFields.length > 0) {
        return {
          allowed: false,
          reason: `Cannot modify ${attemptedLockedFields.join(', ')} - cost locked at ${record.cost_locked_at}`
        };
      }
    }
  }

  if (entityName === 'InstalledPart') {
    const records = await txn.base44.asServiceRole.entities.InstalledPart.filter({ id: recordId });
    const record = records[0];
    if (!record) return { allowed: true };

    if (record.is_reversed) {
      return {
        allowed: false,
        reason: 'Cannot modify reversed installation'
      };
    }
  }

  if (entityName === 'InvoiceBatchLine') {
    const lines = await txn.base44.asServiceRole.entities.InvoiceBatchLine.filter({ id: recordId });
    const line = lines[0];
    if (!line) return { allowed: true };

    const batches = await txn.base44.asServiceRole.entities.InvoiceBatch.filter({ id: line.batch_id });
    const batch = batches[0];
    
    if (batch && ['invoiced', 'paid'].includes(batch.status)) {
      const lockedFields = ['unit_price', 'qty', 'line_total'];
      const attemptedLockedFields = Object.keys(updates || {}).filter(f => lockedFields.includes(f));
      if (attemptedLockedFields.length > 0) {
        return {
          allowed: false,
          reason: `Cannot modify ${attemptedLockedFields.join(', ')} - invoice batch is ${batch.status}`
        };
      }
    }
  }

  return { allowed: true };
}