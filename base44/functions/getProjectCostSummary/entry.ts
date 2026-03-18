import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getProjectCostSummary - Forward Model Cost Authority
 * 
 * For FORWARD financial model projects ONLY:
 * - PO line (PartPurchaseLineItem) is the SOLE cost authority
 * - Cost rollups derive ONLY from PO lines and receiving data
 * 
 * Does NOT use:
 * - commitment.unit_cost_snapshot
 * - commitment.planned_cost_total
 * - Part.cost
 * 
 * Returns:
 * - ordered_cost: SUM(PartPurchaseLineItem.extended_cost) for active lines
 * - received_cost: SUM(qty_received * unit_cost) for received portions
 * - unreceived_cost: ordered_cost - received_cost
 * - line_items: Detailed breakdown per PO line
 */

Deno.serve(async (req) => {
  console.log("getProjectCostSummary invoked");
  
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { project_id } = payload;
    
    if (!project_id) {
      return Response.json({ 
        error: 'project_id is required',
        code: 'MISSING_PROJECT_ID' 
      }, { status: 400 });
    }
    
    // Fetch project - use filter({}) then find to avoid ID format exceptions
    let project = null;
    try {
      const allProjects = await base44.entities.Project.filter({});
      project = allProjects.find(p => p.id === project_id);
    } catch (err) {
      console.log("Error fetching projects:", err.message);
    }
    
    if (!project) {
      return Response.json({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      }, { status: 404 });
    }
    
    // GUARD: Only forward model projects
    if (project.financial_model_version !== 'forward') {
      return Response.json({
        error: 'Cost summary only available for forward financial model projects',
        code: 'LEGACY_MODEL_NOT_SUPPORTED',
        financial_model_version: project.financial_model_version || 'legacy'
      }, { status: 400 });
    }
    
    // Fetch commitments for this project (to get commitment_ids)
    const commitments = await base44.entities.PartCommitment.filter({ project_id });
    const activeCommitments = commitments.filter(c => 
      !['cancelled', 'closed'].includes(c.commitment_status)
    );
    const commitmentIds = activeCommitments.map(c => c.id);
    const commitmentMap = Object.fromEntries(activeCommitments.map(c => [c.id, c]));
    
    // Fetch all PO line items and filter by commitment_id
    const allLineItems = await base44.entities.PartPurchaseLineItem.list();
    const projectLineItems = allLineItems.filter(li => 
      li.commitment_id && commitmentIds.includes(li.commitment_id)
    );
    
    // Filter to active (non-cancelled) lines only
    const activeLineItems = projectLineItems.filter(li => li.status !== 'Cancelled');
    
    // Get unique order IDs to fetch Order-level freight/tariff
    const orderIds = [...new Set(activeLineItems.map(li => li.order_id).filter(Boolean))];
    const allOrders = await base44.entities.Order.list();
    const projectOrders = allOrders.filter(o => orderIds.includes(o.id));
    const orderMap = Object.fromEntries(projectOrders.map(o => [o.id, o]));
    
    // Calculate cost rollups from PO LINES ONLY
    let ordered_parts_cost = 0;
    let received_parts_cost = 0;
    let total_qty_ordered = 0;
    let total_qty_received = 0;
    let locked_cost_count = 0;
    let cost_review_count = 0;
    
    const lineItemDetails = [];
    
    for (const li of activeLineItems) {
      const unit_cost = li.unit_cost ?? 0;
      const qty_ordered = li.qty_ordered ?? 0;
      const qty_received = li.qty_received ?? 0;
      const extended_cost = li.extended_cost ?? (unit_cost * qty_ordered);
      const line_received_cost = unit_cost * qty_received;
      const line_unreceived_cost = unit_cost * (qty_ordered - qty_received);
      
      ordered_parts_cost += extended_cost;
      received_parts_cost += line_received_cost;
      total_qty_ordered += qty_ordered;
      total_qty_received += qty_received;
      
      if (li.cost_locked_at) {
        locked_cost_count++;
      }
      
      if (li.cost_requires_review) {
        cost_review_count++;
      }
      
      // Get commitment info for context
      const commitment = commitmentMap[li.commitment_id];
      
      lineItemDetails.push({
        line_item_id: li.id,
        order_id: li.order_id,
        commitment_id: li.commitment_id,
        part_id: li.part_id,
        unit_cost,
        qty_ordered,
        qty_received,
        extended_cost,
        received_cost: line_received_cost,
        unreceived_cost: line_unreceived_cost,
        status: li.status,
        cost_locked_at: li.cost_locked_at,
        cost_requires_review: li.cost_requires_review ?? false,
        cost_source_reference: li.cost_source_reference,
        // Commitment context (but NOT using commitment cost fields)
        commitment_part_id: commitment?.part_id,
        commitment_qty: commitment?.required_total ?? commitment?.qty_committed ?? 0
      });
    }
    
    // Calculate unreceived parts cost
    const unreceived_parts_cost = ordered_parts_cost - received_parts_cost;
    
    // Calculate freight/tariff from ORDER HEADER (not line items)
    // This is the FORWARD MODEL approach - freight/tariff at PO header level
    let total_freight = 0;
    let total_tariff = 0;
    
    for (const order of projectOrders) {
      total_freight += order.freight_cost ?? order.shipping_cost ?? 0; // shipping_cost is legacy field
      total_tariff += order.tariff_cost ?? 0;
    }
    
    // Total landed cost = parts + freight + tariff
    const total_landed_cost = ordered_parts_cost + total_freight + total_tariff;
    
    // Calculate percentages
    const received_pct = ordered_parts_cost > 0 ? (received_parts_cost / ordered_parts_cost) * 100 : 0;
    
    return Response.json({
      data: {
        project_id,
        project_name: project.name,
        financial_model_version: 'forward',
        
        // PRIMARY COST METRICS (from PO lines ONLY - renamed for clarity)
        ordered_parts_cost,
        received_parts_cost,
        unreceived_parts_cost,
        
        // LEGACY ALIASES (for backward compatibility with dashboard)
        ordered_cost: ordered_parts_cost,
        received_cost: received_parts_cost,
        unreceived_cost: unreceived_parts_cost,
        
        // FREIGHT + TARIFF (from Order header)
        total_freight,
        total_tariff,
        
        // LANDED TOTAL
        total_landed_cost,
        
        // QUANTITIES
        total_qty_ordered,
        total_qty_received,
        
        // STATUS
        received_pct,
        locked_cost_count,
        cost_review_count, // Lines that need cost review
        line_item_count: activeLineItems.length,
        commitment_count: activeCommitments.length,
        order_count: projectOrders.length,
        
        // DETAILED BREAKDOWN
        line_items: lineItemDetails,
        
        // AUDIT INFO
        cost_authority: 'PO_LINE_ONLY',
        freight_tariff_source: 'ORDER_HEADER',
        excluded_sources: ['commitment.unit_cost_snapshot', 'commitment.planned_cost_total', 'Part.cost']
      }
    });
    
  } catch (error) {
    console.error("getProjectCostSummary error:", error);
    return Response.json({ 
      error: error.message,
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
});