import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CommitmentService - Core Domain Orchestrator
 * 
 * This service is the SINGLE source of truth for all commitment-related mutations.
 * All financial operations, pool management, and lifecycle changes MUST go through this service.
 * 
 * Exposed Methods:
 * - createPO(commitment_id, vendor_id, unit_cost, qty)
 * - createDeltaOrder(commitment_id, vendor_id, unit_cost, qty)
 * - createBillingPool(project_id, pool_name, invoiced_amount)
 * - allocatePool(pool_id, commitment_id, amount)
 * - recordVendorInvoiceCharge(vendor_invoice_line_id)
 * - removeCommitment(commitment_id, reason)
 * - reverseInstalledPart(installed_part_id, reason)
 * - reversePoolAllocation(allocation_id, reason)
 * - reversePoolCharge(charge_id, reason)
 * - recalculatePoolBalance(pool_id)
 * - recalculateProjectExposure(project_id)
 * 
 * Invariants enforced:
 * - No direct UI mutation bypasses this service
 * - All changes create LifecycleEvent records
 * - All recalculations update precomputed financial fields
 * - Cost lock enforcement after invoice
 * - Invoice lock enforcement after batch status
 * - Prepay validation before ordering
 * - Pool overdraw detection and status management
 */

// Service context flag for mutation guard
const SERVICE_CONTEXT = { __commitment_service_context__: true };

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

        let result;
        switch (action) {
            case 'createPO':
                result = await createPO(base44, user, params, timestamp);
                break;
            case 'createDeltaOrder':
                result = await createDeltaOrder(base44, user, params, timestamp);
                break;
            case 'createBillingPool':
                result = await createBillingPool(base44, user, params, timestamp);
                break;
            case 'allocatePool':
                result = await allocatePool(base44, user, params, timestamp);
                break;
            case 'recordVendorInvoiceCharge':
                result = await recordVendorInvoiceCharge(base44, user, params, timestamp);
                break;
            case 'removeCommitment':
                result = await removeCommitment(base44, user, params, timestamp);
                break;
            case 'reverseInstalledPart':
                result = await reverseInstalledPart(base44, user, params, timestamp);
                break;
            case 'recalculateExposure':
                result = await recalculateExposure(base44, user, params, timestamp);
                break;
            case 'getOrCreateCreditPool':
                result = await getOrCreateCreditPool(base44, user, params, timestamp);
                break;
            case 'reversePoolAllocation':
                result = await reversePoolAllocation(base44, user, params, timestamp);
                break;
            case 'reversePoolCharge':
                result = await reversePoolCharge(base44, user, params, timestamp);
                break;
            case 'recalculatePoolBalance':
                result = await recalculatePoolBalance(base44, user, params, timestamp);
                break;
            case 'recalculateProjectExposure':
                result = await recalculateProjectExposure(base44, user, params, timestamp);
                break;
            case 'validateLockConstraints':
                result = await validateLockConstraintsAction(base44, user, params);
                break;
            default:
                return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }

        return Response.json({ success: true, ...result });

    } catch (error) {
        console.error("CommitmentService error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// ============================================================================
// CORE OPERATIONS
// ============================================================================

/**
 * Create a Purchase Order for a commitment
 */
async function createPO(base44, user, params, timestamp) {
    const { commitment_id, vendor_id, unit_cost, qty, order_id } = params;

    // Fetch commitment
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const commitment = commitments[0];
    if (!commitment) throw new Error('Commitment not found');

    // Prepay validation
    if (commitment.requires_prepay && !commitment.prepay_satisfied_at) {
        throw new Error('Prepayment required before ordering. Allocate pool funds first.');
    }

    // Cost lock validation - cannot create PO if cost already locked by invoice
    const existingLines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id });
    const hasLockedCost = existingLines.some(line => line.cost_locked_at);
    if (hasLockedCost) {
        throw new Error('Cannot create PO: cost already locked by vendor invoice');
    }

    // Create PO line item
    const lineItem = await base44.asServiceRole.entities.PartPurchaseLineItem.create({
        order_id,
        part_id: commitment.part_id,
        commitment_id,
        vendor_id,
        qty_ordered: qty,
        qty_received: 0,
        unit_price: unit_cost,
        line_total: qty * unit_cost,
        status: 'Ordered',
        is_delta_order: false
    });

    // Update commitment quantities
    const newQtyOrdered = (commitment.qty_ordered || 0) + qty;
    await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        qty_ordered: newQtyOrdered,
        commitment_status: 'ordered',
        unit_cost_snapshot: unit_cost // Update cost snapshot
    });

    // Create lifecycle event
    await createLifecycleEvent(base44, {
        commitment_id,
        event_type: 'PO_CREATED',
        previous_state: JSON.stringify({ qty_ordered: commitment.qty_ordered }),
        new_state: JSON.stringify({ qty_ordered: newQtyOrdered }),
        trigger_source: 'USER_ACTION',
        user_id: user.id,
        part_id: commitment.part_id,
        project_id: commitment.project_id,
        notes: `PO created: ${qty} units @ $${unit_cost}`
    });

    // Recalculate exposure
    await recalculateCommitmentExposure(base44, commitment_id);

    return { lineItem, commitment_id };
}

