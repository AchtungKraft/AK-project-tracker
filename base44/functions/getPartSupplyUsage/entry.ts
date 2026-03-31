import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getPartSupplyUsage - Read model for Part-centric supply view
 * 
 * Shows which projects are consuming/reserving a part and total inventory state.
 * Used by Part View Modal and PartsTracker.
 * 
 * Input: { part_id } OR { part_ids: [] } for batch
 * 
 * Returns:
 * - part inventory summary (physical_stock, allocated, available, on_order, to_order)
 * - list of commitments grouped by project
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

    // PERF: Timing start
    const _perfStart = Date.now();

    const { part_id, part_ids } = await req.json();
    
    // Support single or batch
    const idsToQuery = part_ids || (part_id ? [part_id] : []);
    
    if (idsToQuery.length === 0) {
      return Response.json({ error: 'part_id or part_ids required' }, { status: 400 });
    }

    // Fetch parts
    const parts = await base44.entities.Part.filter({
      id: { $in: idsToQuery }
    });

    const partMap = new Map(parts.map(p => [p.id, p]));

    // Fetch all commitments for these parts
    const commitments = await base44.entities.PartCommitment.filter({
      part_id: { $in: idsToQuery },
      commitment_status: { $nin: ['cancelled', 'closed'] }
    });

    // Fetch all relevant projects
    const projectIds = [...new Set(commitments.map(c => c.project_id).filter(Boolean))];
    const projects = projectIds.length > 0 
      ? await base44.entities.Project.filter({ id: { $in: projectIds } })
      : [];
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Fetch line items for on-order calculation
    const commitmentIds = commitments.map(c => c.id);
    const lineItems = commitmentIds.length > 0
      ? await base44.entities.PartPurchaseLineItem.filter({
          commitment_id: { $in: commitmentIds },
          status: { $nin: ['Received', 'Cancelled'] }
        })
      : [];

    // Group line items by commitment
    const lineItemsByCommitment = new Map();
    for (const li of lineItems) {
      if (!lineItemsByCommitment.has(li.commitment_id)) {
        lineItemsByCommitment.set(li.commitment_id, []);
      }
      lineItemsByCommitment.get(li.commitment_id).push(li);
    }

    // Build result per part
    const results = [];

    for (const partId of idsToQuery) {
      const part = partMap.get(partId);
      if (!part) {
        results.push({
          part_id: partId,
          error: 'Part not found'
        });
        continue;
      }

      const partCommitments = commitments.filter(c => c.part_id === partId);
      
      // Aggregate totals across all commitments
      let total_required = 0;
      let total_reserved = 0;
      let total_covered_po = 0;
      let total_installed = 0;
      let total_on_order = 0;

      const commitmentsByProject = [];

      for (const c of partCommitments) {
        const required = c.required_total ?? c.qty_committed ?? 0;
        const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
        const covered_po = c.covered_from_po ?? 0;
        const installed = c.qty_installed ?? 0;
        
        // Calculate on-order from line items
        const cLineItems = lineItemsByCommitment.get(c.id) || [];
        const on_order = cLineItems.reduce((sum, li) => {
          return sum + Math.max(0, (li.qty_ordered ?? 0) - (li.qty_received ?? 0));
        }, 0);

        const to_order = Math.max(0, required - reserved - covered_po);
        const coverage_total = reserved + covered_po;
        const coverage_pct = required > 0 ? Math.round((coverage_total / required) * 100) : 100;

        total_required += required;
        total_reserved += reserved;
        total_covered_po += covered_po;
        total_installed += installed;
        total_on_order += on_order;

        const project = projectMap.get(c.project_id);

        // Determine next action based on canonical quantities
        let next_action = 'COMPLETE';
        if (to_order > 0 && on_order > 0) {
          // Some ordered but gap still remains
          next_action = 'RECEIVE';
        } else if (to_order > 0) {
          // Nothing on order yet, need to buy
          next_action = 'CREATE_PO';
        } else if (on_order > 0) {
          // Fully covered by PO but awaiting delivery
          next_action = 'RECEIVE';
        } else if (reserved > installed) {
          // Stock in hand, ready to install
          next_action = 'INSTALL';
        } else if (reserved === 0 && required > 0 && installed < required) {
          // Need stock allocation first
          const physicalStock = part.physical_stock ?? 0;
          const totalAllocated = partCommitments.reduce((s, pc) => s + (pc.reserved_from_stock ?? 0), 0);
          const globalAvailable = Math.max(0, physicalStock - totalAllocated);
          next_action = globalAvailable > 0 ? 'ALLOCATE' : 'CREATE_PO';
        }

        commitmentsByProject.push({
          commitment_id: c.id,
          project_id: c.project_id,
          project_name: project?.name || 'Unknown Project',
          required_total: required,
          reserved_from_stock: reserved,
          covered_from_po: covered_po,
          on_order,
          to_order,
          qty_installed: installed,
          source_type: c.supply_source_type || 'VENDOR',
          billing_status: c.billing_status,
          coverage_pct,
          coverage_status: coverage_pct >= 100 ? 'FULLY_COVERED' : (coverage_pct > 0 ? 'PARTIALLY_COVERED' : 'NOT_COVERED'),
          next_action,
          created_date: c.created_date
        });
      }

      // Sort by project name
      commitmentsByProject.sort((a, b) => (a.project_name || '').localeCompare(b.project_name || ''));

      // Calculate part-level totals
      const physical_stock = part.physical_stock ?? 0;
      const allocated_total = total_reserved;
      const available = Math.max(0, physical_stock - allocated_total);
      const total_to_order = Math.max(0, total_required - total_reserved - total_covered_po);

      results.push({
        part_id: partId,
        part_name: part.part_name,
        vendor_part_number: part.vendor_part_number,
        featured_photo: part.featured_photo || part.photos?.[0],
        category_id: part.part_category_id,
        vendor_id: part.default_vendor_id,
        // Inventory summary
        inventory: {
          physical_stock,
          allocated_total,
          available,
          on_order_total: total_on_order,
          reorder_point: part.reorder_point ?? 0
        },
        // Demand summary across all projects
        demand: {
          total_required,
          total_reserved,
          total_covered_po,
          total_on_order,
          total_to_order,
          total_installed,
          project_count: commitmentsByProject.length
        },
        // Commitments by project
        commitments: commitmentsByProject,
        // Health indicators
        health: {
          is_low_stock: available <= (part.reorder_point ?? 0),
          has_unfulfilled_demand: total_to_order > 0,
          has_pending_orders: total_on_order > 0,
          all_installed: total_installed >= total_required && total_required > 0
        }
      });
    }

    // PERF: Timing log
    console.log('[PERF] getPartSupplyUsage', Date.now() - _perfStart, 'ms', {
      partCount: idsToQuery.length,
      commitmentCount: commitments.length,
    });

    // If single part, return unwrapped
    if (idsToQuery.length === 1) {
      return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        ...results[0]
      });
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      parts: results
    });

  } catch (error) {
    console.error("getPartSupplyUsage error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});