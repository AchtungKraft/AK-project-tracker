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

    // Compute canonical inventory metrics
    const physical_stock = part.physical_stock ?? 0;
    
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

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      part_id,
      part_name: part.part_name,
      // Canonical inventory metrics
      physical_stock,
      reserved_total,
      covered_from_po_total,
      open_required_total,
      to_order_total,
      available_unreserved,
      // Invariant status
      invariant_ok,
      // Commitment breakdown
      commitment_count: activeCommitments.length,
      commitments: activeCommitments.map(c => ({
        commitment_id: c.id,
        project_id: c.project_id,
        required_total: c.required_total ?? c.qty_committed ?? 0,
        reserved_from_stock: c.reserved_from_stock ?? c.qty_reserved ?? 0,
        covered_from_po: c.covered_from_po ?? c.qty_ordered ?? 0,
        qty_installed: c.qty_installed ?? 0,
        to_order: Math.max(0, 
          (c.required_total ?? c.qty_committed ?? 0) - 
          (c.reserved_from_stock ?? c.qty_reserved ?? 0) - 
          (c.covered_from_po ?? c.qty_ordered ?? 0)
        )
      }))
    });

  } catch (error) {
    console.error("getPartInventorySnapshot error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});