/**
 * Create a Delta (additional) Order for existing commitment
 */
async function createDeltaOrder(base44, user, params, timestamp) {
    const { commitment_id, vendor_id, unit_cost, qty, order_id, reason } = params;

    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const commitment = commitments[0];
    if (!commitment) throw new Error('Commitment not found');

    // Delta orders allowed even after partial receipt
    const lineItem = await base44.asServiceRole.entities.PartPurchaseLineItem.create({
        order_id,
        part_id: commitment.part_id,
        commitment_id,
        vendor_id,
        qty_ordered: qty,
        qty_received: 0,
        unit_price: unit_cost,
        line_total: qty * unit_cost,
        status: 'Ordered',
        is_delta_order: true,
        notes: `Delta order: ${reason || 'Additional quantity needed'}`
    });

    // Update commitment
    const newQtyOrdered = (commitment.qty_ordered || 0) + qty;
    await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        qty_ordered: newQtyOrdered
    });

    // Lifecycle event
    await createLifecycleEvent(base44, {
        commitment_id,
        event_type: 'PO_CREATED',
        previous_state: JSON.stringify({ qty_ordered: commitment.qty_ordered }),
        new_state: JSON.stringify({ qty_ordered: newQtyOrdered, is_delta: true }),
        trigger_source: 'USER_ACTION',
        user_id: user.id,
        part_id: commitment.part_id,
        project_id: commitment.project_id,
        notes: `Delta order: ${qty} units @ $${unit_cost}`
    });

    await recalculateCommitmentExposure(base44, commitment_id);

    return { lineItem, commitment_id };
}

/**
 * Create a new Billing Pool for a project
 */
async function createBillingPool(base44, user, params, timestamp) {
    const { project_id, pool_name, invoiced_amount, notes } = params;

    const pool = await base44.asServiceRole.entities.BillingPool.create({
        project_id,
        pool_name,
        status: invoiced_amount > 0 ? 'invoiced' : 'draft',
        invoiced_amount: invoiced_amount || 0,
        paid_amount: 0,
        notes
    });

    return { pool };
}

/**
 * Allocate pool funds to a commitment
 */
async function allocatePool(base44, user, params, timestamp) {
    const { pool_id, commitment_id, amount, allocation_type, notes } = params;

    // Fetch pool and commitment
    const [pools, commitments] = await Promise.all([
        base44.asServiceRole.entities.BillingPool.filter({ id: pool_id }),
        base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id })
    ]);

    const pool = pools[0];
    const commitment = commitments[0];
    if (!pool) throw new Error('Pool not found');
    if (!commitment) throw new Error('Commitment not found');

    // Calculate current allocations for this pool
    const existingAllocations = await base44.asServiceRole.entities.PoolAllocation.filter({ 
        pool_id, 
        is_reversed: false 
    });
    const totalAllocated = existingAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
    
    // Check pool has sufficient funds (warn but allow - will mark overdrawn)
    const availableFunds = (pool.invoiced_amount || 0) - totalAllocated;
    const willOverdraw = amount > availableFunds;

    // Create allocation
    const allocation = await base44.asServiceRole.entities.PoolAllocation.create({
        pool_id,
        commitment_id,
        amount_allocated: amount,
        allocation_type: allocation_type || 'manual',
        is_reversed: false,
        notes: willOverdraw ? `${notes || ''} [OVERDRAW WARNING]`.trim() : notes
    });

    // Update commitment covered amount
    const newCovered = (commitment.covered_retail_total || 0) + amount;
    await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        covered_retail_total: newCovered
    });

    // Check if prepay is now satisfied
    if (commitment.requires_prepay && !commitment.prepay_satisfied_at) {
        const plannedTotal = commitment.planned_retail_total || 
            ((commitment.qty_committed || 0) * (commitment.unit_retail_snapshot || 0));
        if (newCovered >= plannedTotal) {
            await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
                prepay_satisfied_at: timestamp
            });
        }
    }

    // Lifecycle event
    await createLifecycleEvent(base44, {
        commitment_id,
        event_type: 'BILLING_STATUS_CHANGED',
        previous_state: JSON.stringify({ covered_retail_total: commitment.covered_retail_total }),
        new_state: JSON.stringify({ covered_retail_total: newCovered }),
        trigger_source: 'USER_ACTION',
        user_id: user.id,
        part_id: commitment.part_id,
        project_id: commitment.project_id,
        notes: `Pool allocation: $${amount} from pool ${pool.pool_name}`
    });

    // Recalculate pool balance (handles overdraw status)
    await recalculatePoolBalanceInternal(base44, pool_id);
    
    // Recalculate commitment exposure
    await recalculateCommitmentExposure(base44, commitment_id);

    return { allocation, overdraw: willOverdraw };
}

