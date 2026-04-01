/**
 * backfillPOLineCosts.js
 * 
 * Backfills PO lines that were created with unit_cost = 0 due to the old
 * nullish coalescing fallback bug. Updates PO lines from Part.cost, then
 * re-syncs affected commitments (cost + matrix retail).
 * 
 * Input: { dry_run?: boolean, project_id?: string }
 * Output: structured summary
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const dryRun = payload.dry_run !== false; // Default to dry_run=true for safety
    const projectFilter = payload.project_id || null;

    // 1. Find all PO lines with unit_cost = 0 and a commitment_id
    console.log('[BACKFILL] Starting PO line cost backfill scan...');
    const zeroCostLines = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({
      unit_cost: 0,
      status: { $ne: 'Cancelled' },
    });
    
    // Filter to only lines with commitment_id
    const candidates = zeroCostLines.filter(li => li.commitment_id);
    console.log(`[BACKFILL] Found ${zeroCostLines.length} zero-cost PO lines, ${candidates.length} with commitment_id`);

    if (candidates.length === 0) {
      return Response.json({
        success: true,
        dry_run: dryRun,
        summary: { total_zero_cost_found: 0, total_updated: 0, total_skipped: 0, total_synced: 0, total_failures: 0 },
        details: [],
      });
    }

    // 2. Fetch linked Parts and Commitments
    const partIds = [...new Set(candidates.map(li => li.part_id).filter(Boolean))];
    const commitmentIds = [...new Set(candidates.map(li => li.commitment_id))];

    const parts = await base44.asServiceRole.entities.Part.filter({ id: { $in: partIds } });
    const partMap = new Map(parts.map(p => [p.id, p]));

    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ id: { $in: commitmentIds } });
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));

    // Optional: filter by project
    const filteredCandidates = projectFilter
      ? candidates.filter(li => {
          const c = commitmentMap.get(li.commitment_id);
          return c && c.project_id === projectFilter;
        })
      : candidates;

    // 3. Process each zero-cost PO line
    const updated = [];
    const skipped = [];
    const failures = [];
    const affectedCommitmentIds = new Set();

    for (const li of filteredCandidates) {
      const part = partMap.get(li.part_id);
      const commitment = commitmentMap.get(li.commitment_id);

      // Skip if part has no cost
      if (!part || !(part.cost > 0)) {
        skipped.push({
          po_line_id: li.id,
          commitment_id: li.commitment_id,
          part_id: li.part_id,
          reason: !part ? 'PART_NOT_FOUND' : 'PART_COST_ZERO',
          part_cost: part?.cost ?? null,
        });
        continue;
      }

      const newCost = part.cost;
      const detail = {
        po_line_id: li.id,
        order_id: li.order_id,
        commitment_id: li.commitment_id,
        part_id: li.part_id,
        part_name: part.part_name,
        old_unit_cost: 0,
        new_unit_cost: newCost,
        extended_cost: newCost * (li.qty_ordered || 0),
        reason: 'backfill from part cost after PO fallback bug',
      };

      if (!dryRun) {
        try {
          await base44.asServiceRole.entities.PartPurchaseLineItem.update(li.id, {
            unit_cost: newCost,
            extended_cost: newCost * (li.qty_ordered || 0),
            cost_source_reference: 'part_cost_backfill',
            cost_requires_review: false,
          });
          affectedCommitmentIds.add(li.commitment_id);
          updated.push(detail);
          console.log(`[BACKFILL] Updated PO line ${li.id}: $0 → $${newCost} (part: ${part.part_name})`);
        } catch (err) {
          failures.push({ ...detail, error: err.message });
          console.error(`[BACKFILL] Failed to update PO line ${li.id}: ${err.message}`);
        }
      } else {
        updated.push(detail);
        affectedCommitmentIds.add(li.commitment_id);
      }
    }

    // 4. Re-sync affected commitments
    const syncResults = { synced: [], skipped: [], errors: [] };

    if (!dryRun && affectedCommitmentIds.size > 0) {
      console.log(`[BACKFILL] Re-syncing ${affectedCommitmentIds.size} commitments...`);
      
      for (const cid of affectedCommitmentIds) {
        const commitment = commitmentMap.get(cid);
        
        // Skip protected records
        if (commitment?.cost_override === true) {
          syncResults.skipped.push({ commitment_id: cid, reason: 'COST_OVERRIDE_ACTIVE' });
          console.log(`[BACKFILL] Skipped commitment ${cid}: cost_override=true`);
          continue;
        }
        if (['invoiced', 'paid'].includes(commitment?.billing_status)) {
          syncResults.skipped.push({ commitment_id: cid, reason: 'BILLING_LOCKED', billing_status: commitment.billing_status });
          console.log(`[BACKFILL] Skipped commitment ${cid}: billing_status=${commitment.billing_status}`);
          continue;
        }

        try {
          const syncRes = await base44.asServiceRole.functions.invoke('syncPOCostToCommitment', {
            commitment_id: cid,
            skip_retail_update: false,
          });
          const data = syncRes.data || syncRes;
          if (data.synced?.length > 0) {
            syncResults.synced.push(...data.synced);
            console.log(`[BACKFILL] Synced commitment ${cid}: cost updated`);
          } else if (data.skipped?.length > 0) {
            syncResults.skipped.push(...data.skipped);
          }
        } catch (err) {
          syncResults.errors.push({ commitment_id: cid, error: err.message });
          console.error(`[BACKFILL] Sync failed for ${cid}: ${err.message}`);
        }
      }
    }

    const summary = {
      total_zero_cost_found: filteredCandidates.length,
      total_updated: updated.length,
      total_skipped_no_part_cost: skipped.length,
      total_skipped_override: syncResults.skipped.filter(s => s.reason === 'COST_OVERRIDE_ACTIVE').length,
      total_skipped_billing_locked: syncResults.skipped.filter(s => s.reason === 'BILLING_LOCKED').length,
      total_commitments_synced: syncResults.synced.length,
      total_failures: failures.length,
    };

    console.log('[BACKFILL] Complete:', JSON.stringify(summary));

    return Response.json({
      success: true,
      dry_run: dryRun,
      summary,
      po_lines_updated: updated,
      po_lines_skipped: skipped,
      sync_results: syncResults,
      failures,
    });
  } catch (error) {
    console.error('[BACKFILL] Fatal error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});