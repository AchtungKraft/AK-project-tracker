import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * MIGRATE PRICING SEMANTICS
 * One-time migration to enforce cost vs retail separation
 * 
 * RULES:
 * - NEVER copy retail into cost
 * - Part.cost = vendor cost (what we pay)
 * - Part.retail_effective = retail_override ?? retail_matrix_price
 * - Commitment snapshots from Part fields at creation time
 * - PO line items use cost ONLY
 */

// Pricing matrix for retail calculation
function applyPricingMatrix(cost) {
  if (!cost || cost <= 0) return 0;
  if (cost <= 50) return Math.round(cost * 2.2);
  if (cost <= 250) return Math.round(cost * 1.9);
  if (cost <= 1000) return Math.round(cost * 1.7);
  return Math.round(cost * 1.5);
}

// Get effective retail from part
function getRetailEffective(part) {
  if (part.retail_override && part.retail_override > 0) {
    return part.retail_override;
  }
  if (part.retail_matrix_price && part.retail_matrix_price > 0) {
    return part.retail_matrix_price;
  }
  // Fallback to deprecated field
  if (part.default_retail && part.default_retail > 0) {
    return part.default_retail;
  }
  return 0;
}

// Get effective cost from part
function getCostEffective(part) {
  if (part.cost && part.cost > 0) {
    return part.cost;
  }
  // Fallback to deprecated field
  if (part.default_cost && part.default_cost > 0) {
    return part.default_cost;
  }
  return 0;
}