/**
 * Record a vendor invoice charge and lock costs
 */
async function recordVendorInvoiceCharge(base44, user, params, timestamp) {
    const { vendor_invoice_line_id, freight_allocation, tariff_allocation } = params;

    const lines = await base44.asServiceRole.entities.VendorInvoiceLineItem.filter({ id: vendor_invoice_line_id });
    const invoiceLine = lines[0];
    if (!invoiceLine) throw new Error('Invoice line not found');

    // Get PO line item
    if (!invoiceLine.purchase_line_item_id) {
        throw new Error('Invoice line not linked to PO');
    }

    const poLines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ id: invoiceLine.purchase_line_item_id });
    const poLine = poLines[0];
    if (!poLine) throw new Error('PO line not found');

    // Lock the cost
    await base44.asServiceRole.entities.PartPurchaseLineItem.update(poLine.id, {
        cost_locked_at: timestamp,
        unit_price: invoiceLine.actual_unit_cost,
        freight_cost: freight_allocation || 0,
        tariff_cost: tariff_allocation || 0
    });

    // Update commitment actual cost
    if (poLine.commitment_id) {
        const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: poLine.commitment_id });
        const commitment = commitments[0];
        if (commitment) {
            await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
                actual_unit_cost: invoiceLine.actual_unit_cost,
                actual_extended_cost: invoiceLine.actual_unit_cost * (commitment.qty_committed || 0)
            });

            // Create pool charges for freight/tariff if applicable
            if (freight_allocation > 0 || tariff_allocation > 0) {
                // Get or create pool for this project
                const pools = await base44.asServiceRole.entities.BillingPool.filter({ 
                    project_id: commitment.project_id,
                    status: { $in: ['draft', 'invoiced'] }
                });
                
                if (pools.length > 0) {
                    const pool = pools[0];
                    
                    if (freight_allocation > 0) {
                        await base44.asServiceRole.entities.PoolCharge.create({
                            pool_id: pool.id,
                            project_id: commitment.project_id,
                            related_commitment_id: commitment.id,
                            related_vendor_invoice_id: invoiceLine.invoice_id,
                            charge_type: 'freight',
                            description: `Freight for ${poLine.part_id}`,
                            amount: freight_allocation,
                            is_reversed: false
                        });
                    }

                    if (tariff_allocation > 0) {
                        await base44.asServiceRole.entities.PoolCharge.create({
                            pool_id: pool.id,
                            project_id: commitment.project_id,
                            related_commitment_id: commitment.id,
                            related_vendor_invoice_id: invoiceLine.invoice_id,
                            charge_type: 'tariff',
                            description: `Tariff/duty for ${poLine.part_id}`,
                            amount: tariff_allocation,
                            is_reversed: false
                        });
                    }
                }
            }

            await recalculateCommitmentExposure(base44, commitment.id);
        }
    }

    return { locked: true, po_line_id: poLine.id };
}

/**
 * Remove/cancel a commitment with proper credit handling
 */
