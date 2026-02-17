import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SUPPLY INTEGRITY AUDIT
 * Read-only validation of supply chain data integrity
 * Returns PASS/FAIL for each integrity domain
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all data
    const [parts, commitments, pools, allocations, charges, installedParts, lineItems] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.BillingPool.list(),
      base44.asServiceRole.entities.PoolAllocation.list(),
      base44.asServiceRole.entities.PoolCharge.list(),
      base44.asServiceRole.entities.InstalledPart.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list()
    ]);

    const partsMap = new Map(parts.map(p => [p.id, p]));
    const poolsMap = new Map(pools.map(p => [p.id, p]));
    const commitmentsMap = new Map(commitments.map(c => [c.id, c]));

    const audit = {
      timestamp: new Date().toISOString(),
      
      pricingIntegrity: { status: 'PASS', violations: [] },
      commitmentTotalsIntegrity: { status: 'PASS', violations: [] },
      poolIntegrity: { status: 'PASS', violations: [] },
      lifecycleIntegrity: { status: 'PASS', violations: [] },
      orphanIntegrity: { status: 'PASS', violations: [] },
      
      readyForExecutionSurface: false
    };

    // ========================================
    // PRICING INTEGRITY
    // ========================================
    for (const part of parts) {
      if (part.default_cost === null || part.default_cost === undefined) {
        audit.pricingIntegrity.violations.push({
          type: 'part_missing_cost',
          part_id: part.id,
          part_name: part.part_name
        });
      }
    }
    
    // Build allocation lookup for commitment validation
    const allocationsByCommitment = new Map();
    for (const alloc of allocations) {
      if (alloc.is_reversed) continue;
      const existing = allocationsByCommitment.get(alloc.commitment_id) || [];
      existing.push(alloc);
      allocationsByCommitment.set(alloc.commitment_id, existing);
    }
    
    for (const commitment of commitments) {
      if (commitment.commitment_status === 'cancelled') continue;
      
      const part = partsMap.get(commitment.part_id);
      if (!part) continue;
      
      const qty = commitment.qty_committed || 0;
      const unitRetail = commitment.unit_retail_snapshot || part.default_retail || 0;
      const expectedPlannedRetail = qty * unitRetail;
      
      if (Math.abs((commitment.planned_retail_total || 0) - expectedPlannedRetail) > 1) {
        audit.pricingIntegrity.violations.push({
          type: 'commitment_planned_retail_mismatch',
          commitment_id: commitment.id,
          stored: commitment.planned_retail_total,
          expected: expectedPlannedRetail
        });
      }
    }
    
    if (audit.pricingIntegrity.violations.length > 0) {
      audit.pricingIntegrity.status = 'FAIL';
    }

    // ========================================
    // COMMITMENT TOTALS INTEGRITY
    // ========================================
    for (const commitment of commitments) {
      if (commitment.commitment_status === 'cancelled') continue;
      
      // Verify covered_retail_total matches allocations
      const commitmentAllocations = allocationsByCommitment.get(commitment.id) || [];
      const calculatedCovered = commitmentAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
      
      if (Math.abs((commitment.covered_retail_total || 0) - calculatedCovered) > 1) {
        audit.commitmentTotalsIntegrity.violations.push({
          type: 'covered_retail_mismatch',
          commitment_id: commitment.id,
          stored: commitment.covered_retail_total,
          calculated: calculatedCovered
        });
      }
      
      // Verify exposure_gap
      const plannedRetail = commitment.planned_retail_total || 0;
      const coveredRetail = commitment.covered_retail_total || 0;
      const expectedExposure = Math.max(0, plannedRetail - coveredRetail);
      
      if (Math.abs((commitment.exposure_gap || 0) - expectedExposure) > 1) {
        audit.commitmentTotalsIntegrity.violations.push({
          type: 'exposure_gap_mismatch',
          commitment_id: commitment.id,
          stored: commitment.exposure_gap,
          calculated: expectedExposure
        });
      }
    }
    
    if (audit.commitmentTotalsIntegrity.violations.length > 0) {
      audit.commitmentTotalsIntegrity.status = 'FAIL';
    }

    // ========================================
    // POOL INTEGRITY
    // ========================================
    const poolsByProject = new Map();
    
    for (const pool of pools) {
      // Track for credit pool check
      const projectPools = poolsByProject.get(pool.project_id) || [];
      projectPools.push(pool);
      poolsByProject.set(pool.project_id, projectPools);
      
      // Calculate expected balance
      const poolAllocations = allocations.filter(a => a.pool_id === pool.id && !a.is_reversed);
      const calculatedAllocated = poolAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
      
      const poolCharges = charges.filter(c => c.pool_id === pool.id && !c.is_reversed);
      const calculatedCharges = poolCharges.reduce((sum, c) => sum + (c.amount || 0), 0);
      
      const paidAmount = pool.paid_amount || pool.invoiced_amount || 0;
      const expectedBalance = paidAmount - calculatedAllocated - calculatedCharges;
      
      if (Math.abs((pool.balance || 0) - expectedBalance) > 1) {
        audit.poolIntegrity.violations.push({
          type: 'pool_balance_mismatch',
          pool_id: pool.id,
          pool_name: pool.pool_name,
          stored: pool.balance,
          calculated: expectedBalance
        });
      }
      
      if (Math.abs((pool.allocated_total || 0) - calculatedAllocated) > 1) {
        audit.poolIntegrity.violations.push({
          type: 'pool_allocated_mismatch',
          pool_id: pool.id,
          stored: pool.allocated_total,
          calculated: calculatedAllocated
        });
      }
    }
    
    // Check for multiple credit pools per project
    for (const [projectId, projectPools] of poolsByProject) {
      const activeCreditPools = projectPools.filter(p => 
        p.pool_name?.toLowerCase().includes('credit') && 
        p.status !== 'closed'
      );
      
      if (activeCreditPools.length > 1) {
        audit.poolIntegrity.violations.push({
          type: 'multiple_credit_pools',
          project_id: projectId,
          count: activeCreditPools.length
        });
      }
    }
    
    if (audit.poolIntegrity.violations.length > 0) {
      audit.poolIntegrity.status = 'FAIL';
    }

    // ========================================
    // LIFECYCLE INTEGRITY
    // ========================================
    for (const commitment of commitments) {
      if (commitment.commitment_status === 'cancelled') continue;
      
      const committed = commitment.qty_committed || 0;
      const ordered = commitment.qty_ordered || 0;
      const received = commitment.qty_received || 0;
      const installed = commitment.qty_installed || 0;
      
      if (installed > received) {
        audit.lifecycleIntegrity.violations.push({
          type: 'installed_exceeds_received',
          commitment_id: commitment.id,
          installed,
          received
        });
      }
      
      if (received > ordered) {
        audit.lifecycleIntegrity.violations.push({
          type: 'received_exceeds_ordered',
          commitment_id: commitment.id,
          received,
          ordered
        });
      }
      
      if (ordered > committed) {
        audit.lifecycleIntegrity.violations.push({
          type: 'ordered_exceeds_committed',
          commitment_id: commitment.id,
          ordered,
          committed
        });
      }
    }
    
    if (audit.lifecycleIntegrity.violations.length > 0) {
      audit.lifecycleIntegrity.status = 'FAIL';
    }

    // ========================================
    // ORPHAN INTEGRITY
    // ========================================
    for (const alloc of allocations) {
      if (!poolsMap.has(alloc.pool_id)) {
        audit.orphanIntegrity.violations.push({
          type: 'allocation_invalid_pool',
          allocation_id: alloc.id,
          pool_id: alloc.pool_id
        });
      }
      if (!commitmentsMap.has(alloc.commitment_id)) {
        audit.orphanIntegrity.violations.push({
          type: 'allocation_invalid_commitment',
          allocation_id: alloc.id,
          commitment_id: alloc.commitment_id
        });
      }
    }
    
    for (const installed of installedParts) {
      if (installed.commitment_id && !commitmentsMap.has(installed.commitment_id)) {
        audit.orphanIntegrity.violations.push({
          type: 'installed_invalid_commitment',
          installed_part_id: installed.id,
          commitment_id: installed.commitment_id
        });
      }
    }
    
    for (const lineItem of lineItems) {
      if (lineItem.commitment_id && !commitmentsMap.has(lineItem.commitment_id)) {
        audit.orphanIntegrity.violations.push({
          type: 'line_item_invalid_commitment',
          line_item_id: lineItem.id,
          commitment_id: lineItem.commitment_id
        });
      }
    }
    
    if (audit.orphanIntegrity.violations.length > 0) {
      audit.orphanIntegrity.status = 'FAIL';
    }

    // ========================================
    // DETERMINE READINESS
    // ========================================
    audit.readyForExecutionSurface = 
      audit.pricingIntegrity.status === 'PASS' &&
      audit.commitmentTotalsIntegrity.status === 'PASS' &&
      audit.poolIntegrity.status === 'PASS' &&
      audit.lifecycleIntegrity.status === 'PASS' &&
      audit.orphanIntegrity.status === 'PASS';

    // Summary counts
    audit.summary = {
      pricingIntegrity: `${audit.pricingIntegrity.status} (${audit.pricingIntegrity.violations.length} issues)`,
      commitmentTotalsIntegrity: `${audit.commitmentTotalsIntegrity.status} (${audit.commitmentTotalsIntegrity.violations.length} issues)`,
      poolIntegrity: `${audit.poolIntegrity.status} (${audit.poolIntegrity.violations.length} issues)`,
      lifecycleIntegrity: `${audit.lifecycleIntegrity.status} (${audit.lifecycleIntegrity.violations.length} issues)`,
      orphanIntegrity: `${audit.orphanIntegrity.status} (${audit.orphanIntegrity.violations.length} issues)`,
      readyForExecutionSurface: audit.readyForExecutionSurface
    };

    return Response.json({
      success: true,
      audit
    });

  } catch (error) {
    console.error('Audit error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});