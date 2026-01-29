/**
 * Backend function to apply retail pricing to Part entity
 * Used by entity automations on create/update
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

// Apply pricing logic to part data
function applyRetailPricingToPart(part, matrixRows) {
  const result = { ...part };
  const pricingMode = part.pricing_mode || 'matrix';
  
  // If manual mode, don't modify retail, clear markup
  if (pricingMode === 'manual') {
    result.applied_markup_pct = null;
    return result;
  }
  
  // Matrix mode: calculate retail from cost
  const cost = part.default_cost;
  if (!cost || cost <= 0) {
    // No cost, can't calculate
    return result;
  }
  
  // Find matching tier
  const tier = findTierForCost(cost, matrixRows);
  
  if (tier) {
    result.applied_markup_pct = tier.markup_pct;
    result.default_retail = roundCurrency(cost * (1 + (tier.markup_pct || 0)));
  } else {
    // No tier found - clear markup but leave retail as-is
    result.applied_markup_pct = null;
  }
  
  return result;
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
      return Response.json({ skipped: true, reason: 'Not Part' });
    }
    
    const partId = event.entity_id;
    const eventType = event.type;
    const pricingMode = data.pricing_mode || 'matrix';
    
    // Get matrix rows
    const matrixRows = await getActiveMarkupMatrix(base44);
    
    if (eventType === 'create') {
      // On create: apply pricing if matrix mode
      if (pricingMode !== 'matrix') {
        return Response.json({ success: true, action: 'manual_mode_no_change' });
      }
      
      const pricedData = applyRetailPricingToPart(data, matrixRows);
      
      // Check if we need to update
      const needsUpdate = 
        pricedData.default_retail !== data.default_retail ||
        pricedData.applied_markup_pct !== data.applied_markup_pct;
      
      if (needsUpdate) {
        await base44.asServiceRole.entities.Part.update(partId, {
          default_retail: pricedData.default_retail,
          applied_markup_pct: pricedData.applied_markup_pct
        });
        
        return Response.json({
          success: true,
          action: 'pricing_applied',
          default_retail: pricedData.default_retail,
          markup: pricedData.applied_markup_pct
        });
      }
      
      return Response.json({ success: true, action: 'no_update_needed' });
    }
    
    if (eventType === 'update') {
      // On update: check if relevant fields changed
      const costChanged = (data.default_cost || 0) !== (old_data?.default_cost || 0);
      const modeChanged = (data.pricing_mode || 'matrix') !== (old_data?.pricing_mode || 'matrix');
      
      // If manual mode and no mode change, don't touch pricing
      if (pricingMode === 'manual' && !modeChanged) {
        return Response.json({ success: true, action: 'manual_mode_no_change' });
      }
      
      // Only recalculate if cost changed or mode changed to matrix
      if (!costChanged && !modeChanged) {
        return Response.json({ success: true, action: 'no_relevant_change' });
      }
      
      // Apply pricing
      const pricedData = applyRetailPricingToPart(data, matrixRows);
      
      // Update with new pricing
      await base44.asServiceRole.entities.Part.update(partId, {
        default_retail: pricedData.default_retail,
        applied_markup_pct: pricedData.applied_markup_pct
      });
      
      return Response.json({
        success: true,
        action: 'pricing_updated',
        default_retail: pricedData.default_retail,
        markup: pricedData.applied_markup_pct,
        trigger: costChanged ? 'cost_change' : 'mode_change'
      });
    }
    
    return Response.json({ skipped: true, reason: `Unhandled event type: ${eventType}` });
    
  } catch (error) {
    console.error('Error in applyPartPricing:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});