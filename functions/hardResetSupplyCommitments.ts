/**
 * hardResetSupplyCommitments.js - Supply Hard Reset (Authoritative Delete)
 * 
 * Hard deletes ALL PartCommitment records and linked entities.
 * USE WITH EXTREME CAUTION - This is an irreversible operation.
 * 
 * Preconditions (must be verified before use):
 * - No project has installed parts that need historical preservation
 * - No reporting depends on PartCommitment history
 * - No PO reconciliation logic relies on old commitments
 * 
 * What gets DELETED:
 * - All PartCommitment records
 * - All LifecycleEvent records linked to commitments
 * - All PoolAllocation records linked to commitments
 * 
 * What is PRESERVED:
 * - Part.physical_stock
 * - InventoryReceipt, InventoryAuditLog
 * - Orders, PartPurchaseLineItems
 * - Parts, Projects, Vendors (master data)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const CONFIRM_TOKEN = 'RESET_SUPPLY_COMMITMENTS_DELETE_ALL';
const BATCH_SIZE = 200;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // ADMIN ONLY - critical operation
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { mode, confirm } = await req.json();
    
    if (!mode || !['PREVIEW', 'EXECUTE'].includes(mode)) {
      return Response.json({ 
        error: 'Invalid mode. Must be PREVIEW or EXECUTE' 
      }, { status: 400 });
    }

    // === PREVIEW MODE ===
    if (mode === 'PREVIEW') {
      const preview = await generatePreview(base44);
      return Response.json({
        ok: true,
        mode: 'PREVIEW',
        confirm_required: true,
        confirm_token: CONFIRM_TOKEN,
        ...preview
      });
    }

    // === EXECUTE MODE ===
    if (mode === 'EXECUTE') {
      // Hard guardrail
      if (confirm !== CONFIRM_TOKEN) {
        return Response.json({
          ok: false,
          code: 'CONFIRMATION_REQUIRED',
          message: `Type ${CONFIRM_TOKEN} to execute`,
          confirm_token: CONFIRM_TOKEN
        }, { status: 400 });
      }

      // Generate preflight preview
      const preflight = await generatePreview(base44);
      
      // Execute deletion
      const result = await executeReset(base44, preflight);
      
      // Run post checks
      const postChecks = await runPostChecks(base44);
      
      return Response.json({
        ok: true,
        mode: 'EXECUTE',
        preflight,
        deleted: result.deleted,
        failures: result.failures,
        post_checks: postChecks
      });
    }

  } catch (error) {
    console.error('Hard reset error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

/**
 * Generate preview of what will be deleted
 */
async function generatePreview(base44) {
  // Load ALL commitments
  const commitments = await base44.entities.PartCommitment.filter({});
  
  // Compute counts
  const byStatus = {};
  let withInstalledQty = 0;
  let withReservedFromStock = 0;
  let withCoveredFromPo = 0;
  let withAnyLineItems = 0;
  const distinctProjectIds = new Set();
  const distinctPartIds = new Set();
  
  for (const c of commitments) {
    // Status breakdown
    const status = c.commitment_status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    
    // Quantity checks
    if ((c.qty_installed || 0) > 0) withInstalledQty++;
    if ((c.reserved_from_stock || 0) > 0) withReservedFromStock++;
    if ((c.covered_from_po || 0) > 0) withCoveredFromPo++;
    
    // Line items
    if (c.order_line_item_ids?.length > 0) withAnyLineItems++;
    
    // Distinct counts
    if (c.project_id) distinctProjectIds.add(c.project_id);
    if (c.part_id) distinctPartIds.add(c.part_id);
  }

  const commitmentIds = commitments.map(c => c.id);
  
  // Count lifecycle events
  let totalLifecycleEvents = 0;
  if (commitmentIds.length > 0) {
    // Query in batches to avoid timeout
    for (let i = 0; i < commitmentIds.length; i += 100) {
      const batch = commitmentIds.slice(i, i + 100);
      for (const cid of batch) {
        const events = await base44.entities.LifecycleEvent.filter({ commitment_id: cid });
        totalLifecycleEvents += events.length;
      }
    }
  }
  
  // Check allocation entities
  const allocations = {};
  
  // PoolAllocation - we know this exists
  try {
    let poolAllocCount = 0;
    for (const cid of commitmentIds) {
      const allocs = await base44.entities.PoolAllocation.filter({ commitment_id: cid });
      poolAllocCount += allocs.length;
    }
    if (poolAllocCount > 0) {
      allocations['PoolAllocation'] = poolAllocCount;
    }
  } catch (e) {
    // Entity doesn't exist or access error - ignore
  }
  
  // Sample high-risk commitments (those with installed, covered, or reserved)
  const highRisk = commitments
    .filter(c => (c.qty_installed || 0) > 0 || (c.covered_from_po || 0) > 0 || (c.reserved_from_stock || 0) > 0)
    .sort((a, b) => {
      const aScore = (a.qty_installed || 0) * 1000 + (a.covered_from_po || 0) * 10 + (a.reserved_from_stock || 0);
      const bScore = (b.qty_installed || 0) * 1000 + (b.covered_from_po || 0) * 10 + (b.reserved_from_stock || 0);
      return bScore - aScore;
    })
    .slice(0, 20)
    .map(c => ({
      id: c.id,
      part_id: c.part_id,
      project_id: c.project_id,
      required_total: c.required_total,
      reserved_from_stock: c.reserved_from_stock,
      covered_from_po: c.covered_from_po,
      qty_installed: c.qty_installed,
      commitment_status: c.commitment_status
    }));

  return {
    summary: {
      total_commitments: commitments.length,
      by_status: byStatus,
      with_installed_qty: withInstalledQty,
      with_reserved_from_stock: withReservedFromStock,
      with_covered_from_po: withCoveredFromPo,
      with_any_line_items: withAnyLineItems,
      distinct_project_count: distinctProjectIds.size,
      distinct_part_count: distinctPartIds.size
    },
    linked_deletes: {
      lifecycle_events: totalLifecycleEvents,
      allocations
    },
    sample_high_risk: highRisk,
    commitment_ids: commitmentIds
  };
}