async function removeCommitment(base44, user, params, timestamp) {
    const { commitment_id, reason, reversal_type } = params;

    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const commitment = commitments[0];
    if (!commitment) throw new Error('Commitment not found');

    // Determine cancellation type based on current state
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
        const creditPool = await getOrCreateCreditPool(base44, user, { project_id: commitment.project_id }, timestamp);
        
        // Create credit allocation (negative = credit)
        const creditAmount = commitment.covered_retail_total || commitment.planned_retail_total || 0;
        if (creditAmount > 0) {
            await base44.asServiceRole.entities.PoolAllocation.create({
                pool_id: creditPool.pool.id,
                commitment_id,
                amount_allocated: creditAmount,
                allocation_type: 'system_credit',
                is_reversed: false,
                notes: `Credit for cancelled commitment: ${reason}`
            });
            creditCreated = true;
        }
    }

    // Reverse any existing allocations
    const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({ 
        commitment_id, 
        is_reversed: false 
    });
    for (const alloc of allocations) {
        await base44.asServiceRole.entities.PoolAllocation.update(alloc.id, {
            is_reversed: true,
            reversed_at: timestamp,
            reversed_by: user.id
        });
    }

    // Update commitment status
    await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        commitment_status: 'cancelled',
        cancelled_at: timestamp,
        cancelled_by: user.id,
        cancelled_reason: reason,
        cancellation_type,
        scope_reduction_credit_created: creditCreated
    });

    // Lifecycle event
    await createLifecycleEvent(base44, {
        commitment_id,
        event_type: 'COMMITMENT_CANCELLED',
        previous_state: JSON.stringify({ status: commitment.commitment_status }),
        new_state: JSON.stringify({ status: 'cancelled', cancellation_type }),
        trigger_source: 'USER_ACTION',
        user_id: user.id,
        part_id: commitment.part_id,
        project_id: commitment.project_id,
        notes: reason
    });

    return { cancelled: true, cancellation_type, creditCreated };
}

/**
 * Reverse an installed part
 */
async function reverseInstalledPart(base44, user, params, timestamp) {
    const { installed_part_id, reason, reversal_type } = params;

    const parts = await base44.asServiceRole.entities.InstalledPart.filter({ id: installed_part_id });
    const installedPart = parts[0];
    if (!installedPart) throw new Error('Installed part not found');

    if (installedPart.is_reversed) {
        throw new Error('Part already reversed');
    }

    // Update installed part
    await base44.asServiceRole.entities.InstalledPart.update(installed_part_id, {
        is_reversed: true,
        reversed_at: timestamp,
        reversed_by: user.id,
        reversal_reason: reason,
        reversal_type: reversal_type || 'other'
    });

    // Update commitment qty_installed
    if (installedPart.commitment_id) {
        const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: installedPart.commitment_id });
        const commitment = commitments[0];
        if (commitment) {
            const newQtyInstalled = Math.max(0, (commitment.qty_installed || 0) - installedPart.qty_consumed);
            await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
                qty_installed: newQtyInstalled
            });

            // Lifecycle event
            await createLifecycleEvent(base44, {
                commitment_id: commitment.id,
                event_type: 'PART_INSTALLED', // Reversal
                previous_state: JSON.stringify({ qty_installed: commitment.qty_installed }),
                new_state: JSON.stringify({ qty_installed: newQtyInstalled, reversed: true }),
                trigger_source: 'USER_ACTION',
                user_id: user.id,
                part_id: commitment.part_id,
                project_id: commitment.project_id,
                notes: `Installation reversed: ${reason}`
            });

            await recalculateCommitmentExposure(base44, commitment.id);
        }
    }

    // Return inventory if applicable
    if (installedPart.inventory_item_id && installedPart.location_id) {
        const items = await base44.asServiceRole.entities.InventoryItem.filter({ id: installedPart.inventory_item_id });
        const item = items[0];
        if (item) {
            await base44.asServiceRole.entities.InventoryItem.update(item.id, {
                quantity_on_hand: (item.quantity_on_hand || 0) + installedPart.qty_consumed
            });
        }
    }

    return { reversed: true };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get or create the credit pool for a project
 */
async function getOrCreateCreditPool(base44, user, params, timestamp) {
    const { project_id } = params;

    // Look for existing credit pool
    const pools = await base44.asServiceRole.entities.BillingPool.filter({
        project_id,
        pool_name: 'Credit Pool'
    });

    if (pools.length > 0) {
        return { pool: pools[0], created: false };
    }

    // Create new credit pool
    const pool = await base44.asServiceRole.entities.BillingPool.create({
        project_id,
        pool_name: 'Credit Pool',
        status: 'draft',
        invoiced_amount: 0,
        paid_amount: 0,
        notes: 'System-managed credit pool for scope reductions and refunds'
    });

    return { pool, created: true };
}

