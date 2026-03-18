/**
 * Backend function to recalculate pricing for all unlocked PartBuildAssignments
 * Called by admin action in Retail Markup Matrix config
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Round to 2 decimals
function roundCurrency(value) {
  return Math.round(value * 100) / 100;
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
    
    // Verify admin user
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    // Get active matrix rows
    const matrixRows = await base44.asServiceRole.entities.RetailMarkupMatrix.list();
    const activeRows = matrixRows
      .filter(r => r.active !== false)
      .sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));
    
    if (activeRows.length === 0) {
      return Response.json({ 
        error: 'No active markup tiers found. Please configure the markup matrix first.' 
      }, { status: 400 });
    }
    
    // Get all unlocked assignments with cost > 0
    const allAssignments = await base44.asServiceRole.entities.PartBuildAssignment.list();
    const unlockedWithCost = allAssignments.filter(a => 
      a.pricing_locked !== true && 
      a.default_cost != null && 
      a.default_cost > 0
    );
    
    let updated = 0;
    let skippedNoTier = 0;
    let skippedNoCost = 0;
    let errors = 0;
    
    for (const assignment of unlockedWithCost) {
      try {
        const cost = assignment.default_cost;
        
        if (!cost || cost <= 0) {
          skippedNoCost++;
          continue;
        }
        
        const tier = findTierForCost(cost, activeRows);
        
        if (!tier) {
          skippedNoTier++;
          continue;
        }
        
        const unitRetail = roundCurrency(cost * (1 + (tier.markup_pct || 0)));
        
        await base44.asServiceRole.entities.PartBuildAssignment.update(assignment.id, {
          unit_retail: unitRetail,
          applied_markup_pct: tier.markup_pct,
          pricing_source: 'matrix'
        });
        
        updated++;
      } catch (err) {
        console.error(`Error updating assignment ${assignment.id}:`, err);
        errors++;
      }
    }
    
    // Also count locked and no-cost assignments for context
    const locked = allAssignments.filter(a => a.pricing_locked === true).length;
    const noCost = allAssignments.filter(a => 
      a.pricing_locked !== true && 
      (!a.default_cost || a.default_cost <= 0)
    ).length;
    
    return Response.json({
      success: true,
      summary: {
        total_assignments: allAssignments.length,
        updated,
        skipped_no_tier: skippedNoTier,
        skipped_no_cost: skippedNoCost + noCost,
        skipped_locked: locked,
        errors
      }
    });
    
  } catch (error) {
    console.error('Error in recalculateUnlockedPricing:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});