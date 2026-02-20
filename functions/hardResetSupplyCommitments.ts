/**
 * hardResetSupplyCommitments.js - Supply Hard Reset (Authoritative Delete)
 * 
 * Hard deletes ALL PartCommitment records and linked entities.
 * USE WITH EXTREME CAUTION - This is an irreversible operation.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const CONFIRM_TOKEN = 'RESET_SUPPLY_COMMITMENTS_DELETE_ALL';
const PAGE_SIZE = 100;

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
    
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { mode, confirm } = await req.json();
    
    if (!mode || !['PREVIEW', 'EXECUTE'].includes(mode)) {
      return Response.json({ error: 'Invalid mode. Must be PREVIEW or EXECUTE' }, { status: 400 });
    }

    // === PREVIEW MODE ===
    if (mode === 'PREVIEW') {
      // Get commitment count only - fast preview
      const commitments = await base44.entities.PartCommitment.list('-created_date', PAGE_SIZE);
      
      const byStatus = {};
      let withReservedFromStock = 0;
      
      for (const c of commitments) {
        const status = c.commitment_status || 'unknown';
        byStatus[status] = (byStatus[status] || 0) + 1;
        if ((c.reserved_from_stock || 0) > 0) withReservedFromStock++;
      }
      
      // Sample high-risk
      const highRisk = commitments
        .filter(c => (c.reserved_from_stock || 0) > 0 || (c.qty_installed || 0) > 0)
        .slice(0, 5)
        .map(c => ({
          id: c.id,
          required_total: c.required_total,
          reserved_from_stock: c.reserved_from_stock,
          covered_from_po: c.covered_from_po,
          qty_installed: c.qty_installed,
          commitment_status: c.commitment_status
        }));

      return Response.json({
        ok: true,
        mode: 'PREVIEW',
        confirm_required: true,
        confirm_token: CONFIRM_TOKEN,
        summary: {
          total_commitments_sampled: commitments.length,
          note: commitments.length === PAGE_SIZE ? 'May have more records' : 'All records shown',
          by_status: byStatus,
          with_reserved_from_stock: withReservedFromStock
        },
        sample_high_risk: highRisk,
        warning: 'This will delete ALL PartCommitment, LifecycleEvent, and PoolAllocation records.'
      });
    }

    // === EXECUTE MODE ===
    if (mode === 'EXECUTE') {
      if (confirm !== CONFIRM_TOKEN) {
        return Response.json({
          ok: false,
          code: 'CONFIRMATION_REQUIRED',
          message: `Type ${CONFIRM_TOKEN} to execute`,
          confirm_token: CONFIRM_TOKEN
        }, { status: 400 });
      }

      const deleted = { commitments: 0, lifecycle_events: 0, pool_allocations: 0 };
      const failures = [];

      // Delete PoolAllocations (paginated)
      let hasMore = true;
      while (hasMore) {
        const allocs = await base44.entities.PoolAllocation.list('-created_date', PAGE_SIZE);
        if (allocs.length === 0) {
          hasMore = false;
        } else {
          for (const a of allocs) {
            try {
              await base44.entities.PoolAllocation.delete(a.id);
              deleted.pool_allocations++;
            } catch (e) {
              failures.push({ type: 'PoolAllocation', id: a.id, error: e.message });
            }
          }
        }
      }

      // Delete LifecycleEvents (paginated)
      hasMore = true;
      while (hasMore) {
        const events = await base44.entities.LifecycleEvent.list('-created_date', PAGE_SIZE);
        if (events.length === 0) {
          hasMore = false;
        } else {
          for (const e of events) {
            try {
              await base44.entities.LifecycleEvent.delete(e.id);
              deleted.lifecycle_events++;
            } catch (err) {
              failures.push({ type: 'LifecycleEvent', id: e.id, error: err.message });
            }
          }
        }
      }

      // Delete PartCommitments (paginated)
      hasMore = true;
      while (hasMore) {
        const commitments = await base44.entities.PartCommitment.list('-created_date', PAGE_SIZE);
        if (commitments.length === 0) {
          hasMore = false;
        } else {
          for (const c of commitments) {
            try {
              await base44.entities.PartCommitment.delete(c.id);
              deleted.commitments++;
            } catch (e) {
              failures.push({ type: 'PartCommitment', id: c.id, error: e.message });
            }
          }
        }
      }

      // Verify
      const remaining = await base44.entities.PartCommitment.list('-created_date', 1);
      
      return Response.json({
        ok: remaining.length === 0,
        mode: 'EXECUTE',
        deleted,
        failures: failures.slice(0, 10),
        failure_count: failures.length,
        post_checks: {
          remaining_commitments: remaining.length,
          ok: remaining.length === 0
        }
      });
    }

  } catch (error) {
    console.error('Hard reset error:', error);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});