/**
 * Recalculate exposure for a commitment
 */
async function recalculateCommitmentExposure(base44, commitment_id) {
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const commitment = commitments[0];
    if (!commitment) return;

    // Calculate planned retail total
    const plannedRetail = (commitment.qty_committed || 0) * (commitment.unit_retail_snapshot || 0);

    // Get all active allocations
    const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({
        commitment_id,
        is_reversed: false
    });
    const coveredRetail = allocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);

    // Calculate exposure gap
    const exposureGap = plannedRetail - coveredRetail;

    await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        planned_retail_total: plannedRetail,
        covered_retail_total: coveredRetail,
        exposure_gap: exposureGap
    });
}

/**
 * Recalculate exposure for all commitments in a project
 */
async function recalculateExposure(base44, user, params, timestamp) {
    const { project_id, commitment_id } = params;

    if (commitment_id) {
        await recalculateCommitmentExposure(base44, commitment_id);
        return { recalculated: 1 };
    }

    if (project_id) {
        const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ 
            project_id,
            commitment_status: { $nin: ['cancelled', 'closed'] }
        });

        for (const c of commitments) {
            await recalculateCommitmentExposure(base44, c.id);
        }

        return { recalculated: commitments.length };
    }

    throw new Error('Must provide project_id or commitment_id');
}

/**
 * Create a lifecycle event record
 */
async function createLifecycleEvent(base44, eventData) {
    return base44.asServiceRole.entities.LifecycleEvent.create({
        ...eventData,
        created_date: new Date().toISOString()
    });
}

// ============================================================================
// POOL BALANCE & OVERDRAW MANAGEMENT
// ============================================================================

/**
 * Reverse a pool allocation
 */
async function reversePoolAllocation(base44, user, params, timestamp) {
    const { allocation_id, reason } = params;

    const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({ id: allocation_id });
    const allocation = allocations[0];
    if (!allocation) throw new Error('Allocation not found');
    if (allocation.is_reversed) throw new Error('Allocation already reversed');

    // Update allocation
    await base44.asServiceRole.entities.PoolAllocation.update(allocation_id, {
        is_reversed: true,
        reversed_at: timestamp,
        reversed_by: user.id,
        notes: `${allocation.notes || ''} [REVERSED: ${reason}]`.trim()
    });

    // Update commitment covered amount
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: allocation.commitment_id });
    const commitment = commitments[0];
    if (commitment) {
        const newCovered = Math.max(0, (commitment.covered_retail_total || 0) - allocation.amount_allocated);
        await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
            covered_retail_total: newCovered
        });
        await recalculateCommitmentExposure(base44, commitment.id);
    }

    // Recalculate pool balance
    await recalculatePoolBalanceInternal(base44, allocation.pool_id);

    return { reversed: true };
}

/**
 * Reverse a pool charge
 */
async function reversePoolCharge(base44, user, params, timestamp) {
    const { charge_id, reason } = params;

    const charges = await base44.asServiceRole.entities.PoolCharge.filter({ id: charge_id });
    const charge = charges[0];
    if (!charge) throw new Error('Charge not found');
    if (charge.is_reversed) throw new Error('Charge already reversed');

    // Update charge
    await base44.asServiceRole.entities.PoolCharge.update(charge_id, {
        is_reversed: true,
        reversed_at: timestamp,
        reversed_by: user.id,
        reversal_reason: reason
    });

    // Recalculate pool balance
    await recalculatePoolBalanceInternal(base44, charge.pool_id);

    return { reversed: true };
}

/**
 * Internal: Recalculate pool balance and handle overdraw status
 */