/**
 * Execute the reset - delete all commitments and linked data
 */
async function executeReset(base44, preflight) {
  const commitmentIds = preflight.commitment_ids || [];
  const deleted = {
    commitments: 0,
    lifecycle_events: 0,
    allocations: {}
  };
  const failures = [];

  // Process in batches
  for (let i = 0; i < commitmentIds.length; i += BATCH_SIZE) {
    const batch = commitmentIds.slice(i, i + BATCH_SIZE);
    
    for (const commitmentId of batch) {
      try {
        // 1) Delete linked PoolAllocations
        try {
          const poolAllocs = await base44.entities.PoolAllocation.filter({ commitment_id: commitmentId });
          for (const alloc of poolAllocs) {
            await base44.entities.PoolAllocation.delete(alloc.id);
            deleted.allocations['PoolAllocation'] = (deleted.allocations['PoolAllocation'] || 0) + 1;
          }
        } catch (e) {
          // Entity might not exist - ignore
        }

        // 2) Delete linked LifecycleEvents
        try {
          const events = await base44.entities.LifecycleEvent.filter({ commitment_id: commitmentId });
          for (const event of events) {
            await base44.entities.LifecycleEvent.delete(event.id);
            deleted.lifecycle_events++;
          }
        } catch (e) {
          failures.push({ type: 'LifecycleEvent', commitment_id: commitmentId, error: e.message });
        }

        // 3) Delete the PartCommitment
        await base44.entities.PartCommitment.delete(commitmentId);
        deleted.commitments++;
        
      } catch (e) {
        failures.push({ type: 'PartCommitment', id: commitmentId, error: e.message });
      }
    }
  }

  return { deleted, failures };
}

/**
 * Run post-reset validation checks
 */
async function runPostChecks(base44) {
  const results = {
    integrity_audit: null,
    canonical_flow: null
  };

  // Run integrity audit
  try {
    const auditResponse = await base44.functions.invoke('runSupplyIntegrityAudit', {});
    const audit = auditResponse.data;
    results.integrity_audit = {
      ok: audit?.ok ?? false,
      summary: audit?.summary || {},
      critical_issues: (audit?.issues || [])
        .filter(i => i.severity === 'critical')
        .slice(0, 10)
    };
  } catch (e) {
    results.integrity_audit = { error: e.message };
  }

  // Run canonical flow verification
  try {
    const flowResponse = await base44.functions.invoke('verifySupplyCanonicalFlow', {});
    const flow = flowResponse.data;
    results.canonical_flow = {
      ok: flow?.success ?? false,
      total_passed: flow?.results?.phases?.reduce((sum, p) => sum + (p.passed || 0), 0) || 0,
      total_failed: flow?.results?.phases?.reduce((sum, p) => sum + (p.failed || 0), 0) || 0,
      warnings: flow?.results?.warnings || [],
      migration_backlog: flow?.results?.migration_backlog || 0
    };
  } catch (e) {
    results.canonical_flow = { error: e.message };
  }

  return results;
}