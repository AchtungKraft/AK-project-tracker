import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * getProjectPurchaseOrders - Project-level PO visibility
 * 
 * USES CANONICAL buildPOReadModel for data projection.
 * This ensures identical data structure across all PO surfaces.
 * 
 * Returns all POs tied to a project's commitments.
 * Visibility is NOT filtered by status - all POs are shown:
 * - Created, Ordered, Partial, Received, Cancelled
 * 
 * CANONICAL RULES:
 * - qty_remaining = qty_ordered - qty_received (derived, never stored)
 * - qty_ordered is IMMUTABLE after PO creation
 * - Visibility ≠ Receivability (all POs visible, only those with remaining receivable)
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

    const { project_id, include_debug } = await req.json();
    
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Use canonical read model for consistent data (pure projection)
    // Use user-scoped invoke (not asServiceRole) to avoid 403 on non-admin users
    const poResult = await base44.functions.invoke('buildPOReadModel', {
      project_id,
      include_debug: include_debug || false,
    });

    if (poResult.data?.error) {
      throw new Error(poResult.data.error);
    }

    // ========================================
    // VISIBILITY: Return ALL POs for project (no filtering)
    // Visibility ≠ Receivability
    // ========================================
    const orders = poResult.data?.orders || [];
    
    // Compute summary from ALL orders (not filtered)
    const summary = {
      total_orders: orders.length,
      total_lines: orders.reduce((sum, o) => sum + o.total_lines, 0),
      total_qty_ordered: orders.reduce((sum, o) => sum + o.total_qty_ordered, 0),
      total_qty_received: orders.reduce((sum, o) => sum + o.total_qty_received, 0),
      total_qty_remaining: orders.reduce((sum, o) => sum + o.total_qty_remaining, 0),
      total_cost: orders.reduce((sum, o) => sum + o.total_cost, 0),
      receivable_count: orders.filter(o => o.is_receivable && !o.is_cancelled).length,
      fully_received_count: orders.filter(o => o.is_fully_received).length,
      cancelled_count: orders.filter(o => o.is_cancelled).length,
    };

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      project_id,
      orders,
      summary,
    });

  } catch (error) {
    console.error("getProjectPurchaseOrders error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});