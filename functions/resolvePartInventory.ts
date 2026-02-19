import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * resolvePartInventory - Authoritative Inventory State Resolver
 * 
 * This is the SINGLE SOURCE OF TRUTH for part inventory state.
 * All UI components MUST use this resolver instead of reading Part fields directly.
 * 
 * Computes:
 * - allocated_stock: SUM(reserved_from_stock across commitments)
 * - on_order: SUM(open PO line qty remaining)
 * - available_stock: physical_stock - allocated_stock
 * - global_gap: SUM(gap across all active commitments)
 * 
 * UI MUST NOT write to allocated_stock or on_order fields directly.
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

    const { part_id, part_ids } = await req.json();

    // Support both single and batch resolution
    const idsToResolve = part_ids || (part_id ? [part_id] : []);
    
    if (idsToResolve.length === 0) {
      return Response.json({ error: 'part_id or part_ids required' }, { status: 400 });
    }

    // Fetch all parts
    const parts = await base44.entities.Part.filter({
      id: { $in: idsToResolve }
    });

    if (parts.length === 0) {
      return Response.json({ error: 'No parts found' }, { status: 404 });
    }

    // Fetch all active commitments for these parts
    const commitments = await base44.entities.PartCommitment.filter({
      part_id: { $in: idsToResolve },
      commitment_status: { $nin: ['cancelled', 'closed'] }
    });

    // Fetch all open PO line items for these parts
    const lineItems = await base44.entities.PartPurchaseLineItem.filter({
      part_id: { $in: idsToResolve },
      status: { $in: ['Ordered', 'Partial'] }
    });

    // Resolve each part
    const results = parts.map(part => resolveInventory(part, commitments, lineItems));

    // Return single or batch result
    if (part_id && !part_ids) {
      return Response.json(results[0]);
    }

    return Response.json({ parts: results });

  } catch (error) {
    console.error("resolvePartInventory error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Core inventory resolution logic
 */
function resolveInventory(part, allCommitments, allLineItems) {
  // Filter to this part's data
  const partCommitments = allCommitments.filter(c => c.part_id === part.id);
  const partLineItems = allLineItems.filter(li => li.part_id === part.id);

  // Get physical stock (canonical field)
  const physical_stock = part.physical_stock ?? 0;

  // Compute allocated_stock: SUM of reserved_from_stock across active commitments
  const allocated_stock = partCommitments.reduce((sum, c) => {
    const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
    return sum + reserved;
  }, 0);

  // Compute on_order: SUM of (qty_ordered - qty_received) for open PO lines
  const on_order = partLineItems.reduce((sum, li) => {
    const ordered = li.qty_ordered ?? 0;
    const received = li.qty_received ?? 0;
    return sum + Math.max(0, ordered - received);
  }, 0);

  // Compute available_stock
  const available_stock = Math.max(0, physical_stock - allocated_stock);

  // Compute global_gap: SUM of gaps across all commitments
  const global_gap = partCommitments.reduce((sum, c) => {
    const required = c.required_total ?? c.qty_committed ?? 0;
    const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
    const covered_po = c.covered_from_po ?? Math.max(0, (c.qty_ordered ?? 0) - (c.qty_received ?? 0));
    const coverage = reserved + covered_po;
    const gap = Math.max(0, required - coverage);
    return sum + gap;
  }, 0);

  // Compute total required across all commitments
  const total_required = partCommitments.reduce((sum, c) => {
    return sum + (c.required_total ?? c.qty_committed ?? 0);
  }, 0);

  // Compute total installed
  const total_installed = partCommitments.reduce((sum, c) => {
    return sum + (c.qty_installed ?? 0);
  }, 0);

  // Validate invariants
  const invariants = [];

  if (allocated_stock > physical_stock) {
    invariants.push({
      rule: 'ALLOCATED_EXCEEDS_PHYSICAL',
      severity: 'error',
      message: `allocated_stock (${allocated_stock}) > physical_stock (${physical_stock})`
    });
  }

  // Check for drift: stored allocated_stock vs computed
  if (part.allocated_stock !== undefined && part.allocated_stock !== allocated_stock) {
    invariants.push({
      rule: 'ALLOCATED_STOCK_DRIFT',
      severity: 'warning',
      message: `Stored allocated_stock (${part.allocated_stock}) != computed (${allocated_stock})`
    });
  }

  // Check for drift: stored on_order vs computed
  if (part.on_order !== undefined && part.on_order !== on_order) {
    invariants.push({
      rule: 'ON_ORDER_DRIFT',
      severity: 'warning',
      message: `Stored on_order (${part.on_order}) != computed (${on_order})`
    });
  }

  // Determine overall invariant status
  let invariant_status = 'valid';
  if (invariants.some(i => i.severity === 'error')) {
    invariant_status = 'error';
  } else if (invariants.some(i => i.severity === 'warning')) {
    invariant_status = 'warning';
  }

  // Compute reorder status
  const reorder_point = part.reorder_point ?? 0;
  const reorder_quantity = part.reorder_quantity ?? 1;
  const needs_reorder = available_stock <= reorder_point && global_gap > 0;

  // Commitment breakdown by project
  const commitments_by_project = {};
  partCommitments.forEach(c => {
    if (!commitments_by_project[c.project_id]) {
      commitments_by_project[c.project_id] = {
        project_id: c.project_id,
        total_required: 0,
        total_reserved: 0,
        total_gap: 0,
        commitment_count: 0
      };
    }
    const proj = commitments_by_project[c.project_id];
    const required = c.required_total ?? c.qty_committed ?? 0;
    const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
    const covered_po = c.covered_from_po ?? Math.max(0, (c.qty_ordered ?? 0) - (c.qty_received ?? 0));
    
    proj.total_required += required;
    proj.total_reserved += reserved;
    proj.total_gap += Math.max(0, required - reserved - covered_po);
    proj.commitment_count += 1;
  });

  return {
    part_id: part.id,
    part_name: part.part_name,
    vendor_part_number: part.vendor_part_number,
    default_vendor_id: part.default_vendor_id,
    
    // Canonical inventory state
    physical_stock,
    allocated_stock,
    on_order,
    available_stock,
    
    // Global aggregates
    global_gap,
    total_required,
    total_installed,
    
    // Reorder info
    reorder_point,
    reorder_quantity,
    needs_reorder,
    
    // Validation
    invariant_status,
    invariants,
    
    // Breakdown
    commitment_count: partCommitments.length,
    open_po_line_count: partLineItems.length,
    commitments_by_project: Object.values(commitments_by_project),
    
    // Pricing context
    cost: part.cost,
    retail_effective: part.retail_override ?? part.retail_matrix_price ?? part.default_retail,
    part_type: part.part_type
  };
}