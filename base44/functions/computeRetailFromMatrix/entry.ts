import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * computeRetailFromMatrix - PHASE 15 Centralized Retail Calculation
 * 
 * CANONICAL pricing service for ALL retail calculations.
 * 
 * Input:
 *   cost: number - vendor cost (what we pay)
 * 
 * Output:
 *   {
 *     retail_matrix_price: number - computed retail
 *     applied_markup_pct: number - markup percentage applied
 *     tier_label: string - tier name for display
 *     cost_used: number - cost value used (for validation)
 *   }
 * 
 * HARD RULES:
 * - If cost <= 0, returns error (INVALID_COST)
 * - If no matrix tier found, returns error (NO_TIER_FOUND)
 * - Does NOT write retail_override (that's manual mode)
 * - This is the ONLY way to compute matrix pricing
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { cost } = await req.json();

    // HARD VALIDATION
    if (cost === undefined || cost === null) {
      return Response.json({ 
        error: 'COST_REQUIRED',
        message: 'Cost must be provided'
      }, { status: 400 });
    }

    const costNum = Number(cost);
    if (isNaN(costNum) || costNum <= 0) {
      return Response.json({ 
        error: 'INVALID_COST',
        message: `Cost must be positive, got: ${cost}`,
        cost_used: costNum
      }, { status: 400 });
    }

    // Fetch active markup matrix tiers
    const allTiers = await base44.entities.RetailMarkupMatrix.list();
    const activeTiers = allTiers
      .filter(t => t.active)
      .sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));

    if (activeTiers.length === 0) {
      return Response.json({ 
        error: 'NO_MATRIX_CONFIGURED',
        message: 'No active markup tiers found - configure matrix in Admin'
      }, { status: 400 });
    }

    // Find matching tier
    let matchedTier = null;
    for (const tier of activeTiers) {
      const min = tier.min_cost ?? 0;
      const max = tier.max_cost;
      
      if (costNum >= min && (max === null || max === undefined || costNum < max)) {
        matchedTier = tier;
        break;
      }
    }

    if (!matchedTier) {
      return Response.json({ 
        error: 'NO_TIER_FOUND',
        message: `No markup tier found for cost ${costNum}`,
        cost_used: costNum,
        available_tiers: activeTiers.map(t => ({
          min: t.min_cost,
          max: t.max_cost,
          markup: t.markup_pct
        }))
      }, { status: 400 });
    }

    // Compute retail
    const markup_pct = matchedTier.markup_pct ?? 0;
    const retail_raw = costNum * (1 + markup_pct);
    
    // PHASE 15V: Matrix retail MUST round to nearest $1 (no cents)
    const retail_matrix_price = Math.round(retail_raw);

    return Response.json({
      success: true,
      retail_matrix_price, // Rounded to nearest whole dollar
      applied_markup_pct: markup_pct,
      tier_label: matchedTier.label || `${Math.round(markup_pct * 100)}% markup`,
      tier_id: matchedTier.id,
      cost_used: costNum,
      margin_pct: markup_pct / (1 + markup_pct), // True margin percentage
      tier_range: {
        min: matchedTier.min_cost,
        max: matchedTier.max_cost
      }
    });

  } catch (error) {
    console.error('computeRetailFromMatrix error:', error);
    return Response.json({ 
      error: 'COMPUTATION_FAILED',
      message: error.message 
    }, { status: 500 });
  }
});