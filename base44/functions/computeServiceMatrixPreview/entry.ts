import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * computeServiceMatrixPreview — Non-blocking pricing guidance for Service Line Items
 * 
 * Takes a cost and returns the suggested retail from the RetailMarkupMatrix.
 * This is GUIDANCE ONLY — does NOT write any data.
 * 
 * Input: { cost: number }
 * Output: { suggested_retail, margin_pct, markup_pct, tier_label, tier_id, source: 'matrix' }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { cost } = await req.json();

    const costNum = Number(cost);
    if (!costNum || costNum <= 0) {
      return Response.json({ available: false, reason: 'Cost must be positive' });
    }

    // Fetch active markup matrix tiers
    const allTiers = await base44.entities.RetailMarkupMatrix.list();
    const activeTiers = allTiers
      .filter(t => t.active)
      .sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));

    if (activeTiers.length === 0) {
      return Response.json({ available: false, reason: 'No active markup tiers configured' });
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
      return Response.json({ available: false, reason: `No markup tier for cost $${costNum}` });
    }

    const markup_pct = matchedTier.markup_pct ?? 0;
    const suggested_retail = Math.round(costNum * (1 + markup_pct));
    const margin_pct = suggested_retail > 0 ? ((suggested_retail - costNum) / suggested_retail) * 100 : 0;

    return Response.json({
      available: true,
      suggested_retail,
      margin_pct: Math.round(margin_pct * 10) / 10,
      markup_pct: Math.round(markup_pct * 100),
      tier_label: matchedTier.label || `${Math.round(markup_pct * 100)}% markup`,
      tier_id: matchedTier.id,
      cost_used: costNum,
      source: 'matrix',
    });
  } catch (error) {
    console.error('computeServiceMatrixPreview error:', error);
    return Response.json({ available: false, reason: error.message });
  }
});