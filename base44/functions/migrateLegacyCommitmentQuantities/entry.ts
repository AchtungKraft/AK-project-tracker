import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * migrateLegacyCommitmentQuantities - Migrate to Canonical Field Model
 * 
 * Migration logic:
 * - required_total = qty_committed (or 0)
 * - reserved_from_stock = min(qty_reserved, physical_stock available)
 * - covered_from_po = qty_ordered - qty_received
 * - supply_source_type derived from part_type
 * 
 * Also recomputes Part derived fields:
 * - allocated_stock = SUM(reserved_from_stock)
 * - on_order = SUM(open PO line qty remaining)
 * 
 * Runs audit after migration.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true, project_id, batch_size = 100 } = await req.json();

    const results = {
      commitments_processed: 0,
      commitments_updated: 0,
      parts_processed: 0,
      parts_updated: 0,
      errors: [],
      changes: []
    };

    // Fetch commitments
    const commitmentFilter = project_id ? { project_id } : {};
    let commitments = await base44.entities.PartCommitment.filter(commitmentFilter);
    
    // Limit batch
    if (commitments.length > batch_size) {
      commitments = commitments.slice(0, batch_size);
      results.truncated = true;
      results.total_commitments = commitments.length;
    }

    // Fetch all parts for these commitments
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const parts = await base44.entities.Part.filter({ id: { $in: partIds } });
    const partMap = new Map(parts.map(p => [p.id, p]));

    // Fetch open PO line items
    const lineItems = await base44.entities.PartPurchaseLineItem.filter({
      part_id: { $in: partIds },
      status: { $in: ['Ordered', 'Partial'] }
    });

    // Build allocation tracker per part
    const allocationTracker = new Map(); // part_id -> total reserved so far

    // Process commitments
    for (const commitment of commitments) {
      results.commitments_processed++;
      
      try {
        const part = partMap.get(commitment.part_id);
        if (!part) {
          results.errors.push({
            commitment_id: commitment.id,
            error: 'Part not found',
            part_id: commitment.part_id
          });
          continue;
        }

        const physical_stock = part.physical_stock ?? 0;
        
        // Get current allocation for this part
        const currentAllocation = allocationTracker.get(commitment.part_id) || 0;
        const availableStock = Math.max(0, physical_stock - currentAllocation);

        // Compute canonical fields from legacy
        const legacy_committed = commitment.qty_committed ?? 0;
        const legacy_reserved = commitment.qty_reserved ?? 0;
        const legacy_ordered = commitment.qty_ordered ?? 0;
        const legacy_received = commitment.qty_received ?? 0;

        // Map to canonical
        const required_total = commitment.required_total ?? legacy_committed;
        const reserved_from_stock = Math.min(
          commitment.reserved_from_stock ?? legacy_reserved,
          availableStock,
          required_total
        );
        const covered_from_po = commitment.covered_from_po ?? Math.max(0, legacy_ordered - legacy_received);

        // Derive supply_source_type from part_type
        let supply_source_type = commitment.supply_source_type;
        if (!supply_source_type) {
          const partType = part.part_type || 'PURCHASED_VENDOR';
          switch (partType) {
            case 'STOCK_AK':
              supply_source_type = 'STOCK';
              break;
            case 'CLIENT_SUPPLIED':
              supply_source_type = 'CLIENT_SUPPLIED';
              break;
            case 'AK_MANUFACTURED':
              supply_source_type = 'AK_CUSTOM';
              break;
            case 'TAKE_OFF':
              supply_source_type = 'TAKE_OFF';
              break;
            default:
              supply_source_type = 'VENDOR';
          }
        }

        // Track allocation
        allocationTracker.set(commitment.part_id, currentAllocation + reserved_from_stock);

        // Check if update needed
        const needsUpdate = 
          commitment.required_total !== required_total ||
          commitment.reserved_from_stock !== reserved_from_stock ||
          commitment.covered_from_po !== covered_from_po ||
          commitment.supply_source_type !== supply_source_type;

        if (needsUpdate) {
          const change = {
            commitment_id: commitment.id,
            part_name: part.part_name,
            old: {
              required_total: commitment.required_total,
              reserved_from_stock: commitment.reserved_from_stock,
              covered_from_po: commitment.covered_from_po,
              supply_source_type: commitment.supply_source_type
            },
            new: {
              required_total,
              reserved_from_stock,
              covered_from_po,
              supply_source_type
            }
          };
          results.changes.push(change);

          if (!dry_run) {
            await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
              required_total,
              reserved_from_stock,
              covered_from_po,
              supply_source_type,
              commitment_version: (commitment.commitment_version ?? 0) + 1
            });
            results.commitments_updated++;
          }
        }

      } catch (error) {
        results.errors.push({
          commitment_id: commitment.id,
          error: error.message
        });
      }
    }

    // Update Part derived fields
    for (const part of parts) {
      results.parts_processed++;
      
      try {
        const partCommitments = commitments.filter(c => c.part_id === part.id);
        const partLineItems = lineItems.filter(li => li.part_id === part.id);

        // Compute allocated_stock
        const computed_allocated = allocationTracker.get(part.id) || 0;

        // Compute on_order
        const computed_on_order = partLineItems.reduce((sum, li) => {
          const ordered = li.qty_ordered ?? 0;
          const received = li.qty_received ?? 0;
          return sum + Math.max(0, ordered - received);
        }, 0);

        const needsUpdate = 
          part.allocated_stock !== computed_allocated ||
          part.on_order !== computed_on_order;

        if (needsUpdate) {
          const change = {
            part_id: part.id,
            part_name: part.part_name,
            old: {
              allocated_stock: part.allocated_stock,
              on_order: part.on_order
            },
            new: {
              allocated_stock: computed_allocated,
              on_order: computed_on_order
            }
          };
          results.changes.push(change);

          if (!dry_run) {
            await base44.asServiceRole.entities.Part.update(part.id, {
              allocated_stock: computed_allocated,
              on_order: computed_on_order
            });
            results.parts_updated++;
          }
        }

      } catch (error) {
        results.errors.push({
          part_id: part.id,
          error: error.message
        });
      }
    }

    // Run post-migration audit if not dry run
    let audit_result = null;
    if (!dry_run) {
      try {
        const auditResponse = await base44.functions.invoke('runSupplyIntegrityAudit', {
          project_id
        });
        audit_result = auditResponse.data;
      } catch (e) {
        audit_result = { error: e.message };
      }
    }

    return Response.json({
      success: true,
      dry_run,
      results,
      audit_result,
      migration_complete: !dry_run && results.errors.length === 0
    });

  } catch (error) {
    console.error("migrateLegacyCommitmentQuantities error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});