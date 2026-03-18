import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getPartInventorySnapshot - Phase 9H Step 4
 * 
 * Canonical inventory snapshot endpoint for a single part.
 * Returns all inventory metrics computed server-side.
 * UI MUST NOT compute these values locally.
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

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { part_id } = await req.json();

    if (!part_id) {
      return Response.json({ error: 'part_id required' }, { status: 400 });
    }

    // Fetch part and its commitments
    const [parts, commitments] = await Promise.all([
      base44.entities.Part.filter({ id: part_id }),
      base44.entities.PartCommitment.filter({ part_id })
    ]);

    const part = parts[0];
    if (!part) {
      return Response.json({ error: 'Part not found' }, { status: 404 });
    }

    // Filter to active commitments only
    const activeCommitments = commitments.filter(c => 
      c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed'
    );

    // PHASE 14: Fetch InventoryItems for location breakdown
    const inventoryItems = await base44.entities.InventoryItem.filter({ part_id });
    
    // PHASE 14: physical_stock is derived from InventoryItem sum (authoritative)
    const computed_physical_stock = inventoryItems.reduce((sum, item) => {
      return sum + (item.quantity_on_hand ?? 0);
    }, 0);
    
    // Use computed value, but log warning if Part.physical_stock differs
    const stored_physical_stock = part.physical_stock ?? 0;
    if (Math.abs(computed_physical_stock - stored_physical_stock) > 0.001) {
      console.warn(`PHASE 14 WARNING: Part ${part_id} physical_stock mismatch - stored: ${stored_physical_stock}, computed: ${computed_physical_stock}`);
    }
    
    const physical_stock = computed_physical_stock;
    
    const reserved_total = activeCommitments.reduce((sum, c) => {
      return sum + (c.reserved_from_stock ?? c.qty_reserved ?? 0);
    }, 0);

    const covered_from_po_total = activeCommitments.reduce((sum, c) => {
      return sum + (c.covered_from_po ?? c.qty_ordered ?? 0);
    }, 0);

    const open_required_total = activeCommitments.reduce((sum, c) => {
      return sum + (c.required_total ?? c.qty_committed ?? 0);
    }, 0);

    const to_order_total = activeCommitments.reduce((sum, c) => {
      const required = c.required_total ?? c.qty_committed ?? 0;
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered = c.covered_from_po ?? c.qty_ordered ?? 0;
      return sum + Math.max(0, required - reserved - covered);
    }, 0);

    const available_unreserved = Math.max(0, physical_stock - reserved_total);

    // HARD INVARIANT: physical_stock >= reserved_total
    const invariant_ok = physical_stock >= reserved_total;

    if (!invariant_ok) {
      throw new Error(
        `INVENTORY_INVARIANT_VIOLATION: part=${part_id} ` +
        `physical_stock=${physical_stock} reserved_total=${reserved_total} ` +
        `deficit=${reserved_total - physical_stock}`
      );
    }

    // Additional per-commitment coverage invariant check
    const coverage_violations = [];
    for (const c of activeCommitments) {
      const required = c.required_total ?? c.qty_committed ?? 0;
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered = c.covered_from_po ?? c.qty_ordered ?? 0;
      const to_order = c.qty_to_order ?? Math.max(0, required - reserved - covered);
      
      const sum = reserved + covered + to_order;
      if (Math.abs(sum - required) > 0.001) {
        coverage_violations.push({
          commitment_id: c.id,
          required,
          reserved,
          covered,
          to_order,
          sum,
          diff: sum - required
        });
      }
    }

    if (coverage_violations.length > 0) {
      throw new Error(
        `COVERAGE_INVARIANT_VIOLATION: part=${part_id} ` +
        `violations=${JSON.stringify(coverage_violations)}`
      );
    }

    // PHASE 14: Build location breakdown from InventoryItem
    const by_location = inventoryItems.map(item => ({
      location_id: item.location_id,
      quantity_on_hand: item.quantity_on_hand ?? 0,
      quantity_reserved: item.quantity_reserved ?? 0
    }));

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      part_id,
      part_name: part.part_name,
      // PHASE 14: Canonical inventory metrics (derived from InventoryItem)
      physical_stock,
      allocated_stock: reserved_total,
      available_stock: available_unreserved,
      reserved_total,
      covered_from_po_total,
      open_required_total,
      to_order_total,
      available_unreserved,
      // PHASE 14: Location breakdown
      by_location,
      inventory_item_count: inventoryItems.length,
      // Invariant status
      invariant_ok,
      // Commitment breakdown
      commitment_count: activeCommitments.length,
      commitments: activeCommitments.map(c => ({
        commitment_id: c.id,
        project_id: c.project_id,
        required_total: c.required_total ?? 0,
        reserved_from_stock: c.reserved_from_stock ?? 0,
        covered_from_po: c.covered_from_po ?? 0,
        qty_installed: c.qty_installed ?? 0,
        to_order: Math.max(0, 
          (c.required_total ?? 0) - 
          (c.reserved_from_stock ?? 0) - 
          (c.covered_from_po ?? 0)
        )
      }))
    });

  } catch (error) {
    console.error("getPartInventorySnapshot error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});