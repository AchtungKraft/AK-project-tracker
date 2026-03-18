import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Repair PartPurchaseLineItem cost fields from commitment snapshots
 * Ensures unit_cost and extended_cost match authoritative commitment snapshots
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      dry_run = true,
      batch_size = 25,
      delay_ms = 150,
      tol = 0.01,
      limit = null
    } = body;

    const report = {
      timestamp: new Date().toISOString(),
      dry_run,
      params: { batch_size, delay_ms, tol, limit },
      scanned: 0,
      updated: 0,
      skipped: 0,
      already_correct: 0,
      offenders: [],
      updates: [],
      errors: []
    };

    // Load all line items and commitments
    const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.list();
    const commitments = await base44.asServiceRole.entities.PartCommitment.list();
    const parts = await base44.asServiceRole.entities.Part.list();

    // Build lookup maps
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));
    const partMap = new Map(parts.map(p => [p.id, p]));

    // Determine which line items to process
    let itemsToProcess = lineItems.filter(li => li.commitment_id);
    if (limit) {
      itemsToProcess = itemsToProcess.slice(0, limit);
    }

    report.scanned = itemsToProcess.length;

    const pendingUpdates = [];

    for (const lineItem of itemsToProcess) {
      const commitment = commitmentMap.get(lineItem.commitment_id);
      const part = partMap.get(lineItem.part_id);

      if (!commitment) {
        report.offenders.push({
          line_item_id: lineItem.id,
          part_name: part?.part_name || 'Unknown',
          reason: 'commitment_not_found',
          commitment_id: lineItem.commitment_id
        });
        report.skipped++;
        continue;
      }

      const snapshot = commitment.unit_cost_snapshot;

      // Skip if commitment has no valid snapshot
      if (snapshot === null || snapshot === undefined || snapshot <= 0) {
        report.offenders.push({
          line_item_id: lineItem.id,
          part_name: part?.part_name || 'Unknown',
          reason: 'invalid_commitment_snapshot',
          commitment_id: commitment.id,
          snapshot_value: snapshot
        });
        report.skipped++;
        continue;
      }

      const currentCost = lineItem.unit_cost ?? lineItem.unit_price ?? 0;
      const qty = lineItem.qty_ordered || 1;
      const expectedExtended = snapshot * qty;

      // Check if repair needed
      const costMismatch = Math.abs(currentCost - snapshot) > tol;
      const extendedMismatch = Math.abs((lineItem.extended_cost || 0) - expectedExtended) > tol;
      const missingCostRef = lineItem.cost_source_reference !== `commitment:${commitment.id}`;

      if (!costMismatch && !extendedMismatch && !missingCostRef) {
        report.already_correct++;
        continue;
      }

      const updateData = {
        unit_cost: snapshot,
        extended_cost: expectedExtended,
        cost_source_reference: `commitment:${commitment.id}`
      };

      pendingUpdates.push({
        id: lineItem.id,
        data: updateData,
        meta: {
          line_item_id: lineItem.id,
          part_name: part?.part_name || 'Unknown',
          commitment_id: commitment.id,
          old_unit_cost: currentCost,
          new_unit_cost: snapshot,
          old_extended: lineItem.extended_cost,
          new_extended: expectedExtended,
          qty
        }
      });
    }

    // Execute updates if not dry run
    if (!dry_run && pendingUpdates.length > 0) {
      for (let i = 0; i < pendingUpdates.length; i++) {
        const { id, data, meta } = pendingUpdates[i];
        try {
          await base44.asServiceRole.entities.PartPurchaseLineItem.update(id, data);
          report.updates.push({ ...meta, status: 'updated' });
          report.updated++;
        } catch (error) {
          if (error.message?.includes('Rate limit')) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              await base44.asServiceRole.entities.PartPurchaseLineItem.update(id, data);
              report.updates.push({ ...meta, status: 'updated_after_retry' });
              report.updated++;
            } catch (retryError) {
              report.errors.push({ line_item_id: id, error: retryError.message });
            }
          } else {
            report.errors.push({ line_item_id: id, error: error.message });
          }
        }
        await new Promise(r => setTimeout(r, delay_ms));
      }
    } else {
      // Dry run - just record what would be updated
      for (const { meta } of pendingUpdates) {
        report.updates.push({ ...meta, status: 'would_update' });
      }
      report.updated = pendingUpdates.length;
    }

    report.summary = {
      total_scanned: report.scanned,
      total_updated: report.updated,
      total_skipped: report.skipped,
      total_already_correct: report.already_correct,
      total_offenders: report.offenders.length,
      total_errors: report.errors.length
    };

    return Response.json({
      success: true,
      dry_run,
      report
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});