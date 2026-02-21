import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validateSupplyContract - Phase 9J Step 8
 * 
 * Dev-only endpoint that verifies all supply state invariants.
 * Returns structured report of any violations.
 * 
 * Checks:
 * - 0 coverage invariant violations (required = reserved + covered + to_order)
 * - 0 negative stock situations
 * - 0 commitments with to_order < 0
 * - 0 next_action inconsistencies (CREATE_PO when to_order === 0)
 * - 0 over-allocation (reserved_total > physical_stock)
 * - 0 invalid billing flags
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

    // Admin only
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch all data
    const [parts, commitments, vendors] = await Promise.all([
      base44.entities.Part.list(),
      base44.entities.PartCommitment.list(),
      base44.entities.Vendor.list(),
    ]);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    // Violation tracking
    const violations = {
      coverage_invariant: [],
      negative_stock: [],
      negative_to_order: [],
      next_action_invalid: [],
      over_allocation: [],
      invalid_billing_flags: [],
    };

    // Active commitments
    const activeCommitments = commitments.filter(c => 
      c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed'
    );

    // Group commitments by part for over-allocation check
    const commitmentsByPart = new Map();
    activeCommitments.forEach(c => {
      if (!commitmentsByPart.has(c.part_id)) {
        commitmentsByPart.set(c.part_id, []);
      }
      commitmentsByPart.get(c.part_id).push(c);
    });

    // Check each commitment
    for (const c of activeCommitments) {
      const required_total = c.required_total ?? c.qty_committed ?? 0;
      const reserved_from_stock = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered_from_po = c.covered_from_po ?? c.qty_ordered ?? 0;
      const to_order = Math.max(0, required_total - reserved_from_stock - covered_from_po);

      // 1. Coverage invariant
      const sum = reserved_from_stock + covered_from_po + to_order;
      if (Math.abs(sum - required_total) > 0.001) {
        violations.coverage_invariant.push({
          commitment_id: c.id,
          part_id: c.part_id,
          required_total,
          reserved_from_stock,
          covered_from_po,
          to_order,
          sum,
          diff: sum - required_total
        });
      }

      // 2. Negative to_order (impossible with Math.max, but check stored value)
      if ((c.qty_to_order ?? to_order) < 0) {
        violations.negative_to_order.push({
          commitment_id: c.id,
          part_id: c.part_id,
          qty_to_order: c.qty_to_order
        });
      }

      // 3. Next action consistency
      const part = partMap.get(c.part_id);
      const vendor = part ? vendorMap.get(part.default_vendor_id) : null;
      
      // If to_order === 0, next_action should NOT be CREATE_PO
      if (to_order === 0) {
        // Simulate next_action determination
        const qty_installed = c.qty_installed ?? 0;
        const available_to_install = reserved_from_stock + covered_from_po - qty_installed;
        
        // If someone stored CREATE_PO when nothing to order, that's a violation
        // We can't directly check stored next_action, but we validate the logic
        if (c.next_action_hint === 'CREATE_PO') {
          violations.next_action_invalid.push({
            commitment_id: c.id,
            part_id: c.part_id,
            to_order,
            stored_hint: c.next_action_hint,
            message: 'CREATE_PO set but to_order === 0'
          });
        }
      }

      // 4. Invalid billing flags
      const requires_prepay = c.requires_prepay;
      if (requires_prepay !== undefined && requires_prepay !== null && typeof requires_prepay !== 'boolean') {
        violations.invalid_billing_flags.push({
          commitment_id: c.id,
          part_id: c.part_id,
          requires_prepay,
          type: typeof requires_prepay
        });
      }
    }

    // Check each part for stock violations
    for (const part of parts) {
      const physical_stock = part.physical_stock ?? 0;

      // 5. Negative stock
      if (physical_stock < 0) {
        violations.negative_stock.push({
          part_id: part.id,
          part_name: part.part_name,
          physical_stock
        });
      }

      // 6. Over-allocation
      const partCommitments = commitmentsByPart.get(part.id) || [];
      const reserved_total = partCommitments.reduce((sum, c) => {
        return sum + (c.reserved_from_stock ?? c.qty_reserved ?? 0);
      }, 0);

      if (reserved_total > physical_stock + 0.001) {
        violations.over_allocation.push({
          part_id: part.id,
          part_name: part.part_name,
          physical_stock,
          reserved_total,
          excess: reserved_total - physical_stock
        });
      }
    }

    // Calculate totals
    const total_violations = 
      violations.coverage_invariant.length +
      violations.negative_stock.length +
      violations.negative_to_order.length +
      violations.next_action_invalid.length +
      violations.over_allocation.length +
      violations.invalid_billing_flags.length;

    const contract_valid = total_violations === 0;

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      contract_valid,
      summary: {
        total_parts: parts.length,
        total_active_commitments: activeCommitments.length,
        total_violations,
        coverage_invariant_count: violations.coverage_invariant.length,
        negative_stock_count: violations.negative_stock.length,
        negative_to_order_count: violations.negative_to_order.length,
        next_action_invalid_count: violations.next_action_invalid.length,
        over_allocation_count: violations.over_allocation.length,
        invalid_billing_flags_count: violations.invalid_billing_flags.length,
      },
      violations: contract_valid ? null : violations,
      message: contract_valid 
        ? 'All supply state invariants valid' 
        : `Found ${total_violations} violation(s) - see violations object for details`
    });

  } catch (error) {
    console.error("validateSupplyContract error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});