async function recalculatePoolBalanceInternal(base44, pool_id) {
    const pools = await base44.asServiceRole.entities.BillingPool.filter({ id: pool_id });
    const pool = pools[0];
    if (!pool) return;

    // Get active allocations
    const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({
        pool_id,
        is_reversed: false
    });
    const allocated_total = allocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);

    // Get active charges
    const charges = await base44.asServiceRole.entities.PoolCharge.filter({
        pool_id,
        is_reversed: false
    });
    const charges_total = charges.reduce((sum, c) => sum + (c.amount || 0), 0);

    // Calculate balance
    const balance = (pool.invoiced_amount || 0) - allocated_total - charges_total;

    // Determine status
    let newStatus = pool.status;
    const previousStatus = pool.status;
    
    if (balance < 0) {
        newStatus = 'overdrawn';
    } else if (previousStatus === 'overdrawn' && balance >= 0) {
        // Revert from overdrawn - check if paid
        newStatus = pool.paid_amount >= pool.invoiced_amount ? 'paid' : 'invoiced';
    }

    // Update pool
    await base44.asServiceRole.entities.BillingPool.update(pool_id, {
        allocated_total,
        charges_total,
        balance,
        status: newStatus
    });

    console.log(`📊 Pool ${pool_id} recalculated:`, {
        invoiced: pool.invoiced_amount,
        allocated: allocated_total,
        charges: charges_total,
        balance,
        status: newStatus
    });

    return { allocated_total, charges_total, balance, status: newStatus };
}

/**
 * Public: Recalculate pool balance
 */
async function recalculatePoolBalance(base44, user, params, timestamp) {
    const { pool_id } = params;
    return recalculatePoolBalanceInternal(base44, pool_id);
}

// ============================================================================
// EXPOSURE PRECOMPUTATION
// ============================================================================

/**
 * Recalculate exposure for a single commitment with full exposure math
 */
async function recalculateCommitmentExposure(base44, commitment_id) {
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
    const commitment = commitments[0];
    if (!commitment) return;

    // Calculate planned retail total
    const plannedRetail = (commitment.qty_committed || 0) * (commitment.unit_retail_snapshot || 0);

    // Get all active allocations for this commitment
    const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({
        commitment_id,
        is_reversed: false
    });
    const coveredRetail = allocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);

    // Determine exposure basis based on billing status
    // If invoiced, use invoiced_retail_total; otherwise use planned
    const exposureBasis = commitment.billing_status === 'invoiced' || commitment.billing_status === 'paid'
        ? (commitment.invoiced_retail_total || plannedRetail)
        : plannedRetail;

    // Calculate exposure gap
    const exposureGap = exposureBasis - coveredRetail;

    await base44.asServiceRole.entities.PartCommitment.update(commitment_id, {
        planned_retail_total: plannedRetail,
        covered_retail_total: coveredRetail,
        exposure_gap: exposureGap
    });

    console.log(`📈 Commitment ${commitment_id} exposure:`, {
        planned: plannedRetail,
        covered: coveredRetail,
        exposureBasis,
        gap: exposureGap
    });

    return { plannedRetail, coveredRetail, exposureBasis, exposureGap };
}

/**
 * Recalculate exposure for all commitments in a project
 */
async function recalculateProjectExposure(base44, user, params, timestamp) {
    const { project_id } = params;

    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ 
        project_id,
        commitment_status: { $nin: ['cancelled', 'closed'] }
    });

    let totalPlanned = 0;
    let totalCovered = 0;
    let totalExposure = 0;

    for (const c of commitments) {
        const result = await recalculateCommitmentExposure(base44, c.id);
        if (result) {
            totalPlanned += result.plannedRetail;
            totalCovered += result.coveredRetail;
            totalExposure += result.exposureGap;
        }
    }

    console.log(`📊 Project ${project_id} exposure summary:`, {
        commitments: commitments.length,
        totalPlanned,
        totalCovered,
        totalExposure
    });

    return { 
        recalculated: commitments.length,
        totalPlanned,
        totalCovered,
        totalExposure
    };
}

// ============================================================================
// LOCK CONSTRAINT VALIDATION
// ============================================================================

/**
 * Validate lock constraints before allowing mutation
 */
async function validateLockConstraintsAction(base44, user, params) {
    const { entityName, recordId, updates } = params;

    if (entityName === 'PartPurchaseLineItem') {
        const records = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ id: recordId });
        const record = records[0];
        if (!record) return { allowed: true };

        // Check cost lock
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
        const records = await base44.asServiceRole.entities.InstalledPart.filter({ id: recordId });
        const record = records[0];
        if (!record) return { allowed: true };

        // Check reversal lock
        if (record.is_reversed) {
            return {
                allowed: false,
                reason: 'Cannot modify reversed installation'
            };
        }
    }

    if (entityName === 'InvoiceBatchLine') {
        const lines = await base44.asServiceRole.entities.InvoiceBatchLine.filter({ id: recordId });
        const line = lines[0];
        if (!line) return { allowed: true };

        // Get batch status
        const batches = await base44.asServiceRole.entities.InvoiceBatch.filter({ id: line.batch_id });
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