// Sequential update with rate limiting
async function batchUpdate(base44, entityName, updates, batchSize = 5, delayMs = 500) {
  const results = [];
  for (let i = 0; i < updates.length; i++) {
    const { id, data } = updates[i];
    try {
      const result = await base44.asServiceRole.entities[entityName].update(id, data);
      results.push({ success: true, id, result });
    } catch (error) {
      if (error.message?.includes('Rate limit')) {
        // Wait longer and retry once
        await new Promise(r => setTimeout(r, 2000));
        try {
          const result = await base44.asServiceRole.entities[entityName].update(id, data);
          results.push({ success: true, id, result });
        } catch (retryError) {
          results.push({ success: false, id, error: retryError.message });
        }
      } else {
        results.push({ success: false, id, error: error.message });
      }
    }
    // Delay between updates
    await new Promise(r => setTimeout(r, 150));
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run !== false;
    const max_pages = body.max_pages || 50;
    const page_size = body.page_size || 200;
    const batch_size = body.batch_size || 25;
    const delay_ms = body.delay_ms || 150;
    const repair_line_items = body.repair_line_items !== false; // Default true

    const report = {
      timestamp: new Date().toISOString(),
      dry_run,
      params: { max_pages, page_size, batch_size, delay_ms, repair_line_items },
      
      parts: {
        scanned: 0,
        migrated_cost_field: 0,
        migrated_retail_fields: 0,
        flagged_cost_review: 0,
        flagged_contamination: 0,
        verified_cost: 0,
        updates: []
      },
      
      commitments: {
        scanned: 0,
        updated_cost_snapshot: 0,
        updated_retail_snapshot: 0,
        updated_planned_totals: 0,
        flagged_missing_cost: 0,
        updates: []
      },
      
      line_items: {
        scanned: 0,
        updated_unit_cost: 0,
        updated_extended_cost: 0,
        updates: []
      },
      
      errors: [],
      summary: {}
    };

    // Fetch all data with pagination
    const parts = await base44.asServiceRole.entities.Part.list();
    const commitments = await base44.asServiceRole.entities.PartCommitment.list();
    const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.list();
    
    console.log(`📊 Loaded: ${parts.length} parts, ${commitments.length} commitments, ${lineItems.length} line items`);

    const partsMap = new Map(parts.map(p => [p.id, p]));
    const commitmentsMap = new Map(commitments.map(c => [c.id, c]));

    // ========================================
    // PHASE 1: MIGRATE PARTS
    // ========================================
    report.parts.scanned = parts.length;
    const partUpdates = [];

    for (const part of parts) {
      if (part.is_archived) continue;

      const updates = {};
      const flags = [];

      // Migrate cost field (default_cost -> cost)
      const hasCost = part.cost && part.cost > 0;
      const hasLegacyCost = part.default_cost && part.default_cost > 0;
      
      if (!hasCost && hasLegacyCost) {
        updates.cost = part.default_cost;
        flags.push('migrated_cost');
        report.parts.migrated_cost_field++;
      }

      const effectiveCost = updates.cost || part.cost || part.default_cost || 0;

      // Migrate retail fields
      const hasRetailMatrix = part.retail_matrix_price && part.retail_matrix_price > 0;
      const hasRetailOverride = part.retail_override && part.retail_override > 0;
      const hasLegacyRetail = part.default_retail && part.default_retail > 0;

      if (!hasRetailMatrix && !hasRetailOverride) {
        if (hasLegacyRetail) {
          // Check if legacy retail looks like it was matrix-calculated or manual
          const expectedMatrix = applyPricingMatrix(effectiveCost);
          if (Math.abs(part.default_retail - expectedMatrix) < 1) {
            updates.retail_matrix_price = part.default_retail;
            updates.pricing_mode = 'matrix';
          } else {
            updates.retail_override = part.default_retail;
            updates.pricing_mode = 'manual';
          }
          flags.push('migrated_retail');
          report.parts.migrated_retail_fields++;
        } else if (effectiveCost > 0) {
          // Generate matrix price
          updates.retail_matrix_price = applyPricingMatrix(effectiveCost);
          updates.pricing_mode = 'matrix';
          flags.push('generated_matrix_retail');
          report.parts.migrated_retail_fields++;
        }
      }

      const effectiveRetail = updates.retail_override || updates.retail_matrix_price || 
                              part.retail_override || part.retail_matrix_price || 
                              part.default_retail || 0;

      // Detect contamination: cost == retail (suspicious)
      const TOLERANCE = 0.01;
      const isSuspiciousMatch = effectiveCost > 10 && 
                                 effectiveRetail > 0 &&
                                 Math.abs(effectiveCost - effectiveRetail) < TOLERANCE;

      if (isSuspiciousMatch && part.is_cost_verified !== true) {
        updates.needs_cost_review = true;
        updates.cost_source = updates.cost_source || part.cost_source || 'unknown';
        flags.push('contamination_suspected');
        report.parts.flagged_contamination++;
      }

      // Flag parts with no cost
      if (effectiveCost <= 0) {
        updates.needs_cost_review = true;
        updates.cost_source = 'unknown';
        flags.push('missing_cost');
        report.parts.flagged_cost_review++;
      }

      // If cost exists and not flagged, mark as needs verification (conservative)
      if (effectiveCost > 0 && !updates.needs_cost_review && part.is_cost_verified !== true) {
        updates.is_cost_verified = false; // Explicit false, needs manual verification
        updates.cost_source = updates.cost_source || part.cost_source || 'unknown';
      }

      if (Object.keys(updates).length > 0) {
        partUpdates.push({ id: part.id, data: updates });
        report.parts.updates.push({
          part_id: part.id,
          part_name: part.part_name,
          flags,
          updates
        });
      }
    }

    // Apply part updates
    if (!dry_run && partUpdates.length > 0) {
      await batchUpdate(base44, 'Part', partUpdates, batch_size, delay_ms);
    }

    // Rebuild parts map with updates applied (for commitment phase)
    for (const { id, data } of partUpdates) {
      const part = partsMap.get(id);
      if (part) {
        Object.assign(part, data);
      }
    }

    // ========================================
    // PHASE 2: MIGRATE COMMITMENTS
    // ========================================
    report.commitments.scanned = commitments.length;
    const commitmentUpdates = [];

    for (const commitment of commitments) {
      if (commitment.commitment_status === 'cancelled') continue;

      const part = partsMap.get(commitment.part_id);
      if (!part) continue;

      const updates = {};
      const diffs = [];

      const partCost = getCostEffective(part);
      const partRetail = getRetailEffective(part);
      const qty = commitment.qty_committed || 0;

      // Migrate unit_cost_snapshot
      if (!commitment.unit_cost_snapshot || commitment.unit_cost_snapshot <= 0) {
        if (partCost > 0) {
          updates.unit_cost_snapshot = partCost;
          diffs.push({ field: 'unit_cost_snapshot', old: commitment.unit_cost_snapshot, new: partCost });
          report.commitments.updated_cost_snapshot++;
        } else {
          // Flag the part as needing cost review
          report.commitments.flagged_missing_cost++;
        }
      }

      // Migrate unit_retail_snapshot
      if (!commitment.unit_retail_snapshot || commitment.unit_retail_snapshot <= 0) {
        if (partRetail > 0) {
          updates.unit_retail_snapshot = partRetail;
          diffs.push({ field: 'unit_retail_snapshot', old: commitment.unit_retail_snapshot, new: partRetail });
          report.commitments.updated_retail_snapshot++;
        }
      }

      // Compute planned totals
      const effectiveCostSnapshot = updates.unit_cost_snapshot || commitment.unit_cost_snapshot || 0;
      const effectiveRetailSnapshot = updates.unit_retail_snapshot || commitment.unit_retail_snapshot || 0;

      // Add planned_cost_total (NEW FIELD)
      const plannedCost = qty * effectiveCostSnapshot;
      if (!commitment.planned_cost_total || Math.abs((commitment.planned_cost_total || 0) - plannedCost) > 0.01) {
        updates.planned_cost_total = plannedCost;
        diffs.push({ field: 'planned_cost_total', old: commitment.planned_cost_total, new: plannedCost });
      }

      // Update planned_retail_total
      const plannedRetail = qty * effectiveRetailSnapshot;
      if (Math.abs((commitment.planned_retail_total || 0) - plannedRetail) > 0.01) {
        updates.planned_retail_total = plannedRetail;
        diffs.push({ field: 'planned_retail_total', old: commitment.planned_retail_total, new: plannedRetail });
      }

      // Update exposure_gap
      const coveredRetail = commitment.covered_retail_total || 0;
      const expectedExposure = Math.max(0, plannedRetail - coveredRetail);
      if (Math.abs((commitment.exposure_gap || 0) - expectedExposure) > 0.01) {
        updates.exposure_gap = expectedExposure;
        diffs.push({ field: 'exposure_gap', old: commitment.exposure_gap, new: expectedExposure });
      }

      // Set pricing integrity status
      if (effectiveCostSnapshot <= 0 && qty > 0) {
        updates.pricing_integrity_status = 'missing_cost';
      } else if (effectiveRetailSnapshot <= 0 && qty > 0) {
        updates.pricing_integrity_status = 'missing_retail';
      } else if (effectiveCostSnapshot > 0 && effectiveRetailSnapshot > 0) {
        updates.pricing_integrity_status = 'ok';
      }

      if (Object.keys(updates).length > 0) {
        report.commitments.updated_planned_totals++;
        commitmentUpdates.push({ id: commitment.id, data: updates });
        report.commitments.updates.push({
          commitment_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part.part_name,
          diffs
        });
      }
    }

    // Apply commitment updates
    if (!dry_run && commitmentUpdates.length > 0) {
      await batchUpdate(base44, 'PartCommitment', commitmentUpdates, batch_size, delay_ms);
    }

    // Rebuild commitments map
    for (const { id, data } of commitmentUpdates) {
      const commitment = commitmentsMap.get(id);
      if (commitment) {
        Object.assign(commitment, data);
      }
    }

    // ========================================
    // PHASE 3: MIGRATE LINE ITEMS
    // ========================================
    report.line_items.scanned = lineItems.length;
    const lineItemUpdates = [];

    for (const lineItem of lineItems) {
      const commitment = commitmentsMap.get(lineItem.commitment_id);
      const part = partsMap.get(lineItem.part_id);

      const updates = {};
      const diffs = [];

      // Determine authoritative cost: commitment snapshot > part cost
      let authoritativeCost = 0;
      let costSource = 'unknown';

      if (commitment && commitment.unit_cost_snapshot > 0) {
        authoritativeCost = commitment.unit_cost_snapshot;
        costSource = commitment.id;
      } else if (part) {
        authoritativeCost = getCostEffective(part);
        costSource = 'part_cost';
      }

      // Migrate unit_price -> unit_cost
      const currentUnitCost = lineItem.unit_cost || lineItem.unit_price || 0;
      
      if (authoritativeCost > 0 && Math.abs(currentUnitCost - authoritativeCost) > 0.01) {
        updates.unit_cost = authoritativeCost;
        updates.cost_source_reference = costSource;
        diffs.push({ field: 'unit_cost', old: currentUnitCost, new: authoritativeCost });
        report.line_items.updated_unit_cost++;
      } else if (!lineItem.unit_cost && currentUnitCost > 0) {
        // Migrate unit_price to unit_cost if not set
        updates.unit_cost = currentUnitCost;
        updates.cost_source_reference = costSource;
        report.line_items.updated_unit_cost++;
      }

      // Compute extended_cost
      const qty = lineItem.qty_ordered || 0;
      const effectiveUnitCost = updates.unit_cost || lineItem.unit_cost || currentUnitCost;
      const expectedExtendedCost = qty * effectiveUnitCost;

      if (Math.abs((lineItem.extended_cost || lineItem.line_total || 0) - expectedExtendedCost) > 0.01) {
        updates.extended_cost = expectedExtendedCost;
        diffs.push({ field: 'extended_cost', old: lineItem.extended_cost || lineItem.line_total, new: expectedExtendedCost });
        report.line_items.updated_extended_cost++;
      }

      if (Object.keys(updates).length > 0) {
        lineItemUpdates.push({ id: lineItem.id, data: updates });
        report.line_items.updates.push({
          line_item_id: lineItem.id,
          part_name: part?.part_name,
          diffs
        });
      }
    }

    // Apply line item updates
    if (!dry_run && lineItemUpdates.length > 0) {
      await batchUpdate(base44, 'PartPurchaseLineItem', lineItemUpdates, batch_size, delay_ms);
    }

    // ========================================
    // PHASE 4: REPAIR LINE ITEM COSTS FROM COMMITMENT SNAPSHOTS
    // ========================================
    if (repair_line_items) {
      console.log('🔧 Phase 4: Repairing line item costs from commitment snapshots...');
      
      const lineItemRepairs = [];
      const TOL = 0.01;
      
      for (const lineItem of lineItems) {
        if (!lineItem.commitment_id) continue;
        
        const commitment = commitmentsMap.get(lineItem.commitment_id);
        if (!commitment) continue;
        
        const snapshot = commitment.unit_cost_snapshot;
        if (!snapshot || snapshot <= 0) continue;
        
        const currentCost = lineItem.unit_cost || lineItem.unit_price || 0;
        const qty = lineItem.qty_ordered || 1;
        const expectedExtended = snapshot * qty;
        
        const costMismatch = Math.abs(currentCost - snapshot) > TOL;
        const extendedMismatch = Math.abs((lineItem.extended_cost || 0) - expectedExtended) > TOL;
        const missingRef = lineItem.cost_source_reference !== `commitment:${commitment.id}`;
        
        if (costMismatch || extendedMismatch || missingRef) {
          lineItemRepairs.push({
            id: lineItem.id,
            data: {
              unit_cost: snapshot,
              extended_cost: expectedExtended,
              cost_source_reference: `commitment:${commitment.id}`
            },
            meta: {
              old_cost: currentCost,
              new_cost: snapshot,
              old_extended: lineItem.extended_cost,
              new_extended: expectedExtended
            }
          });
        }
      }
      
      report.line_item_repairs = {
        found: lineItemRepairs.length,
        applied: 0
      };
      
      if (!dry_run && lineItemRepairs.length > 0) {
        for (const repair of lineItemRepairs) {
          try {
            await base44.asServiceRole.entities.PartPurchaseLineItem.update(repair.id, repair.data);
            report.line_item_repairs.applied++;
          } catch (error) {
            if (error.message?.includes('Rate limit')) {
              await new Promise(r => setTimeout(r, 2000));
              try {
                await base44.asServiceRole.entities.PartPurchaseLineItem.update(repair.id, repair.data);
                report.line_item_repairs.applied++;
              } catch (e) {
                report.errors.push({ line_item_repair: repair.id, error: e.message });
              }
            } else {
              report.errors.push({ line_item_repair: repair.id, error: error.message });
            }
          }
          await new Promise(r => setTimeout(r, 150));
        }
      }
      
      console.log(`✅ Line item repairs: ${report.line_item_repairs.applied}/${report.line_item_repairs.found}`);
    }

    // ========================================
    // SUMMARY
    // ========================================
    report.summary = {
      parts: {
        scanned: report.parts.scanned,
        updated: partUpdates.length,
        migrated_cost: report.parts.migrated_cost_field,
        migrated_retail: report.parts.migrated_retail_fields,
        flagged_contamination: report.parts.flagged_contamination,
        flagged_missing_cost: report.parts.flagged_cost_review
      },
      commitments: {
        scanned: report.commitments.scanned,
        updated: commitmentUpdates.length,
        updated_cost_snapshot: report.commitments.updated_cost_snapshot,
        updated_retail_snapshot: report.commitments.updated_retail_snapshot,
        flagged_missing_cost: report.commitments.flagged_missing_cost
      },
      line_items: {
        scanned: report.line_items.scanned,
        updated: lineItemUpdates.length,
        updated_unit_cost: report.line_items.updated_unit_cost,
        updated_extended_cost: report.line_items.updated_extended_cost
      },
      line_item_repairs: report.line_item_repairs || { found: 0, applied: 0 },
      errors: report.errors.length
    };

    // Trim detailed updates for response size
    if (report.parts.updates.length > 50) {
      report.parts.updates = report.parts.updates.slice(0, 50);
      report.parts.updates_truncated = true;
    }
    if (report.commitments.updates.length > 50) {
      report.commitments.updates = report.commitments.updates.slice(0, 50);
      report.commitments.updates_truncated = true;
    }
    if (report.line_items.updates.length > 50) {
      report.line_items.updates = report.line_items.updates.slice(0, 50);
      report.line_items.updates_truncated = true;
    }

    return Response.json({
      success: true,
      dry_run,
      report
    });

  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});