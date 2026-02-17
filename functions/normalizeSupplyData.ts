import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * MASTER NORMALIZATION FUNCTION
 * Repairs legacy pricing, recalculates commitments, reconciles pools
 * 
 * @param {boolean} dry_run - If true, only logs changes without writing
 */

// Deterministic pricing matrix
function applyPricingMatrix(cost) {
  if (cost === null || cost === undefined || cost <= 0) {
    return 0;
  }
  
  let retail;
  if (cost <= 50) {
    retail = cost * 2.2;
  } else if (cost <= 250) {
    retail = cost * 1.9;
  } else if (cost <= 1000) {
    retail = cost * 1.7;
  } else {
    retail = cost * 1.5;
  }
  
  return Math.round(retail);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run !== false; // Default to true for safety

    const report = {
      timestamp: new Date().toISOString(),
      dry_run,
      
      // Step 1: Part Pricing
      parts_scanned: 0,
      parts_fixed: 0,
      part_changes: [],
      
      // Step 2: Commitment Financial
      commitments_scanned: 0,
      commitments_recalculated: 0,
      commitment_changes: [],
      
      // Step 3: Lifecycle Quantity
      quantity_violations: [],
      quantity_fixes: 0,
      
      // Step 4: Pool Reconciliation
      pools_scanned: 0,
      pools_rebalanced: 0,
      pool_changes: [],
      credit_pool_violations: [],
      
      // Step 5: Orphan Checks
      orphan_records: {
        allocations_invalid_pool: [],
        allocations_invalid_commitment: [],
        installed_invalid_commitment: [],
        line_items_invalid_commitment: []
      },
      
      // Step 6: Requirement/Commitment Sync
      uncommitted_requirements: [],
      commitments_without_requirements: [],
      
      // Pricing Flags
      pricing_flags: {
        missing_cost: [],
        retail_below_cost: [],
        matrix_normalized: []
      }
    };

    // ========================================
    // FETCH ALL DATA
    // ========================================
    const [parts, commitments, pools, allocations, charges, installedParts, lineItems, requirements] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.BillingPool.list(),
      base44.asServiceRole.entities.PoolAllocation.list(),
      base44.asServiceRole.entities.PoolCharge.list(),
      base44.asServiceRole.entities.InstalledPart.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.PartProjectRequirement.list()
    ]);

    const partsMap = new Map(parts.map(p => [p.id, p]));
    const poolsMap = new Map(pools.map(p => [p.id, p]));
    const commitmentsMap = new Map(commitments.map(c => [c.id, c]));
    const requirementsMap = new Map(requirements.map(r => [r.id, r]));

    // ========================================
    // STEP 1: PART PRICING NORMALIZATION
    // ========================================
    report.parts_scanned = parts.length;
    
    for (const part of parts) {
      const updates = {};
      const flags = [];
      
      // Check cost
      if (part.default_cost === null || part.default_cost === undefined) {
        updates.default_cost = 0;
        flags.push('missing_cost');
        report.pricing_flags.missing_cost.push({ id: part.id, name: part.part_name });
      }
      
      const effectiveCost = updates.default_cost ?? part.default_cost ?? 0;
      
      // Check retail
      if (part.default_retail === null || part.default_retail === undefined) {
        updates.default_retail = applyPricingMatrix(effectiveCost);
        updates.pricing_mode = 'matrix';
        flags.push('matrix_normalized');
        report.pricing_flags.matrix_normalized.push({ id: part.id, name: part.part_name, new_retail: updates.default_retail });
      } else if (part.default_retail < effectiveCost && effectiveCost > 0) {
        updates.default_retail = effectiveCost;
        flags.push('retail_below_cost');
        report.pricing_flags.retail_below_cost.push({ id: part.id, name: part.part_name, old_retail: part.default_retail, new_retail: effectiveCost });
      }
      
      if (Object.keys(updates).length > 0) {
        report.parts_fixed++;
        report.part_changes.push({
          part_id: part.id,
          part_name: part.part_name,
          flags,
          changes: updates
        });
        
        if (!dry_run) {
          await base44.asServiceRole.entities.Part.update(part.id, updates);
        }
      }
    }

    // ========================================
    // STEP 2: COMMITMENT FINANCIAL REPAIR
    // ========================================
    report.commitments_scanned = commitments.length;
    
    // Build allocation lookup
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
      
      const updates = {};
      const diffs = [];
      
      // Get effective pricing (use updated values if available)
      const partChange = report.part_changes.find(c => c.part_id === part.id);
      const effectiveCost = partChange?.changes?.default_cost ?? part.default_cost ?? 0;
      const effectiveRetail = partChange?.changes?.default_retail ?? part.default_retail ?? 0;
      
      // Calculate planned_retail_total
      const qty = commitment.qty_committed || 0;
      const calculatedPlannedRetail = qty * (commitment.unit_retail_snapshot || effectiveRetail);
      
      if (Math.abs((commitment.planned_retail_total || 0) - calculatedPlannedRetail) > 0.01) {
        updates.planned_retail_total = calculatedPlannedRetail;
        diffs.push({ field: 'planned_retail_total', old: commitment.planned_retail_total, new: calculatedPlannedRetail });
      }
      
      // Calculate actual_extended_cost
      const calculatedExtendedCost = qty * (commitment.unit_cost_snapshot || effectiveCost);
      if (Math.abs((commitment.actual_extended_cost || 0) - calculatedExtendedCost) > 0.01) {
        updates.actual_extended_cost = calculatedExtendedCost;
        diffs.push({ field: 'actual_extended_cost', old: commitment.actual_extended_cost, new: calculatedExtendedCost });
      }
      
      // Calculate covered_retail_total from allocations
      const commitmentAllocations = allocationsByCommitment.get(commitment.id) || [];
      const calculatedCoveredRetail = commitmentAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
      
      if (Math.abs((commitment.covered_retail_total || 0) - calculatedCoveredRetail) > 0.01) {
        updates.covered_retail_total = calculatedCoveredRetail;
        diffs.push({ field: 'covered_retail_total', old: commitment.covered_retail_total, new: calculatedCoveredRetail });
      }
      
      // Calculate exposure_gap
      const plannedRetail = updates.planned_retail_total ?? commitment.planned_retail_total ?? 0;
      const coveredRetail = updates.covered_retail_total ?? commitment.covered_retail_total ?? 0;
      const calculatedExposure = Math.max(0, plannedRetail - coveredRetail);
      
      if (Math.abs((commitment.exposure_gap || 0) - calculatedExposure) > 0.01) {
        updates.exposure_gap = calculatedExposure;
        diffs.push({ field: 'exposure_gap', old: commitment.exposure_gap, new: calculatedExposure });
      }
      
      // Ensure unit snapshots exist
      if (!commitment.unit_retail_snapshot && effectiveRetail > 0) {
        updates.unit_retail_snapshot = effectiveRetail;
        diffs.push({ field: 'unit_retail_snapshot', old: null, new: effectiveRetail });
      }
      
      if (!commitment.unit_cost_snapshot && effectiveCost > 0) {
        updates.unit_cost_snapshot = effectiveCost;
        diffs.push({ field: 'unit_cost_snapshot', old: null, new: effectiveCost });
      }
      
      if (Object.keys(updates).length > 0) {
        report.commitments_recalculated++;
        report.commitment_changes.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part.part_name,
          diffs
        });
        
        if (!dry_run) {
          await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
        }
      }
    }

    // ========================================
    // STEP 3: PO / ORDER CONSISTENCY (Lifecycle Quantities)
    // ========================================
    for (const commitment of commitments) {
      if (commitment.commitment_status === 'cancelled') continue;
      
      const committed = commitment.qty_committed || 0;
      let ordered = commitment.qty_ordered || 0;
      let received = commitment.qty_received || 0;
      let installed = commitment.qty_installed || 0;
      
      const violations = [];
      const updates = {};
      
      // Enforce: installed ≤ received ≤ ordered ≤ committed
      if (ordered > committed) {
        violations.push({ type: 'ordered_exceeds_committed', ordered, committed });
        updates.qty_ordered = committed;
        ordered = committed;
      }
      
      if (received > ordered) {
        violations.push({ type: 'received_exceeds_ordered', received, ordered });
        updates.qty_received = ordered;
        received = ordered;
      }
      
      if (installed > received) {
        violations.push({ type: 'installed_exceeds_received', installed, received });
        updates.qty_installed = received;
        installed = received;
      }
      
      if (violations.length > 0) {
        report.quantity_violations.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_id: commitment.part_id,
          violations,
          fixes: updates
        });
        report.quantity_fixes++;
        
        if (!dry_run && Object.keys(updates).length > 0) {
          updates.integrity_warning = true;
          updates.integrity_warning_details = `Quantities adjusted: ${violations.map(v => v.type).join(', ')}`;
          await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
        }
      }
    }

    // ========================================
    // STEP 4: POOL RECONCILIATION
    // ========================================
    report.pools_scanned = pools.length;
    
    // Group by project for credit pool check
    const poolsByProject = new Map();
    
    for (const pool of pools) {
      // Track for credit pool validation
      const projectPools = poolsByProject.get(pool.project_id) || [];
      projectPools.push(pool);
      poolsByProject.set(pool.project_id, projectPools);
      
      // Calculate allocated_total
      const poolAllocations = allocations.filter(a => a.pool_id === pool.id && !a.is_reversed);
      const calculatedAllocated = poolAllocations.reduce((sum, a) => sum + (a.amount_allocated || 0), 0);
      
      // Calculate charges_total
      const poolCharges = charges.filter(c => c.pool_id === pool.id && !c.is_reversed);
      const calculatedCharges = poolCharges.reduce((sum, c) => sum + (c.amount || 0), 0);
      
      // Calculate balance
      const paidAmount = pool.paid_amount || pool.invoiced_amount || 0;
      const calculatedBalance = paidAmount - calculatedAllocated - calculatedCharges;
      
      const updates = {};
      const diffs = [];
      
      if (Math.abs((pool.allocated_total || 0) - calculatedAllocated) > 0.01) {
        updates.allocated_total = calculatedAllocated;
        diffs.push({ field: 'allocated_total', old: pool.allocated_total, new: calculatedAllocated });
      }
      
      if (Math.abs((pool.charges_total || 0) - calculatedCharges) > 0.01) {
        updates.charges_total = calculatedCharges;
        diffs.push({ field: 'charges_total', old: pool.charges_total, new: calculatedCharges });
      }
      
      if (Math.abs((pool.balance || 0) - calculatedBalance) > 0.01) {
        updates.balance = calculatedBalance;
        diffs.push({ field: 'balance', old: pool.balance, new: calculatedBalance });
      }
      
      // Check for overdrawn
      if (calculatedBalance < 0 && pool.status !== 'overdrawn' && pool.status !== 'closed') {
        updates.status = 'overdrawn';
        diffs.push({ field: 'status', old: pool.status, new: 'overdrawn' });
      }
      
      if (Object.keys(updates).length > 0) {
        report.pools_rebalanced++;
        report.pool_changes.push({
          pool_id: pool.id,
          pool_name: pool.pool_name,
          project_id: pool.project_id,
          diffs
        });
        
        if (!dry_run) {
          await base44.asServiceRole.entities.BillingPool.update(pool.id, updates);
        }
      }
    }
    
    // Check for multiple credit pools per project
    for (const [projectId, projectPools] of poolsByProject) {
      const activeCreditPools = projectPools.filter(p => 
        p.pool_name?.toLowerCase().includes('credit') && 
        p.status !== 'closed'
      );
      
      if (activeCreditPools.length > 1) {
        report.credit_pool_violations.push({
          project_id: projectId,
          credit_pool_count: activeCreditPools.length,
          pool_ids: activeCreditPools.map(p => p.id)
        });
      }
    }

    // ========================================
    // STEP 5: ORPHAN CHECKS
    // ========================================
    for (const alloc of allocations) {
      if (!poolsMap.has(alloc.pool_id)) {
        report.orphan_records.allocations_invalid_pool.push({
          allocation_id: alloc.id,
          invalid_pool_id: alloc.pool_id
        });
      }
      if (!commitmentsMap.has(alloc.commitment_id)) {
        report.orphan_records.allocations_invalid_commitment.push({
          allocation_id: alloc.id,
          invalid_commitment_id: alloc.commitment_id
        });
      }
    }
    
    for (const installed of installedParts) {
      if (installed.commitment_id && !commitmentsMap.has(installed.commitment_id)) {
        report.orphan_records.installed_invalid_commitment.push({
          installed_part_id: installed.id,
          invalid_commitment_id: installed.commitment_id
        });
      }
    }
    
    for (const lineItem of lineItems) {
      if (lineItem.commitment_id && !commitmentsMap.has(lineItem.commitment_id)) {
        report.orphan_records.line_items_invalid_commitment.push({
          line_item_id: lineItem.id,
          invalid_commitment_id: lineItem.commitment_id
        });
      }
    }

    // ========================================
    // STEP 6: REQUIREMENT / COMMITMENT SYNC
    // ========================================
    const commitmentsByRequirement = new Map();
    for (const c of commitments) {
      if (c.requirement_id) {
        commitmentsByRequirement.set(c.requirement_id, c);
      }
    }
    
    for (const req of requirements) {
      if (!commitmentsByRequirement.has(req.id)) {
        report.uncommitted_requirements.push({
          requirement_id: req.id,
          project_id: req.project_id,
          part_id: req.part_id
        });
      }
    }
    
    for (const commitment of commitments) {
      if (commitment.source_type === 'requirement' && commitment.requirement_id) {
        if (!requirementsMap.has(commitment.requirement_id)) {
          report.commitments_without_requirements.push({
            commitment_id: commitment.id,
            invalid_requirement_id: commitment.requirement_id
          });
        }
      }
    }

    // ========================================
    // SUMMARY
    // ========================================
    report.summary = {
      parts: { scanned: report.parts_scanned, fixed: report.parts_fixed },
      commitments: { scanned: report.commitments_scanned, recalculated: report.commitments_recalculated },
      quantities: { violations: report.quantity_violations.length, fixes: report.quantity_fixes },
      pools: { scanned: report.pools_scanned, rebalanced: report.pools_rebalanced },
      orphans: {
        allocations_invalid_pool: report.orphan_records.allocations_invalid_pool.length,
        allocations_invalid_commitment: report.orphan_records.allocations_invalid_commitment.length,
        installed_invalid_commitment: report.orphan_records.installed_invalid_commitment.length,
        line_items_invalid_commitment: report.orphan_records.line_items_invalid_commitment.length
      },
      sync: {
        uncommitted_requirements: report.uncommitted_requirements.length,
        commitments_without_requirements: report.commitments_without_requirements.length
      },
      credit_pool_violations: report.credit_pool_violations.length
    };

    return Response.json({
      success: true,
      dry_run,
      report
    });

  } catch (error) {
    console.error('Normalization error:', error);
    return Response.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});