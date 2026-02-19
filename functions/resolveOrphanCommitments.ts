import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * resolveOrphanCommitments - Auto-resolve orphaned commitments
 * 
 * Modes:
 * - DRY_RUN: Preview changes without executing
 * - EXECUTE: Apply changes
 * 
 * Actions:
 * - REPLACE: Link to existing matching Part
 * - REATTACH: Create recovered Part and link
 * - CANCEL: Cancel orphan (only if no history)
 * - QUARANTINE: Mark as blocked_orphan for manual review
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

    const { 
      mode = 'DRY_RUN', 
      commitment_ids,
      min_confidence = 0,
      actions_filter, // Optional: ['REPLACE', 'REATTACH', 'CANCEL', 'QUARANTINE']
      force_resolution, // Override: force all to specific action (e.g., 'CANCEL')
      limit = 10 // Process in batches to avoid CPU limits
    } = await req.json();

    const isDryRun = mode === 'DRY_RUN';

    // If commitment_ids provided, use direct lookup (skip report for efficiency)
    let orphans = [];
    
    if (commitment_ids && commitment_ids.length > 0) {
      // Direct mode - just fetch these commitments
      const commitments = await base44.asServiceRole.entities.PartCommitment.filter({
        id: { $in: commitment_ids }
      });
      orphans = commitments.map(c => ({
        commitment_id: c.id,
        project_id: c.project_id,
        commitment_status: c.commitment_status,
        missing_part_id: c.part_id,
        line_items_count: 0,
        installed_parts_count: 0,
        has_financial_history: false,
        has_install_history: false,
        recommended_resolution: 'CANCEL',
        confidence: 70,
        identifiers: { notes: c.notes }
      }));
    } else {
      // Get orphan report - use service role to call internal function
      const reportResponse = await base44.asServiceRole.functions.invoke('getOrphanCommitmentReport', {});
      if (reportResponse.data?.error) {
        throw new Error(reportResponse.data.error);
      }
      orphans = reportResponse.data?.orphans || [];
    }

    // Filter by commitment_ids if provided
    if (commitment_ids && commitment_ids.length > 0) {
      orphans = orphans.filter(o => commitment_ids.includes(o.commitment_id));
    }

    // Filter by min confidence
    if (min_confidence > 0) {
      orphans = orphans.filter(o => o.confidence >= min_confidence);
    }

    // Filter by actions
    if (actions_filter && actions_filter.length > 0) {
      orphans = orphans.filter(o => actions_filter.includes(o.recommended_resolution));
    }

    // Apply limit for batching
    const totalOrphans = orphans.length;
    orphans = orphans.slice(0, limit);

    const results = {
      mode,
      processed: 0,
      replaced: [],
      reattached: [],
      cancelled: [],
      quarantined: [],
      skipped: [],
      errors: []
    };

    // Fetch all parts for matching
    const allParts = await base44.entities.Part.filter({});
    const partByVPN = new Map();
    const partByNormalizedName = new Map();
    
    for (const p of allParts) {
      if (p.vendor_part_number) {
        partByVPN.set(p.vendor_part_number.toLowerCase().trim(), p);
      }
      if (p.part_name) {
        const normalized = p.part_name.toLowerCase().trim().replace(/\s+/g, ' ');
        if (!partByNormalizedName.has(normalized)) {
          partByNormalizedName.set(normalized, p);
        }
      }
    }

    for (const orphan of orphans) {
      results.processed++;

      try {
        // Force resolution override logic:
        // If force_resolution is set AND orphan has no real history, use forced action
        let action = orphan.recommended_resolution;
        
        if (force_resolution) {
          const hasRealHistory = 
            orphan.line_items_count > 0 ||
            orphan.installed_parts_count > 0 ||
            orphan.has_financial_history ||
            orphan.has_install_history;
          
          if (!hasRealHistory) {
            action = force_resolution;
          }
        }

        switch (action) {
          case 'REPLACE': {
            // Find matching part
            let matchPart = null;
            
            if (orphan.match_candidate) {
              matchPart = allParts.find(p => p.id === orphan.match_candidate);
            }
            
            if (!matchPart && orphan.vendor_part_number) {
              matchPart = partByVPN.get(orphan.vendor_part_number.toLowerCase().trim());
            }

            if (!matchPart) {
              results.skipped.push({
                commitment_id: orphan.commitment_id,
                reason: 'No matching part found for REPLACE',
                fallback: 'REATTACH'
              });
              // Fall through to REATTACH
              // Continue to reattach logic below
            } else {
              const mapping = {
                commitment_id: orphan.commitment_id,
                old_part_id: orphan.missing_part_id,
                new_part_id: matchPart.id,
                new_part_name: matchPart.part_name,
                confidence: orphan.confidence
              };

              if (!isDryRun) {
                // Update commitment with new part_id
                await base44.asServiceRole.entities.PartCommitment.update(orphan.commitment_id, {
                  part_id: matchPart.id,
                  integrity_warning: false,
                  integrity_warning_details: null,
                  notes: (orphan.identifiers?.notes || '') + `\n[Recovered: part_id replaced from ${orphan.missing_part_id} to ${matchPart.id}]`
                });

                // Update any line items
                if (orphan.line_items_count > 0) {
                  const lineItems = await base44.entities.PartPurchaseLineItem.filter({
                    commitment_id: orphan.commitment_id
                  });
                  for (const li of lineItems) {
                    await base44.asServiceRole.entities.PartPurchaseLineItem.update(li.id, {
                      part_id: matchPart.id
                    });
                  }
                }

                // Log lifecycle event
                await base44.asServiceRole.entities.LifecycleEvent.create({
                  entity_type: 'PartCommitment',
                  entity_id: orphan.commitment_id,
                  event_type: 'ORPHAN_RESOLVED',
                  actor_email: user.email,
                  details: JSON.stringify({
                    action: 'REPLACE',
                    old_part_id: orphan.missing_part_id,
                    new_part_id: matchPart.id
                  }),
                  created_date: new Date().toISOString()
                });
              }

              results.replaced.push(mapping);
              continue;
            }
          }
          // Fall through if no match found

          case 'REATTACH': {
            // Create a recovered part
            const recoveredPartData = {
              part_name: `[Recovered] Part ${orphan.missing_part_id.slice(-6)}`,
              vendor_part_number: orphan.vendor_part_number || null,
              default_vendor_id: orphan.vendor_id || null,
              notes: `Recovered from orphaned commitment ${orphan.commitment_id}. Original part_id: ${orphan.missing_part_id}`,
              is_active: true,
              is_archived: false,
              cost: orphan.identifiers?.unit_cost_snapshot || 0,
              // Mark as recovered for tracking
              needs_cost_review: true,
              cost_source: 'unknown'
            };

            const mapping = {
              commitment_id: orphan.commitment_id,
              old_part_id: orphan.missing_part_id,
              new_part_data: recoveredPartData,
              confidence: orphan.confidence
            };

            if (!isDryRun) {
              // Create recovered part
              const newPart = await base44.asServiceRole.entities.Part.create(recoveredPartData);

              // Update commitment
              await base44.asServiceRole.entities.PartCommitment.update(orphan.commitment_id, {
                part_id: newPart.id,
                integrity_warning: false,
                integrity_warning_details: null,
                notes: (orphan.identifiers?.notes || '') + `\n[Recovered: new part created ${newPart.id}]`
              });

              // Update line items
              if (orphan.line_items_count > 0) {
                const lineItems = await base44.entities.PartPurchaseLineItem.filter({
                  commitment_id: orphan.commitment_id
                });
                for (const li of lineItems) {
                  await base44.asServiceRole.entities.PartPurchaseLineItem.update(li.id, {
                    part_id: newPart.id
                  });
                }
              }

              // Log lifecycle event
              await base44.asServiceRole.entities.LifecycleEvent.create({
                entity_type: 'PartCommitment',
                entity_id: orphan.commitment_id,
                event_type: 'ORPHAN_RESOLVED',
                actor_email: user.email,
                details: JSON.stringify({
                  action: 'REATTACH',
                  old_part_id: orphan.missing_part_id,
                  new_part_id: newPart.id
                }),
                created_date: new Date().toISOString()
              });

              mapping.new_part_id = newPart.id;
            }

            results.reattached.push(mapping);
            break;
          }

          case 'CANCEL': {
            // Only cancel if no history
            if (orphan.has_financial_history || orphan.has_install_history) {
              results.skipped.push({
                commitment_id: orphan.commitment_id,
                reason: 'Cannot cancel - has financial or install history',
                has_financial: orphan.has_financial_history,
                has_install: orphan.has_install_history
              });
              continue;
            }

            const mapping = {
              commitment_id: orphan.commitment_id,
              old_part_id: orphan.missing_part_id,
              reason: orphan.match_reason
            };

            if (!isDryRun) {
              await base44.asServiceRole.entities.PartCommitment.update(orphan.commitment_id, {
                commitment_status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: user.email,
                cancelled_reason: 'Orphan resolution - no history, test/placeholder record'
              });

              await base44.asServiceRole.entities.LifecycleEvent.create({
                entity_type: 'PartCommitment',
                entity_id: orphan.commitment_id,
                event_type: 'ORPHAN_RESOLVED',
                actor_email: user.email,
                details: JSON.stringify({ action: 'CANCEL', reason: 'No history' }),
                created_date: new Date().toISOString()
              });
            }

            results.cancelled.push(mapping);
            break;
          }

          case 'QUARANTINE':
          default: {
            const mapping = {
              commitment_id: orphan.commitment_id,
              old_part_id: orphan.missing_part_id,
              reason: 'Insufficient identifiers for auto-resolution'
            };

            if (!isDryRun) {
              await base44.asServiceRole.entities.PartCommitment.update(orphan.commitment_id, {
                commitment_status: 'cancelled', // Using cancelled as closest to blocked
                integrity_warning: true,
                integrity_warning_details: 'QUARANTINED: Orphaned commitment requires manual review'
              });

              await base44.asServiceRole.entities.LifecycleEvent.create({
                entity_type: 'PartCommitment',
                entity_id: orphan.commitment_id,
                event_type: 'ORPHAN_QUARANTINED',
                actor_email: user.email,
                details: JSON.stringify({ action: 'QUARANTINE' }),
                created_date: new Date().toISOString()
              });
            }

            results.quarantined.push(mapping);
            break;
          }
        }

      } catch (error) {
        results.errors.push({
          commitment_id: orphan.commitment_id,
          error: error.message
        });
      }
    }

    // Summary
    const summary = {
      total_orphans: totalOrphans,
      batch_size: limit,
      remaining: totalOrphans - orphans.length,
      total_processed: results.processed,
      replaced: results.replaced.length,
      reattached: results.reattached.length,
      cancelled: results.cancelled.length,
      quarantined: results.quarantined.length,
      skipped: results.skipped.length,
      errors: results.errors.length
    };

    return Response.json({
      success: true,
      mode,
      summary,
      results,
      has_more: totalOrphans > orphans.length
    });

  } catch (error) {
    console.error("resolveOrphanCommitments error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});