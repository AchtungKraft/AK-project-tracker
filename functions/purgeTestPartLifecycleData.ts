/**
 * purgeTestPartLifecycleData - Safe cascade cleanup of test data
 * 
 * Removes TEST_PART_LIFECYCLE records with conservative matching and cascade deletion.
 * Supports dry_run mode and quarantine (soft-delete) mode.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
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
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      dry_run = true,
      limit = 200,
      match_mode = 'strict', // 'strict' or 'contains'
      created_before = null,
      allow_project_names = false,
      hard_delete = false,
      force = false,
      delay_ms = 50
    } = body;

    const TEST_MARKER = 'TEST_PART_LIFECYCLE';
    const batch_id = `purge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    // Result tracking
    const result = {
      status: dry_run ? 'DRY_RUN' : 'APPLIED',
      match_mode,
      limit,
      batch_id,
      parts_scanned: 0,
      parts_matched: 0,
      parts_quarantined_or_deleted: 0,
      commitments_quarantined_or_deleted: 0,
      line_items_quarantined_or_deleted: 0,
      installed_parts_quarantined_or_deleted: 0,
      requirements_quarantined_or_deleted: 0,
      inventory_items_quarantined_or_deleted: 0,
      pool_allocations_quarantined_or_deleted: 0,
      warnings: [],
      samples: {
        parts: [],
        commitments: [],
        line_items: []
      }
    };

    // =========================================================================
    // STEP 1: Find matching Parts
    // =========================================================================
    
    const allParts = await base44.asServiceRole.entities.Part.list();
    result.parts_scanned = allParts.length;

    const matchedParts = allParts.filter(part => {
      // Skip already quarantined
      if (part.is_quarantined) return false;

      let matches = false;

      if (match_mode === 'strict') {
        matches = part.part_name?.startsWith(TEST_MARKER) || false;
      } else {
        matches = part.part_name?.includes(TEST_MARKER) || false;
      }

      // Also check vendor_part_number
      if (!matches && part.vendor_part_number?.includes(TEST_MARKER)) {
        matches = true;
      }

      // Apply created_before filter
      if (matches && created_before) {
        const createdDate = new Date(part.created_date);
        const beforeDate = new Date(created_before);
        if (createdDate >= beforeDate) {
          matches = false;
        }
      }

      return matches;
    }).slice(0, limit);

    result.parts_matched = matchedParts.length;

    // Safety gate
    if (!dry_run && matchedParts.length > 500 && !force) {
      return Response.json({
        error: 'Safety gate: matched more than 500 parts. Set force=true to proceed.',
        parts_matched: matchedParts.length
      }, { status: 400 });
    }

    // Sample parts for preview
    result.samples.parts = matchedParts.slice(0, 10).map(p => ({
      id: p.id,
      part_name: p.part_name,
      vendor_part_number: p.vendor_part_number,
      created_date: p.created_date
    }));

    if (dry_run) {
      // Dry run: just count what would be affected
      for (const part of matchedParts) {
        // Count commitments
        const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ part_id: part.id });
        result.commitments_quarantined_or_deleted += commitments.length;

        for (const c of commitments) {
          // Count line items
          const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id: c.id });
          result.line_items_quarantined_or_deleted += lineItems.length;

          // Count installed parts
          const installed = await base44.asServiceRole.entities.InstalledPart.filter({ commitment_id: c.id });
          result.installed_parts_quarantined_or_deleted += installed.length;

          // Count pool allocations
          const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({ commitment_id: c.id });
          result.pool_allocations_quarantined_or_deleted += allocations.length;
        }

        // Count requirements
        const requirements = await base44.asServiceRole.entities.PartProjectRequirement.filter({ part_id: part.id });
        result.requirements_quarantined_or_deleted += requirements.length;

        // Count inventory
        const inventory = await base44.asServiceRole.entities.InventoryItem.filter({ part_id: part.id });
        result.inventory_items_quarantined_or_deleted += inventory.length;

        result.parts_quarantined_or_deleted++;
      }

      // Sample commitments
      if (matchedParts.length > 0) {
        const sampleCommitments = await base44.asServiceRole.entities.PartCommitment.filter({ part_id: matchedParts[0].id });
        result.samples.commitments = sampleCommitments.slice(0, 5).map(c => ({
          id: c.id,
          project_id: c.project_id,
          part_id: c.part_id,
          qty_committed: c.qty_committed
        }));

        if (sampleCommitments.length > 0) {
          const sampleLineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id: sampleCommitments[0].id });
          result.samples.line_items = sampleLineItems.slice(0, 5).map(li => ({
            id: li.id,
            order_id: li.order_id,
            qty_ordered: li.qty_ordered
          }));
        }
      }

      return Response.json(result);
    }

    // =========================================================================
    // STEP 2: Apply changes (cascade delete/quarantine)
    // =========================================================================

    const quarantineData = {
      is_quarantined: true,
      quarantine_reason: 'TEST_PART_LIFECYCLE_PURGE',
      quarantine_batch_id: batch_id,
      quarantined_at: timestamp
    };

    for (const part of matchedParts) {
      try {
        // Get all commitments for this part
        const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ part_id: part.id });

        for (const commitment of commitments) {
          // 1. Handle PartPurchaseLineItems
          const lineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.filter({ commitment_id: commitment.id });
          for (const li of lineItems) {
            if (hard_delete) {
              await base44.asServiceRole.entities.PartPurchaseLineItem.delete(li.id);
            } else {
              await base44.asServiceRole.entities.PartPurchaseLineItem.update(li.id, quarantineData);
            }
            result.line_items_quarantined_or_deleted++;
            if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
          }

          // 2. Handle InstalledParts
          const installedParts = await base44.asServiceRole.entities.InstalledPart.filter({ commitment_id: commitment.id });
          for (const ip of installedParts) {
            if (hard_delete) {
              await base44.asServiceRole.entities.InstalledPart.delete(ip.id);
            } else {
              await base44.asServiceRole.entities.InstalledPart.update(ip.id, quarantineData);
            }
            result.installed_parts_quarantined_or_deleted++;
            if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
          }

          // 3. Handle PoolAllocations (DO NOT delete pools themselves)
          const allocations = await base44.asServiceRole.entities.PoolAllocation.filter({ commitment_id: commitment.id });
          for (const alloc of allocations) {
            if (hard_delete) {
              await base44.asServiceRole.entities.PoolAllocation.delete(alloc.id);
            } else {
              await base44.asServiceRole.entities.PoolAllocation.update(alloc.id, {
                is_reversed: true,
                reversed_at: timestamp,
                reversed_by: user.id,
                notes: `${alloc.notes || ''} [QUARANTINED: ${batch_id}]`.trim()
              });
            }
            result.pool_allocations_quarantined_or_deleted++;
            if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
          }

          // 4. Delete/quarantine the commitment
          if (hard_delete) {
            await base44.asServiceRole.entities.PartCommitment.delete(commitment.id);
          } else {
            await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
              ...quarantineData,
              commitment_status: 'cancelled',
              cancelled_reason: 'TEST_PART_LIFECYCLE_PURGE'
            });
          }
          result.commitments_quarantined_or_deleted++;
          if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
        }

        // 5. Handle PartProjectRequirements
        const requirements = await base44.asServiceRole.entities.PartProjectRequirement.filter({ part_id: part.id });
        for (const req of requirements) {
          if (hard_delete) {
            await base44.asServiceRole.entities.PartProjectRequirement.delete(req.id);
          } else {
            await base44.asServiceRole.entities.PartProjectRequirement.update(req.id, quarantineData);
          }
          result.requirements_quarantined_or_deleted++;
          if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
        }

        // 6. Handle InventoryItems
        const inventory = await base44.asServiceRole.entities.InventoryItem.filter({ part_id: part.id });
        for (const inv of inventory) {
          if (hard_delete) {
            await base44.asServiceRole.entities.InventoryItem.delete(inv.id);
          } else {
            await base44.asServiceRole.entities.InventoryItem.update(inv.id, quarantineData);
          }
          result.inventory_items_quarantined_or_deleted++;
          if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
        }

        // 7. Finally, delete/quarantine the Part
        if (hard_delete) {
          await base44.asServiceRole.entities.Part.delete(part.id);
        } else {
          await base44.asServiceRole.entities.Part.update(part.id, {
            ...quarantineData,
            is_archived: true,
            archive_reason: 'TEST_PART_LIFECYCLE_PURGE'
          });
        }
        result.parts_quarantined_or_deleted++;

      } catch (error) {
        result.warnings.push(`Error processing part ${part.id}: ${error.message}`);
      }
    }

    return Response.json(result);

  } catch (error) {
    console.error('purgeTestPartLifecycleData error:', error);
    return Response.json({
      error: error.message,
      status: 'ERROR'
    }, { status: 500 });
  }
});