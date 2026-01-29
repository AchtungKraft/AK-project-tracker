/**
 * Backend function to apply retail pricing to PartBuildAssignment
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

// Apply pricing logic to assignment data
function applyRetailPricingToAssignment(assignment, matrixRows) {
  const result = { ...assignment };
  
  // If locked with override, use override
  if (assignment.pricing_locked === true) {
    if (assignment.unit_retail_override != null && assignment.unit_retail_override > 0) {
      result.unit_retail = assignment.unit_retail_override;
      result.applied_markup_pct = null;
      result.pricing_source = 'override';
    }
    return result;
  }
  
  // If no cost, leave pricing as-is
  const cost = assignment.default_cost;
  if (!cost || cost <= 0) {
    return result;
  }
  
  // Find matching tier
  const tier = findTierForCost(cost, matrixRows);
  
  if (tier) {
    result.applied_markup_pct = tier.markup_pct;
    result.pricing_source = 'matrix';
    result.unit_retail = roundCurrency(cost * (1 + (tier.markup_pct || 0)));
  } else {
    // No tier found - set source to matrix but leave unit_retail null
    result.pricing_source = 'matrix';
    result.unit_retail = null;
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
    
    // Only process PartBuildAssignment events
    if (event.entity_name !== 'PartBuildAssignment') {
      return Response.json({ skipped: true, reason: 'Not PartBuildAssignment' });
    }
    
    const assignmentId = event.entity_id;
    const eventType = event.type;
    
    // Get matrix rows
    const matrixRows = await getActiveMarkupMatrix(base44);
    
    if (eventType === 'create') {
      // On create: apply pricing and update the record
      const pricedData = applyRetailPricingToAssignment(data, matrixRows);
      
      // Check if we need to update (if pricing fields changed)
      const needsUpdate = 
        pricedData.unit_retail !== data.unit_retail ||
        pricedData.applied_markup_pct !== data.applied_markup_pct ||
        pricedData.pricing_source !== data.pricing_source;
      
      if (needsUpdate) {
        await base44.asServiceRole.entities.PartBuildAssignment.update(assignmentId, {
          unit_retail: pricedData.unit_retail,
          applied_markup_pct: pricedData.applied_markup_pct,
          pricing_source: pricedData.pricing_source
        });
        
        return Response.json({
          success: true,
          action: 'pricing_applied',
          unit_retail: pricedData.unit_retail,
          markup: pricedData.applied_markup_pct
        });
      }
      
      return Response.json({ success: true, action: 'no_update_needed' });
    }
    
    if (eventType === 'update') {
      // On update: check if relevant fields changed
      const costChanged = (data.default_cost || 0) !== (old_data?.default_cost || 0);
      const lockChanged = data.pricing_locked !== old_data?.pricing_locked;
      const overrideChanged = data.unit_retail_override !== old_data?.unit_retail_override;
      
      // Only recalculate if cost changed, lock changed, or override changed
      if (!costChanged && !lockChanged && !overrideChanged) {
        return Response.json({ success: true, action: 'no_relevant_change' });
      }
      
      // Apply pricing
      const pricedData = applyRetailPricingToAssignment(data, matrixRows);
      
      // Update with new pricing
      await base44.asServiceRole.entities.PartBuildAssignment.update(assignmentId, {
        unit_retail: pricedData.unit_retail,
        applied_markup_pct: pricedData.applied_markup_pct,
        pricing_source: pricedData.pricing_source
      });
      
      return Response.json({
        success: true,
        action: 'pricing_updated',
        unit_retail: pricedData.unit_retail,
        markup: pricedData.applied_markup_pct,
        trigger: costChanged ? 'cost_change' : lockChanged ? 'lock_change' : 'override_change'
      });
    }
    
    return Response.json({ skipped: true, reason: `Unhandled event type: ${eventType}` });
    
  } catch (error) {
    console.error('Error in applyBuildPartPricing:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});