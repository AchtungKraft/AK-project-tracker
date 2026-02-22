import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * normalizePricingData - PHASE 15V Admin Pricing Normalization
 * 
 * Scans all parts and normalizes pricing data according to hard rules:
 * 
 * For pricing_mode = 'matrix':
 * - Clear retail_override to null
 * - Recompute retail_matrix_price from cost using matrix
 * - Round to nearest $1 (no cents)
 * - Set applied_markup_pct from matrix tier
 * 
 * For pricing_mode = 'manual':
 * - Validate retail_override exists and > 0
 * - Clear applied_markup_pct to null
 * 
 * Flags parts with:
 * - cost <= 0 → needs_cost_review = true
 * 
 * Input:
 *   dry_run: boolean (default true) - if true, preview only
 *   part_ids: string[] (optional) - limit to specific parts
 * 
 * Output:
 *   {
 *     total_parts_scanned: number,
 *     parts_corrected: number,
 *     violations_found: number,
 *     top_50_issues: [],
 *     dry_run: boolean
 *   }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true, part_ids = null } = await req.json();

    // Fetch markup matrix
    const allTiers = await base44.entities.RetailMarkupMatrix.list();
    const activeTiers = allTiers
      .filter(t => t.active)
      .sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));

    if (activeTiers.length === 0) {
      return Response.json({ 
        error: 'NO_MATRIX_CONFIGURED',
        message: 'No active markup tiers found'
      }, { status: 400 });
    }

    // Fetch parts
    let parts;
    if (part_ids && part_ids.length > 0) {
      parts = await base44.entities.Part.filter({ id: { $in: part_ids } });
    } else {
      parts = await base44.entities.Part.list();
    }

    const issues = [];
    const corrections = [];
    let parts_corrected = 0;

    for (const part of parts) {
      const pricing_mode = part.pricing_mode || 'matrix';
      const cost = part.cost ?? 0;
      const partIssues = [];
      const updates = {};

      // Set pricing_mode if missing
      if (!part.pricing_mode) {
        updates.pricing_mode = 'matrix';
        partIssues.push({ code: 'MISSING_PRICING_MODE', message: 'Set pricing_mode to matrix' });
      }

      if (pricing_mode === 'matrix') {
        // Clear retail_override if present
        if (part.retail_override !== null && part.retail_override !== undefined) {
          updates.retail_override = null;
          partIssues.push({ 
            code: 'MATRIX_HAS_OVERRIDE', 
            message: `Cleared retail_override=${part.retail_override}` 
          });
        }

        // Recompute retail from matrix
        if (cost > 0) {
          // Find matching tier
          let matchedTier = null;
          for (const tier of activeTiers) {
            const min = tier.min_cost ?? 0;
            const max = tier.max_cost;
            if (cost >= min && (max === null || max === undefined || cost < max)) {
              matchedTier = tier;
              break;
            }
          }

          if (matchedTier) {
            const markup_pct = matchedTier.markup_pct ?? 0;
            const computed_retail = Math.round(cost * (1 + markup_pct)); // Round to $1

            // Check if retail needs updating
            const current_retail = part.retail_matrix_price ?? 0;
            const is_not_rounded = current_retail !== Math.round(current_retail);
            const is_different = Math.abs(current_retail - computed_retail) > 0.01;

            if (is_not_rounded || is_different) {
              updates.retail_matrix_price = computed_retail;
              partIssues.push({
                code: 'RETAIL_RECOMPUTED',
                message: `Retail ${current_retail} → ${computed_retail} (rounded to $1)`
              });
            }

            // Set applied_markup_pct
            if (part.applied_markup_pct !== markup_pct) {
              updates.applied_markup_pct = markup_pct;
              partIssues.push({
                code: 'MARKUP_PCT_SET',
                message: `applied_markup_pct → ${Math.round(markup_pct * 100)}%`
              });
            }
          } else {
            partIssues.push({
              code: 'NO_TIER_MATCH',
              message: `No matrix tier for cost=${cost}`,
              severity: 'ERROR'
            });
          }
        } else {
          // No cost - flag for review
          if (!part.needs_cost_review) {
            updates.needs_cost_review = true;
            partIssues.push({
              code: 'FLAGGED_NO_COST',
              message: 'Set needs_cost_review=true (cost <= 0)'
            });
          }
        }
      } else if (pricing_mode === 'manual') {
        // Validate retail_override exists
        if (!part.retail_override || part.retail_override <= 0) {
          partIssues.push({
            code: 'MANUAL_NO_OVERRIDE',
            message: `Manual mode requires retail_override > 0, got ${part.retail_override}`,
            severity: 'ERROR'
          });
        }

        // Clear applied_markup_pct
        if (part.applied_markup_pct !== null && part.applied_markup_pct !== undefined) {
          updates.applied_markup_pct = null;
          partIssues.push({
            code: 'CLEARED_MARKUP_PCT',
            message: 'Cleared applied_markup_pct for manual mode'
          });
        }
      }

      // Flag negative margin
      const retail_effective = pricing_mode === 'manual' 
        ? (part.retail_override || 0) 
        : (updates.retail_matrix_price ?? part.retail_matrix_price ?? 0);
      
      if (cost > 0 && retail_effective > 0 && retail_effective < cost) {
        partIssues.push({
          code: 'NEGATIVE_MARGIN',
          message: `Retail ${retail_effective} < Cost ${cost}`,
          severity: 'WARNING'
        });
      }

      // Apply corrections if any
      if (Object.keys(updates).length > 0) {
        parts_corrected++;
        
        if (!dry_run) {
          await base44.asServiceRole.entities.Part.update(part.id, updates);
        }

        corrections.push({
          part_id: part.id,
          part_name: part.part_name,
          updates,
          issues: partIssues
        });
      }

      // Track issues
      if (partIssues.length > 0) {
        issues.push({
          part_id: part.id,
          part_name: part.part_name,
          pricing_mode,
          cost,
          issues: partIssues
        });
      }
    }

    // === PHASE 15V.2: COMMITMENT SNAPSHOT BACKFILL ===
    // Backfill missing unit_retail_snapshot on existing commitments
    let commitments_backfilled = 0;
    const commitmentIssues = [];
    
    // Only run commitment backfill if not limited to specific parts
    if (!part_ids || part_ids.length === 0) {
      const commitments = await base44.entities.PartCommitment.filter({
        commitment_status: { $nin: ['cancelled', 'closed'] }
      });
      
      for (const commitment of commitments) {
        const updates = {};
        const issues = [];
        
        // Backfill missing retail snapshot
        if (commitment.unit_retail_snapshot === null || commitment.unit_retail_snapshot === undefined) {
          // Find the part to get current effective retail
          const part = parts.find(p => p.id === commitment.part_id);
          if (part) {
            const pricing_mode = part.pricing_mode || 'matrix';
            let retail_effective = 0;
            
            if (pricing_mode === 'manual') {
              retail_effective = part.retail_override || 0;
            } else {
              retail_effective = Math.round(part.retail_matrix_price || 0);
            }
            
            if (retail_effective > 0) {
              updates.unit_retail_snapshot = retail_effective;
              updates.planned_retail_total = retail_effective * (commitment.required_total || 0);
              issues.push({
                code: 'BACKFILLED_RETAIL_SNAPSHOT',
                message: `Set unit_retail_snapshot=${retail_effective}`
              });
            } else {
              updates.pricing_integrity_status = 'missing_retail';
              issues.push({
                code: 'MISSING_RETAIL_SOURCE',
                message: 'Part has no effective retail to snapshot',
                severity: 'ERROR'
              });
            }
          }
        }
        
        // Backfill missing cost snapshot
        if (commitment.unit_cost_snapshot === null || commitment.unit_cost_snapshot === undefined) {
          const part = parts.find(p => p.id === commitment.part_id);
          if (part && part.cost > 0) {
            updates.unit_cost_snapshot = part.cost;
            updates.planned_cost_total = part.cost * (commitment.required_total || 0);
            issues.push({
              code: 'BACKFILLED_COST_SNAPSHOT',
              message: `Set unit_cost_snapshot=${part.cost}`
            });
          }
        }
        
        if (Object.keys(updates).length > 0) {
          commitments_backfilled++;
          
          if (!dry_run) {
            await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
          }
          
          commitmentIssues.push({
            commitment_id: commitment.id,
            project_id: commitment.project_id,
            part_id: commitment.part_id,
            updates,
            issues
          });
        }
      }
    }

    // Sort issues by severity
    const sortedIssues = issues.sort((a, b) => {
      const aHasError = a.issues.some(i => i.severity === 'ERROR');
      const bHasError = b.issues.some(i => i.severity === 'ERROR');
      if (aHasError && !bHasError) return -1;
      if (!aHasError && bHasError) return 1;
      return 0;
    });

    return Response.json({
      success: true,
      dry_run,
      total_parts_scanned: parts.length,
      parts_corrected,
      violations_found: issues.length,
      commitments_backfilled,
      commitment_issues: commitmentIssues.slice(0, 50),
      corrections: corrections.slice(0, 50),
      top_50_issues: sortedIssues.slice(0, 50),
      matrix_tiers: activeTiers.map(t => ({
        label: t.label,
        min: t.min_cost,
        max: t.max_cost,
        markup: Math.round((t.markup_pct || 0) * 100) + '%'
      }))
    });

  } catch (error) {
    console.error('normalizePricingData error:', error);
    return Response.json({ 
      error: 'NORMALIZATION_FAILED',
      message: error.message 
    }, { status: 500 });
  }
});