import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * MIGRATE LEGACY LINE ITEMS TO COMMITMENTS
 * 
 * Links orphan PartPurchaseLineItem records (commitment_id=null) to their
 * corresponding PartCommitment records using deterministic matching.
 * 
 * Matching strategy:
 * 1. Direct match: part_id + project_id (via Order)
 * 2. Only link if exactly ONE commitment matches (deterministic)
 * 3. Quarantine if no match or multiple matches
 */

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
    const {
      dry_run = true,
      batch_size = 10,
      delay_ms = 200,
      tol = 0.01
    } = body;

    const report = {
      timestamp: new Date().toISOString(),
      dry_run,
      params: { batch_size, delay_ms, tol },
      scanned: 0,
      already_linked: 0,
      linked: 0,
      quarantined: 0,
      repaired: 0,
      errors: [],
      linked_items: [],
      quarantined_items: [],
      sample_ids: {
        linked: [],
        quarantined: []
      }
    };

    // Load data in parallel but limit scope for performance
    const [lineItems, commitments, orders] = await Promise.all([
      base44.asServiceRole.entities.PartPurchaseLineItem.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.PartCommitment.filter({}, '-created_date', 1000),
      base44.asServiceRole.entities.Order.filter({}, '-created_date', 500)
    ]);

    console.log(`📊 Loaded: ${lineItems.length} line items, ${commitments.length} commitments, ${orders.length} orders`);

    // Build lookup maps
    const ordersMap = new Map(orders.map(o => [o.id, o]));
    
    // Build commitment index by project_id + part_id
    const commitmentsByProjectPart = new Map();
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled') continue;
      const key = `${c.project_id}:${c.part_id}`;
      if (!commitmentsByProjectPart.has(key)) {
        commitmentsByProjectPart.set(key, []);
      }
      commitmentsByProjectPart.get(key).push(c);
    }

    // Find orphan line items (no commitment_id)
    const orphanLineItems = lineItems.filter(li => !li.commitment_id);
    report.scanned = lineItems.length;

    console.log(`🔍 Found ${orphanLineItems.length} orphan line items to process`);

    const pendingUpdates = [];

    for (const lineItem of orphanLineItems) {
      const order = ordersMap.get(lineItem.order_id);
      
      // Determine project_id from order or requirement
      let project_id = null;
      if (order) {
        // Orders don't have project_id directly, need to infer from line items or other data
        // Try to find project from requirement if available
        if (lineItem.requirement_id) {
          // Requirements have project_id
          const commitmentFromReq = commitments.find(c => c.requirement_id === lineItem.requirement_id);
          if (commitmentFromReq) {
            project_id = commitmentFromReq.project_id;
          }
        }
        
        // If still no project_id, try to find from other line items on same order
        if (!project_id) {
          const siblingLines = lineItems.filter(li => li.order_id === lineItem.order_id && li.commitment_id);
          if (siblingLines.length > 0) {
            const siblingCommitment = commitments.find(c => c.id === siblingLines[0].commitment_id);
            if (siblingCommitment) {
              project_id = siblingCommitment.project_id;
            }
          }
        }

        // Last resort: check if part has any commitments with same qty
        if (!project_id) {
          const partCommitments = commitments.filter(c => 
            c.part_id === lineItem.part_id && 
            c.commitment_status !== 'cancelled'
          );
          
          // If only one commitment for this part, use it
          if (partCommitments.length === 1) {
            project_id = partCommitments[0].project_id;
          }
        }
      }

      // Try to find matching commitment
      let matchedCommitment = null;
      let matchReason = '';
      
      if (project_id && lineItem.part_id) {
        const key = `${project_id}:${lineItem.part_id}`;
        const candidates = commitmentsByProjectPart.get(key) || [];
        
        if (candidates.length === 1) {
          matchedCommitment = candidates[0];
          matchReason = 'unique_project_part_match';
        } else if (candidates.length > 1) {
          // Try to narrow down by qty
          const qtyMatches = candidates.filter(c => 
            Math.abs((c.qty_committed || 0) - (lineItem.qty_ordered || 0)) < 0.01
          );
          if (qtyMatches.length === 1) {
            matchedCommitment = qtyMatches[0];
            matchReason = 'unique_qty_match';
          } else {
            matchReason = `multiple_candidates:${candidates.length}`;
          }
        } else {
          matchReason = 'no_commitment_found';
        }
      } else if (!project_id) {
        // Try direct part match if only one commitment exists for this part
        const partCommitments = commitments.filter(c => 
          c.part_id === lineItem.part_id && 
          c.commitment_status !== 'cancelled'
        );
        
        if (partCommitments.length === 1) {
          matchedCommitment = partCommitments[0];
          matchReason = 'unique_part_match_no_project';
        } else if (partCommitments.length > 1) {
          matchReason = `no_project_id:multiple_part_commitments:${partCommitments.length}`;
        } else {
          matchReason = 'no_project_id:no_commitments';
        }
      }

      // Prepare update
      const updateData = {
        is_legacy: true
      };

      if (matchedCommitment) {
        // Link to commitment
        const snapshot = matchedCommitment.unit_cost_snapshot || 0;
        const retailSnapshot = matchedCommitment.unit_retail_snapshot || 0;
        const qty = lineItem.qty_ordered || 1;
        
        updateData.commitment_id = matchedCommitment.id;
        updateData.legacy_link_status = 'linked';
        updateData.legacy_reason = matchReason;
        
        // Set cost from snapshot
        if (snapshot > 0) {
          updateData.unit_cost = snapshot;
          updateData.extended_cost = snapshot * qty;
          updateData.cost_source_reference = `commitment_snapshot_migration:${matchedCommitment.id}`;
        }
        
        // Set display-only retail
        if (retailSnapshot > 0) {
          updateData.unit_retail = retailSnapshot;
          updateData.retail_source_reference = `commitment_snapshot:${matchedCommitment.id}`;
        }
        
        report.linked_items.push({
          line_item_id: lineItem.id,
          part_id: lineItem.part_id,
          commitment_id: matchedCommitment.id,
          project_id: matchedCommitment.project_id,
          reason: matchReason,
          old_cost: lineItem.unit_cost || lineItem.unit_price,
          new_cost: snapshot,
          retail_snapshot: retailSnapshot
        });
        
        if (report.sample_ids.linked.length < 10) {
          report.sample_ids.linked.push(lineItem.id);
        }
        
      } else {
        // Quarantine
        updateData.legacy_link_status = 'quarantined';
        updateData.legacy_reason = matchReason;
        
        report.quarantined_items.push({
          line_item_id: lineItem.id,
          part_id: lineItem.part_id,
          order_id: lineItem.order_id,
          reason: matchReason
        });
        
        if (report.sample_ids.quarantined.length < 10) {
          report.sample_ids.quarantined.push(lineItem.id);
        }
      }

      pendingUpdates.push({
        id: lineItem.id,
        data: updateData,
        isLink: !!matchedCommitment
      });
    }

    // Count already linked items
    report.already_linked = lineItems.filter(li => li.commitment_id).length;

    // Apply updates
    if (!dry_run && pendingUpdates.length > 0) {
      for (let i = 0; i < pendingUpdates.length; i++) {
        const { id, data, isLink } = pendingUpdates[i];
        try {
          await base44.asServiceRole.entities.PartPurchaseLineItem.update(id, data);
          if (isLink) {
            report.linked++;
            report.repaired++;
          } else {
            report.quarantined++;
          }
        } catch (error) {
          if (error.message?.includes('Rate limit')) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              await base44.asServiceRole.entities.PartPurchaseLineItem.update(id, data);
              if (isLink) {
                report.linked++;
                report.repaired++;
              } else {
                report.quarantined++;
              }
            } catch (retryError) {
              report.errors.push({ line_item_id: id, error: retryError.message });
            }
          } else {
            report.errors.push({ line_item_id: id, error: error.message });
          }
        }
        
        // Rate limit delay
        if (i > 0 && i % batch_size === 0) {
          await new Promise(r => setTimeout(r, delay_ms));
        } else {
          await new Promise(r => setTimeout(r, 50));
        }
      }
    } else {
      // Dry run - count what would happen
      for (const { isLink } of pendingUpdates) {
        if (isLink) {
          report.linked++;
        } else {
          report.quarantined++;
        }
      }
    }

    // Trim detailed lists for response size
    if (report.linked_items.length > 20) {
      report.linked_items = report.linked_items.slice(0, 20);
      report.linked_items_truncated = true;
    }
    if (report.quarantined_items.length > 20) {
      report.quarantined_items = report.quarantined_items.slice(0, 20);
      report.quarantined_items_truncated = true;
    }

    report.summary = {
      total_line_items: report.scanned,
      already_linked: report.already_linked,
      orphans_processed: orphanLineItems.length,
      would_link: dry_run ? report.linked : undefined,
      would_quarantine: dry_run ? report.quarantined : undefined,
      linked: dry_run ? undefined : report.linked,
      quarantined: dry_run ? undefined : report.quarantined,
      repaired: dry_run ? undefined : report.repaired,
      errors: report.errors.length
    };

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