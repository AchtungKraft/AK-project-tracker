import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * purgeLegacyPools - Hard delete legacy pool entities
 * 
 * Phase 9E: Complete removal of pool-based billing model.
 * 
 * Safety checks:
 * - Pool must have 0 allocated_total
 * - No commitments may reference pool_id
 * - Project must be forward model
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const dryRun = body.dry_run !== false;
    const targetProjectId = body.project_id || null; // Optional: purge only for specific project

    // Fetch all pools
    const pools = await base44.asServiceRole.entities.BillingPool.list();
    const allocations = await base44.asServiceRole.entities.PoolAllocation.list();
    const charges = await base44.asServiceRole.entities.PoolCharge.list();
    const projects = await base44.asServiceRole.entities.Project.list();

    // Build project lookup
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Build allocation lookup by pool
    const allocationsByPool = {};
    allocations.forEach(a => {
      if (!allocationsByPool[a.pool_id]) allocationsByPool[a.pool_id] = [];
      allocationsByPool[a.pool_id].push(a);
    });

    // Build charges lookup by pool
    const chargesByPool = {};
    charges.forEach(c => {
      if (!chargesByPool[c.pool_id]) chargesByPool[c.pool_id] = [];
      chargesByPool[c.pool_id].push(c);
    });

    const scanned = [];
    const blocked = [];
    const toDelete = [];

    for (const pool of pools) {
      // Filter by project if specified
      if (targetProjectId && pool.project_id !== targetProjectId) continue;

      const project = projectMap.get(pool.project_id);
      const poolAllocations = allocationsByPool[pool.id] || [];
      const poolCharges = chargesByPool[pool.id] || [];
      
      const poolInfo = {
        pool_id: pool.id,
        pool_name: pool.pool_name,
        project_id: pool.project_id,
        project_name: project?.name || 'Unknown',
        status: pool.status,
        allocated_total: pool.allocated_total || 0,
        charges_total: pool.charges_total || 0,
        allocation_count: poolAllocations.length,
        charge_count: poolCharges.length,
        active_allocations: poolAllocations.filter(a => !a.is_reversed).length,
        active_charges: poolCharges.filter(c => !c.is_reversed).length
      };

      scanned.push(poolInfo);

      // Safety checks
      const violations = [];
      
      if ((pool.allocated_total || 0) > 0) {
        violations.push(`Pool has allocated_total: ${pool.allocated_total}`);
      }
      
      if (poolAllocations.filter(a => !a.is_reversed).length > 0) {
        violations.push(`Pool has ${poolAllocations.filter(a => !a.is_reversed).length} active allocations`);
      }

      if (project && project.financial_model_version !== 'forward') {
        violations.push(`Project not on forward model: ${project.financial_model_version || 'null'}`);
      }

      if (violations.length > 0) {
        blocked.push({ ...poolInfo, violations });
      } else {
        toDelete.push({
          ...poolInfo,
          allocations_to_delete: poolAllocations.map(a => a.id),
          charges_to_delete: poolCharges.map(c => c.id)
        });
      }
    }

    if (dryRun) {
      return Response.json({
        success: true,
        mode: 'DRY_RUN',
        timestamp: new Date().toISOString(),
        summary: {
          pools_scanned: scanned.length,
          pools_safe_to_delete: toDelete.length,
          pools_blocked: blocked.length,
          total_allocations: allocations.length,
          total_charges: charges.length
        },
        to_delete: toDelete,
        blocked,
        message: `Would delete ${toDelete.length} pools. Run with dry_run: false to execute.`
      });
    }

    // EXECUTE DELETION
    const deleted = {
      pools: [],
      allocations: [],
      charges: []
    };
    const errors = [];

    for (const pool of toDelete) {
      try {
        // Delete allocations first
        for (const allocId of pool.allocations_to_delete) {
          try {
            await base44.asServiceRole.entities.PoolAllocation.delete(allocId);
            deleted.allocations.push(allocId);
          } catch (err) {
            errors.push({ entity: 'PoolAllocation', id: allocId, error: err.message });
          }
        }

        // Delete charges
        for (const chargeId of pool.charges_to_delete) {
          try {
            await base44.asServiceRole.entities.PoolCharge.delete(chargeId);
            deleted.charges.push(chargeId);
          } catch (err) {
            errors.push({ entity: 'PoolCharge', id: chargeId, error: err.message });
          }
        }

        // Delete pool
        await base44.asServiceRole.entities.BillingPool.delete(pool.pool_id);
        deleted.pools.push({ id: pool.pool_id, name: pool.pool_name, project: pool.project_name });
      } catch (err) {
        errors.push({ entity: 'BillingPool', id: pool.pool_id, error: err.message });
      }
    }

    return Response.json({
      success: errors.length === 0,
      mode: 'EXECUTED',
      timestamp: new Date().toISOString(),
      deleted_by: user.email,
      summary: {
        pools_deleted: deleted.pools.length,
        allocations_deleted: deleted.allocations.length,
        charges_deleted: deleted.charges.length,
        error_count: errors.length
      },
      deleted,
      blocked,
      errors,
      message: `Deleted ${deleted.pools.length} pools, ${deleted.allocations.length} allocations, ${deleted.charges.length} charges`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});