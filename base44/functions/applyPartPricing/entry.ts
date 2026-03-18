/**
 * Backend function to apply retail pricing to Part entity
 * Used by entity automations on create/update
 * 
 * Rules:
 * - If pricing_mode === "matrix" AND default_cost > 0: calculate retail from matrix
 * - If pricing_mode === "manual": do not modify default_retail
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Round to 2 decimals
function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

// Get active markup matrix rows sorted by min_cost
async function getActiveMarkupMatrix(base44) {
  const rows = await base44.asServiceRole.entities.RetailMarkupMatrix.list();
  return rows
    .filter(r => r.active !== false)
    .sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));
}

// Find matching tier for a given cost
function findTierForCost(cost, rows) {
  if (!cost || cost <= 0) return null;
  
  return rows.find(tier =>
    cost >= (tier.min_cost || 0) &&
    (tier.max_cost === null || tier.max_cost === undefined || cost < tier.max_cost)
  ) || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { event, data, old_data } = body;
    
    if (!event || !data) {
      return Response.json({ error: 'Missing event or data' }, { status: 400 });
    }
    
    // Only process Part events
    if (event.entity_name !== 'Part') {
      return Response.json({ skipped: true, reason: 'Not Part entity' });
    }
    
    const partId = event.entity_id;
    const eventType = event.type;
    
    // Get current pricing mode (default to matrix)
    const pricingMode = data.pricing_mode || 'matrix';
    
    // If manual mode, do not auto-calculate
    if (pricingMode === 'manual') {
      // Clear applied_markup_pct for manual pricing
      if (data.applied_markup_pct != null) {
        await base44.asServiceRole.entities.Part.update(partId, {
          applied_markup_pct: null
        });
      }
      return Response.json({ success: true, action: 'manual_mode_no_change' });
    }
    
    // Matrix mode: check if we need to recalculate
    const cost = data.default_cost || 0;
    
    if (eventType === 'create') {
      // On create: always apply pricing if matrix mode with cost
      if (cost <= 0) {
        return Response.json({ success: true, action: 'no_cost_provided' });
      }
      
      const matrixRows = await getActiveMarkupMatrix(base44);
      const tier = findTierForCost(cost, matrixRows);
      
      if (tier) {
        const newRetail = roundCurrency(cost * (1 + (tier.markup_pct || 0)));
        await base44.asServiceRole.entities.Part.update(partId, {
          default_retail: newRetail,
          applied_markup_pct: tier.markup_pct
        });
        
        return Response.json({
          success: true,
          action: 'pricing_applied',
          default_retail: newRetail,
          applied_markup_pct: tier.markup_pct
        });
      }
      
      return Response.json({ success: true, action: 'no_matching_tier' });
    }
    
    if (eventType === 'update') {
      // Check if relevant fields changed
      const costChanged = (data.default_cost || 0) !== (old_data?.default_cost || 0);
      const modeChanged = (data.pricing_mode || 'matrix') !== (old_data?.pricing_mode || 'matrix');
      
      // Only recalculate if cost changed or mode switched to matrix
      if (!costChanged && !modeChanged) {
        return Response.json({ success: true, action: 'no_relevant_change' });
      }
      
      // If switching to manual, clear markup (handled above already returns)
      // If matrix mode with cost > 0, recalculate
      if (cost <= 0) {
        // Clear retail for $0 cost parts in matrix mode
        await base44.asServiceRole.entities.Part.update(partId, {
          default_retail: null,
          applied_markup_pct: null
        });
        return Response.json({ success: true, action: 'cost_cleared' });
      }
      
      const matrixRows = await getActiveMarkupMatrix(base44);
      const tier = findTierForCost(cost, matrixRows);
      
      if (tier) {
        const newRetail = roundCurrency(cost * (1 + (tier.markup_pct || 0)));
        await base44.asServiceRole.entities.Part.update(partId, {
          default_retail: newRetail,
          applied_markup_pct: tier.markup_pct
        });
        
        return Response.json({
          success: true,
          action: 'pricing_updated',
          default_retail: newRetail,
          applied_markup_pct: tier.markup_pct,
          trigger: costChanged ? 'cost_change' : 'mode_change'
        });
      }
      
      // No tier found
      await base44.asServiceRole.entities.Part.update(partId, {
        applied_markup_pct: null
      });
      return Response.json({ success: true, action: 'no_matching_tier' });
    }
    
    return Response.json({ skipped: true, reason: `Unhandled event type: ${eventType}` });
    
  } catch (error) {
    console.error('Error in applyPartPricing:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});