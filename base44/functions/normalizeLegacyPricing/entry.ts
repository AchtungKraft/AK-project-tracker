import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * normalizeLegacyPricing - Data repair script for pricing inconsistencies
 * 
 * Rules:
 * - Part.default_cost = vendor/real cost (never from matrix)
 * - Part.default_retail = retail price (may be derived from matrix if missing)
 * - Do not overwrite locked costs (cost_locked_at)
 * - Recompute commitment precomputed fields
 * 
 * @param {boolean} dry_run - If true, only report changes without applying
 * @param {number} max_records - Maximum records to process
 * @param {string} project_id - Optional: limit to specific project
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can run this
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true, max_records = 100, project_id = null } = await req.json().catch(() => ({}));
    const timestamp = new Date().toISOString();

    // Fetch data
    const [parts, commitments, markupMatrix, lineItems] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      project_id 
        ? base44.asServiceRole.entities.PartCommitment.filter({ project_id })
        : base44.asServiceRole.entities.PartCommitment.list(),
      base44.asServiceRole.entities.RetailMarkupMatrix.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list()
    ]);

    // Sort matrix by cost threshold descending for proper lookup
    const sortedMatrix = markupMatrix.sort((a, b) => (b.cost_threshold || 0) - (a.cost_threshold || 0));

    // Helper: get markup from matrix
    function getMatrixMarkup(cost) {
      if (!cost || cost <= 0) return 1.5; // Default 50% markup
      for (const tier of sortedMatrix) {
        if (cost >= (tier.cost_threshold || 0)) {
          return 1 + ((tier.markup_percentage || 50) / 100);
        }
      }
      return 1.5;
    }

    const changes = {
      parts_updated: [],
      commitments_updated: [],
      line_items_updated: [],
      skipped_locked: [],
      errors: []
    };

    let processedCount = 0;

    // 1. Fix Parts with missing pricing
    const partsToFix = parts.filter(p => 
      !p.is_archived && 
      (!p.default_cost || !p.default_retail) &&
      processedCount < max_records
    );

    for (const part of partsToFix) {
      if (processedCount >= max_records) break;

      try {
        // Find cost from line items if available
        const partLineItems = lineItems.filter(li => li.part_id === part.id && li.unit_price > 0);
        const avgCost = partLineItems.length > 0
          ? partLineItems.reduce((sum, li) => sum + li.unit_price, 0) / partLineItems.length
          : null;

        const updates = {};
        let changed = false;

        // Set cost if missing
        if (!part.default_cost && avgCost) {
          updates.default_cost = Math.round(avgCost * 100) / 100;
          changed = true;
        }

        // Set retail if missing (use matrix if we have cost)
        if (!part.default_retail) {
          const costForMarkup = updates.default_cost || part.default_cost || avgCost;
          if (costForMarkup && costForMarkup > 0) {
            const markup = getMatrixMarkup(costForMarkup);
            updates.default_retail = Math.round(costForMarkup * markup * 100) / 100;
            updates.pricing_mode = 'matrix';
            updates.applied_markup_pct = Math.round((markup - 1) * 100);
            changed = true;
          }
        }

        if (changed) {
          changes.parts_updated.push({
            id: part.id,
            name: part.part_name,
            before: { default_cost: part.default_cost, default_retail: part.default_retail },
            after: updates
          });

          if (!dry_run) {
            await base44.asServiceRole.entities.Part.update(part.id, updates);
          }
          processedCount++;
        }
      } catch (error) {
        changes.errors.push({ entity: 'Part', id: part.id, error: error.message });
      }
    }

    // 2. Fix Commitments with missing pricing snapshots
    const activeCommitments = commitments.filter(c => 
      c.commitment_status !== 'cancelled' &&
      processedCount < max_records
    );

    for (const commitment of activeCommitments) {
      if (processedCount >= max_records) break;

      try {
        const part = parts.find(p => p.id === commitment.part_id);
        if (!part) continue;

        // Check if already fixed from parts_updated
        const partUpdate = changes.parts_updated.find(p => p.id === part.id);
        const currentPartCost = partUpdate?.after?.default_cost || part.default_cost;
        const currentPartRetail = partUpdate?.after?.default_retail || part.default_retail;

        const updates = {};
        let changed = false;

        // Fix unit_retail_snapshot if missing
        if (!commitment.unit_retail_snapshot && currentPartRetail) {
          updates.unit_retail_snapshot = currentPartRetail;
          changed = true;
        }

        // Fix unit_cost_snapshot if missing (only if ordered)
        if (!commitment.unit_cost_snapshot && commitment.qty_ordered > 0) {
          // Try to get from line items first
          const commitmentLines = lineItems.filter(li => li.commitment_id === commitment.id);
          const lineAvgCost = commitmentLines.length > 0
            ? commitmentLines.reduce((sum, li) => sum + (li.unit_price || 0), 0) / commitmentLines.length
            : null;

          if (lineAvgCost) {
            updates.unit_cost_snapshot = lineAvgCost;
            changed = true;
          } else if (currentPartCost) {
            updates.unit_cost_snapshot = currentPartCost;
            changed = true;
          }
        }

        // Recalculate planned_retail_total
        const effectiveRetail = updates.unit_retail_snapshot || commitment.unit_retail_snapshot || currentPartRetail || 0;
        const expectedPlannedRetail = (commitment.qty_committed || 0) * effectiveRetail;
        
        if (Math.abs((commitment.planned_retail_total || 0) - expectedPlannedRetail) > 0.01) {
          updates.planned_retail_total = expectedPlannedRetail;
          changed = true;
        }

        // Recalculate exposure_gap
        if (changed || !commitment.exposure_gap) {
          const coveredRetail = commitment.covered_retail_total || 0;
          const plannedRetail = updates.planned_retail_total || commitment.planned_retail_total || expectedPlannedRetail;
          const newExposureGap = plannedRetail - coveredRetail;
          
          if (Math.abs((commitment.exposure_gap || 0) - newExposureGap) > 0.01) {
            updates.exposure_gap = newExposureGap;
            changed = true;
          }
        }

        if (changed) {
          changes.commitments_updated.push({
            id: commitment.id,
            part_name: part.part_name,
            project_id: commitment.project_id,
            before: {
              unit_retail_snapshot: commitment.unit_retail_snapshot,
              unit_cost_snapshot: commitment.unit_cost_snapshot,
              planned_retail_total: commitment.planned_retail_total,
              exposure_gap: commitment.exposure_gap
            },
            after: updates
          });

          if (!dry_run) {
            await base44.asServiceRole.entities.PartCommitment.update(commitment.id, updates);
          }
          processedCount++;
        }
      } catch (error) {
        changes.errors.push({ entity: 'PartCommitment', id: commitment.id, error: error.message });
      }
    }

    // 3. Fix Line Items with missing line_total
    const lineItemsToFix = lineItems.filter(li =>
      li.status !== 'Cancelled' &&
      li.qty_ordered > 0 &&
      li.unit_price > 0 &&
      (!li.line_total || li.line_total === 0) &&
      processedCount < max_records
    );

    for (const li of lineItemsToFix) {
      if (processedCount >= max_records) break;

      // Check if cost is locked
      if (li.cost_locked_at) {
        changes.skipped_locked.push({
          entity: 'PartPurchaseLineItem',
          id: li.id,
          reason: `Cost locked at ${li.cost_locked_at}`
        });
        continue;
      }

      try {
        const expectedTotal = li.qty_ordered * li.unit_price;
        
        changes.line_items_updated.push({
          id: li.id,
          order_id: li.order_id,
          before: { line_total: li.line_total },
          after: { line_total: expectedTotal }
        });

        if (!dry_run) {
          await base44.asServiceRole.entities.PartPurchaseLineItem.update(li.id, {
            line_total: expectedTotal
          });
        }
        processedCount++;
      } catch (error) {
        changes.errors.push({ entity: 'PartPurchaseLineItem', id: li.id, error: error.message });
      }
    }

    // Build summary
    const summary = {
      dry_run,
      max_records,
      project_id,
      processed: processedCount,
      parts_updated: changes.parts_updated.length,
      commitments_updated: changes.commitments_updated.length,
      line_items_updated: changes.line_items_updated.length,
      skipped_locked: changes.skipped_locked.length,
      errors: changes.errors.length
    };

    return Response.json({
      success: true,
      timestamp,
      summary,
      changes: dry_run ? changes : {
        message: 'Changes applied. Re-run with dry_run: true to see details.',
        counts: {
          parts: changes.parts_updated.length,
          commitments: changes.commitments_updated.length,
          line_items: changes.line_items_updated.length
        }
      },
      next_steps: dry_run && processedCount > 0 ? [
        'Review the proposed changes above',
        'Run again with dry_run: false to apply changes',
        'Run verifyPricingIntegrity to confirm fixes'
      ] : []
    });

  } catch (error) {
    console.error("normalizeLegacyPricing error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});