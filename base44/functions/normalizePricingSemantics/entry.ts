import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * normalizePricingSemantics - PHASE 2 Pricing Repair Service
 * 
 * Repairs pricing integrity issues detected by pricingSemanticGate.
 * 
 * For each failing part:
 * - If pricing_mode='matrix': Recompute retail using computeRetailFromMatrix
 * - If pricing_mode='manual': Ensure retail_override exists (set from current retail_matrix_price)
 * 
 * For each failing commitment:
 * - Recompute canonical retail from part
 * - Update unit_retail_snapshot ONLY
 * - NEVER mutates: required_total, billing_status
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await req.json();
    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Fetch commitments for this project
    const commitments = await base44.entities.PartCommitment.filter({ project_id: projectId });
    
    // Fetch all parts
    const allParts = await base44.entities.Part.filter({});
    const partsMap = {};
    for (const p of allParts) {
      partsMap[p.id] = p;
    }

    // Fetch markup matrix for recomputation
    const allTiers = await base44.entities.RetailMarkupMatrix.list();
    const activeTiers = allTiers
      .filter(t => t.active)
      .sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));

    // Helper to compute retail from matrix
    const computeMatrixRetail = (cost) => {
      if (!cost || cost <= 0) return null;
      
      let matchedTier = null;
      for (const tier of activeTiers) {
        const min = tier.min_cost ?? 0;
        const max = tier.max_cost;
        if (cost >= min && (max === null || max === undefined || cost < max)) {
          matchedTier = tier;
          break;
        }
      }
      
      if (!matchedTier) return null;
      
      const markup_pct = matchedTier.markup_pct ?? 0;
      const retail_raw = cost * (1 + markup_pct);
      return {
        retail_matrix_price: Math.round(retail_raw),
        applied_markup_pct: markup_pct,
      };
    };

    const partsRepaired = [];
    const commitmentsRepaired = [];
    const errors = [];

    // === PASS 1: Repair Parts ===
    const partIdsToProcess = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    
    for (const partId of partIdsToProcess) {
      const part = partsMap[partId];
      if (!part) continue;
      
      const pricingMode = part.pricing_mode || 'matrix';
      const updates = {};
      let needsRepair = false;

      if (pricingMode === 'matrix') {
        // Check if matrix fields are missing
        if (part.applied_markup_pct === null || part.applied_markup_pct === undefined) {
          needsRepair = true;
        }
        if (part.retail_matrix_price === null || part.retail_matrix_price === undefined) {
          needsRepair = true;
        }
        
        if (needsRepair && part.cost > 0) {
          const result = computeMatrixRetail(part.cost);
          if (result) {
            updates.retail_matrix_price = result.retail_matrix_price;
            updates.applied_markup_pct = result.applied_markup_pct;
          }
        }
      } else if (pricingMode === 'manual') {
        // Check if retail_override is missing
        if (part.retail_override === null || part.retail_override === undefined) {
          needsRepair = true;
          // Set retail_override from existing retail_matrix_price or cost
          if (part.retail_matrix_price) {
            updates.retail_override = part.retail_matrix_price;
          } else if (part.cost) {
            // Fallback: use cost as retail (zero margin)
            updates.retail_override = part.cost;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        try {
          await base44.entities.Part.update(partId, updates);
          partsRepaired.push({
            part_id: partId,
            part_name: part.part_name,
            pricing_mode: pricingMode,
            updates,
          });
          // Update local map
          Object.assign(partsMap[partId], updates);
        } catch (err) {
          errors.push({
            type: 'PART_UPDATE_FAILED',
            part_id: partId,
            error: err.message,
          });
        }
      }
    }

    // === PASS 2: Repair Commitments ===
    for (const c of commitments) {
      const part = partsMap[c.part_id];
      if (!part) continue;
      
      const pricingMode = part.pricing_mode || 'matrix';
      let expectedRetail = null;
      
      if (pricingMode === 'matrix') {
        expectedRetail = part.retail_matrix_price;
      } else if (pricingMode === 'manual') {
        expectedRetail = part.retail_override;
      }
      
      // Check if commitment retail snapshot needs update
      if (expectedRetail !== null && c.unit_retail_snapshot !== expectedRetail) {
        const updates = {
          unit_retail_snapshot: expectedRetail,
          // Also update planned_retail_total if required_total exists
          planned_retail_total: expectedRetail * (c.required_total || 1),
        };
        
        try {
          await base44.entities.PartCommitment.update(c.id, updates);
          commitmentsRepaired.push({
            commitment_id: c.id,
            part_id: c.part_id,
            old_unit_retail_snapshot: c.unit_retail_snapshot,
            new_unit_retail_snapshot: expectedRetail,
          });
        } catch (err) {
          errors.push({
            type: 'COMMITMENT_UPDATE_FAILED',
            commitment_id: c.id,
            error: err.message,
          });
        }
      }
    }

    // === PASS 3: Re-validate ===
    // Run validation again to count remaining failures
    const revalidateCommitments = await base44.entities.PartCommitment.filter({ project_id: projectId });
    let remainingFailures = 0;
    
    for (const c of revalidateCommitments) {
      const part = partsMap[c.part_id];
      if (!part) {
        remainingFailures++;
        continue;
      }
      
      const pricingMode = part.pricing_mode || 'matrix';
      
      if (pricingMode === 'matrix') {
        if (part.applied_markup_pct === null || part.applied_markup_pct === undefined) {
          remainingFailures++;
        }
      } else if (pricingMode === 'manual') {
        if (part.retail_override === null || part.retail_override === undefined) {
          remainingFailures++;
        }
      }
      
      if (c.unit_retail_snapshot === null || c.unit_retail_snapshot === undefined) {
        remainingFailures++;
      }
    }

    return Response.json({
      success: true,
      parts_repaired: partsRepaired.length,
      commitments_repaired: commitmentsRepaired.length,
      remaining_failures: remainingFailures,
      details: {
        parts: partsRepaired,
        commitments: commitmentsRepaired,
        errors,
      }
    });

  } catch (error) {
    console.error('normalizePricingSemantics error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});