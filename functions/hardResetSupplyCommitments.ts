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
const BATCH_SIZE = 50;
const DELAY_MS = 100;

// Helper to add delay between operations
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
      
      // Run post checks (lightweight)
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
 * Generate preview of what will be deleted - optimized with minimal API calls
 */
async function generatePreview(base44) {
  // Load ALL commitments in one call
  const commitments = await base44.entities.PartCommitment.filter({});
  
  // Compute counts locally - no additional API calls
  const byStatus = {};
  let withInstalledQty = 0;
  let withReservedFromStock = 0;
  let withCoveredFromPo = 0;
  let withAnyLineItems = 0;
  const distinctProjectIds = new Set();
  const distinctPartIds = new Set();
  
  for (const c of commitments) {
    const status = c.commitment_status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    
    if ((c.qty_installed || 0) > 0) withInstalledQty++;
    if ((c.reserved_from_stock || 0) > 0) withReservedFromStock++;
    if ((c.covered_from_po || 0) > 0) withCoveredFromPo++;
    if (c.order_line_item_ids?.length > 0) withAnyLineItems++;
    
    if (c.project_id) distinctProjectIds.add(c.project_id);
    if (c.part_id) distinctPartIds.add(c.part_id);
  }

  const commitmentIds = commitments.map(c => c.id);
  
  // Load ALL lifecycle events and pool allocations in bulk (2 calls total)
  let allLifecycleEvents = [];
  let allPoolAllocations = [];
  
  try {
    allLifecycleEvents = await base44.entities.LifecycleEvent.filter({});
  } catch (e) {
    console.log('LifecycleEvent fetch error:', e.message);
  }
  
  try {
    allPoolAllocations = await base44.entities.PoolAllocation.filter({});
  } catch (e) {
    console.log('PoolAllocation fetch error:', e.message);
  }
  
  // Filter to those linked to commitments (in-memory)
  const commitmentIdSet = new Set(commitmentIds);
  const linkedEvents = allLifecycleEvents.filter(e => commitmentIdSet.has(e.commitment_id));
  const linkedAllocations = allPoolAllocations.filter(a => commitmentIdSet.has(a.commitment_id));
  
  // Sample high-risk commitments
  const highRisk = commitments
    .filter(c => (c.qty_installed || 0) > 0 || (c.covered_from_po || 0) > 0 || (c.reserved_from_stock || 0) > 0)
    .sort((a, b) => {
      const aScore = (a.qty_installed || 0) * 1000 + (a.covered_from_po || 0) * 10 + (a.reserved_from_stock || 0);
      const bScore = (b.qty_installed || 0) * 1000 + (b.covered_from_po || 0) * 10 + (b.reserved_from_stock || 0);
      return bScore - aScore;
    })
    .slice(0, 10)
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
      lifecycle_events: linkedEvents.length,
      allocations: linkedAllocations.length > 0 ? { PoolAllocation: linkedAllocations.length } : {}
    },
    sample_high_risk: highRisk,
    commitment_ids: commitmentIds,
    _lifecycle_event_ids: linkedEvents.map(e => e.id),
    _pool_allocation_ids: linkedAllocations.map(a => a.id)
  };
}

/**
 * Execute the reset - delete all commitments and linked data with rate limiting
 */
async function executeReset(base44, preflight) {
  const commitmentIds = preflight.commitment_ids || [];
  const lifecycleEventIds = preflight._lifecycle_event_ids || [];
  const poolAllocationIds = preflight._pool_allocation_ids || [];
  
  const deleted = {
    commitments: 0,
    lifecycle_events: 0,
    allocations: { PoolAllocation: 0 }
  };
  const failures = [];

  // 1) Delete Pool Allocations first (with rate limiting)
  console.log(`Deleting ${poolAllocationIds.length} PoolAllocations...`);
  for (let i = 0; i < poolAllocationIds.length; i += BATCH_SIZE) {
    const batch = poolAllocationIds.slice(i, i + BATCH_SIZE);
    for (const id of batch) {
      try {
        await base44.entities.PoolAllocation.delete(id);
        deleted.allocations.PoolAllocation++;
      } catch (e) {
        failures.push({ type: 'PoolAllocation', id, error: e.message });
      }
    }
    if (i + BATCH_SIZE < poolAllocationIds.length) {
      await delay(DELAY_MS);
    }
  }

  // 2) Delete Lifecycle Events (with rate limiting)
  console.log(`Deleting ${lifecycleEventIds.length} LifecycleEvents...`);
  for (let i = 0; i < lifecycleEventIds.length; i += BATCH_SIZE) {
    const batch = lifecycleEventIds.slice(i, i + BATCH_SIZE);
    for (const id of batch) {
      try {
        await base44.entities.LifecycleEvent.delete(id);
        deleted.lifecycle_events++;
      } catch (e) {
        failures.push({ type: 'LifecycleEvent', id, error: e.message });
      }
    }
    if (i + BATCH_SIZE < lifecycleEventIds.length) {
      await delay(DELAY_MS);
    }
  }

  // 3) Delete PartCommitments (with rate limiting)
  console.log(`Deleting ${commitmentIds.length} PartCommitments...`);
  for (let i = 0; i < commitmentIds.length; i += BATCH_SIZE) {
    const batch = commitmentIds.slice(i, i + BATCH_SIZE);
    for (const id of batch) {
      try {
        await base44.entities.PartCommitment.delete(id);
        deleted.commitments++;
      } catch (e) {
        failures.push({ type: 'PartCommitment', id, error: e.message });
      }
    }
    if (i + BATCH_SIZE < commitmentIds.length) {
      await delay(DELAY_MS);
    }
  }

  return { deleted, failures };
}

/**
 * Run lightweight post-reset checks
 */
async function runPostChecks(base44) {
  const checks = {
    remaining_commitments: 0,
    remaining_events: 0,
    ok: true
  };
  
  try {
    const remaining = await base44.entities.PartCommitment.filter({});
    checks.remaining_commitments = remaining.length;
  } catch (e) {
    checks.commitment_check_error = e.message;
  }
  
  try {
    const remainingEvents = await base44.entities.LifecycleEvent.filter({});
    checks.remaining_events = remainingEvents.length;
  } catch (e) {
    checks.event_check_error = e.message;
  }
  
  checks.ok = checks.remaining_commitments === 0;
  
  return checks;
}