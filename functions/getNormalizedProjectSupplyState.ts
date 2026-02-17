import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * NORMALIZED PROJECT SUPPLY STATE
 * Canonical read model for execution surface
 * All values are pre-calculated - UI renders only
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

    const body = await req.json().catch(() => ({}));
    const { project_id } = body;
    
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Fetch all project-related data
    const [project, commitments, pools, allocations, charges, parts, lineItems, installedParts] = await Promise.all([
      base44.asServiceRole.entities.Project.filter({ id: project_id }),
      base44.asServiceRole.entities.PartCommitment.filter({ project_id }),
      base44.asServiceRole.entities.BillingPool.filter({ project_id }),
      base44.asServiceRole.entities.PoolAllocation.list(),
      base44.asServiceRole.entities.PoolCharge.filter({ project_id }),
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.InstalledPart.filter({ project_id })
    ]);

    if (!project.length) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const partsMap = new Map(parts.map(p => [p.id, p]));
    const poolsMap = new Map(pools.map(p => [p.id, p]));
    
    // Filter allocations to this project's pools
    const projectPoolIds = new Set(pools.map(p => p.id));
    const projectAllocations = allocations.filter(a => projectPoolIds.has(a.pool_id) && !a.is_reversed);
    
    // Build allocation lookup by commitment
    const allocationsByCommitment = new Map();
    for (const alloc of projectAllocations) {
      const existing = allocationsByCommitment.get(alloc.commitment_id) || [];
      existing.push(alloc);
      allocationsByCommitment.set(alloc.commitment_id, existing);
    }

    // ========================================
    // PROCESS COMMITMENTS
    // ========================================
    const activeCommitments = commitments.filter(c => c.commitment_status !== 'cancelled');
    
    const normalizedCommitments = activeCommitments.map(commitment => {
      const part = partsMap.get(commitment.part_id);
      const commitmentAllocations = allocationsByCommitment.get(commitment.id) || [];
      
      // Use stored calculated values (set by normalizeSupplyData)
      const planned_retail = commitment.planned_retail_total || 0;
      const covered_retail = commitment.covered_retail_total || 0;
      const exposure = commitment.exposure_gap || 0;
      
      // Derive lifecycle state from quantities
      const qty = {
        committed: commitment.qty_committed || 0,
        ordered: commitment.qty_ordered || 0,
        received: commitment.qty_received || 0,
        installed: commitment.qty_installed || 0
      };
      
      let lifecycle_state = 'planned';
      if (qty.installed >= qty.committed && qty.committed > 0) {
        lifecycle_state = 'installed';
      } else if (qty.received > 0) {
        lifecycle_state = qty.received >= qty.ordered ? 'received' : 'partially_received';
      } else if (qty.ordered > 0) {
        lifecycle_state = 'ordered';
      }
      
      // Coverage percentage
      const coverage_pct = planned_retail > 0 ? Math.min(100, (covered_retail / planned_retail) * 100) : 0;
      
      // Determine available actions based on lifecycle
      const available_actions = [];
      if (lifecycle_state === 'planned' && coverage_pct >= 100) {
        available_actions.push('create_po');
      }
      if (lifecycle_state === 'ordered' || lifecycle_state === 'partially_received') {
        available_actions.push('receive');
        available_actions.push('delta_order');
      }
      if ((lifecycle_state === 'received' || qty.received > qty.installed) && qty.received > 0) {
        available_actions.push('install');
      }
      if (qty.installed > 0) {
        available_actions.push('reverse_install');
      }
      if (coverage_pct < 100) {
        available_actions.push('allocate_pool');
      }
      if (lifecycle_state === 'planned' && qty.ordered === 0) {
        available_actions.push('remove_commitment');
      }
      
      return {
        commitment_id: commitment.id,
        part_id: commitment.part_id,
        part_name: part?.part_name || 'Unknown Part',
        part_number: part?.vendor_part_number || '',
        
        // Quantities (from stored values)
        qty,
        
        // Financial (from stored calculated values)
        unit_cost: commitment.unit_cost_snapshot || part?.default_cost || 0,
        unit_retail: commitment.unit_retail_snapshot || part?.default_retail || 0,
        planned_retail,
        covered_retail,
        exposure,
        extended_cost: commitment.actual_extended_cost || 0,
        
        // Derived state
        lifecycle_state,
        coverage_pct: Math.round(coverage_pct * 10) / 10,
        billing_status: commitment.billing_status || 'billable',
        
        // Flags
        requires_prepay: commitment.requires_prepay || false,
        prepay_satisfied: !!commitment.prepay_satisfied_at,
        integrity_warning: commitment.integrity_warning || false,
        
        // Actions
        available_actions,
        
        // Allocations detail
        allocations: commitmentAllocations.map(a => ({
          allocation_id: a.id,
          pool_id: a.pool_id,
          pool_name: poolsMap.get(a.pool_id)?.pool_name || 'Unknown Pool',
          amount: a.amount_allocated || 0
        }))
      };
    });

    // ========================================
    // PROCESS POOLS
    // ========================================
    const normalizedPools = pools.map(pool => {
      const poolAllocations = projectAllocations.filter(a => a.pool_id === pool.id);
      const poolCharges = charges.filter(c => c.pool_id === pool.id && !c.is_reversed);
      
      // Use stored calculated values
      const allocated = pool.allocated_total || 0;
      const charged = pool.charges_total || 0;
      const balance = pool.balance || 0;
      
      const is_credit_pool = pool.pool_name?.toLowerCase().includes('credit');
      
      return {
        pool_id: pool.id,
        pool_name: pool.pool_name,
        status: pool.status || 'draft',
        
        // Financial (from stored values)
        invoiced_amount: pool.invoiced_amount || 0,
        paid_amount: pool.paid_amount || 0,
        allocated_total: allocated,
        charges_total: charged,
        balance,
        
        // Derived
        is_overdrawn: balance < 0,
        is_credit_pool,
        
        // Allocation summary
        allocation_count: poolAllocations.length,
        charge_count: poolCharges.length
      };
    });

    // ========================================
    // PROJECT SUMMARY
    // ========================================
    const summary = {
      total_commitments: normalizedCommitments.length,
      total_planned_retail: normalizedCommitments.reduce((sum, c) => sum + c.planned_retail, 0),
      total_covered_retail: normalizedCommitments.reduce((sum, c) => sum + c.covered_retail, 0),
      total_exposure: normalizedCommitments.reduce((sum, c) => sum + c.exposure, 0),
      total_extended_cost: normalizedCommitments.reduce((sum, c) => sum + c.extended_cost, 0),
      
      // Pool summary
      total_pools: normalizedPools.length,
      total_pool_balance: normalizedPools.reduce((sum, p) => sum + p.balance, 0),
      
      // Lifecycle counts
      by_lifecycle: {
        planned: normalizedCommitments.filter(c => c.lifecycle_state === 'planned').length,
        ordered: normalizedCommitments.filter(c => c.lifecycle_state === 'ordered').length,
        partially_received: normalizedCommitments.filter(c => c.lifecycle_state === 'partially_received').length,
        received: normalizedCommitments.filter(c => c.lifecycle_state === 'received').length,
        installed: normalizedCommitments.filter(c => c.lifecycle_state === 'installed').length
      },
      
      // Coverage
      overall_coverage_pct: (() => {
        const totalPlanned = normalizedCommitments.reduce((sum, c) => sum + c.planned_retail, 0);
        const totalCovered = normalizedCommitments.reduce((sum, c) => sum + c.covered_retail, 0);
        return totalPlanned > 0 ? Math.round((totalCovered / totalPlanned) * 1000) / 10 : 0;
      })(),
      
      // Warnings
      has_integrity_warnings: normalizedCommitments.some(c => c.integrity_warning),
      has_overdrawn_pools: normalizedPools.some(p => p.is_overdrawn)
    };

    // ========================================
    // FUNDING BLOCKS (for prepay requirements)
    // ========================================
    const prepay_blocks = normalizedCommitments
      .filter(c => c.requires_prepay && !c.prepay_satisfied && c.coverage_pct < 100)
      .map(c => ({
        commitment_id: c.commitment_id,
        part_name: c.part_name,
        exposure_remaining: c.exposure,
        message: `Prepay required: ${c.part_name} needs $${c.exposure.toFixed(2)} coverage before ordering`
      }));

    return Response.json({
      success: true,
      project_id,
      project_name: project[0].name,
      
      // Canonical data
      commitments: normalizedCommitments,
      pools: normalizedPools,
      
      // Aggregates
      summary,
      prepay_blocks,
      
      // Metadata
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching project supply state:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});