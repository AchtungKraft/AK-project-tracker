import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    // Use canonical read model for consistent data
    const poResult = await base44.asServiceRole.functions.invoke('buildPOReadModel', {
      project_id,
      include_cancelled: true, // Show all POs for visibility
      include_debug: include_debug || false,
    });

    if (poResult.data?.error) {
      throw new Error(poResult.data.error);
    }

    const orders = poResult.data?.orders || [];
    const summary = poResult.data?.summary || {
      total_orders: 0,
      total_lines: 0,
      total_qty_ordered: 0,
      total_qty_received: 0,
      total_qty_remaining: 0,
      total_cost: 0,
      receivable_count: 0,
      fully_received_count: 0,
      cancelled_count: 0,
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