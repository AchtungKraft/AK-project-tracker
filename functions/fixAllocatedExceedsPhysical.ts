import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * fixAllocatedExceedsPhysical - Fix allocation > physical stock issues
 * 
 * Identifies parts where allocated_stock > physical_stock and determines root cause:
 * 1. physical_stock is wrong (inventory records sum higher)
 * 2. allocated_stock is wrong (reservations don't match)
 * 3. Both wrong - quarantine for manual review
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

    const { mode = 'DRY_RUN', part_ids } = await req.json();
    const isDryRun = mode === 'DRY_RUN';

    // Find parts with allocation issues
    const allParts = await base44.entities.Part.filter({});
    
    // Get all active commitments
    const commitments = await base44.entities.PartCommitment.filter({
      commitment_status: { $nin: ['cancelled', 'closed'] }
    });

    // Get inventory receipts for physical stock verification
    const receipts = await base44.entities.InventoryReceipt.filter({});

    // Get installed parts for consumption tracking
    const installedParts = await base44.entities.InstalledPart.filter({});

    // Build maps
    const commitmentsByPart = new Map();
    for (const c of commitments) {
      if (!commitmentsByPart.has(c.part_id)) {
        commitmentsByPart.set(c.part_id, []);
      }
      commitmentsByPart.get(c.part_id).push(c);
    }

    const receiptsByPart = new Map();
    for (const r of receipts) {
      if (!receiptsByPart.has(r.part_id)) {
        receiptsByPart.set(r.part_id, []);
      }
      receiptsByPart.get(r.part_id).push(r);
    }

    const installsByPart = new Map();
    for (const ip of installedParts) {
      if (!installsByPart.has(ip.part_id)) {
        installsByPart.set(ip.part_id, []);
      }
      installsByPart.get(ip.part_id).push(ip);
    }

    const issues = [];
    const fixes = [];

    for (const part of allParts) {
      // Filter by part_ids if provided
      if (part_ids && part_ids.length > 0 && !part_ids.includes(part.id)) {
        continue;
      }

      const physical_stock = part.physical_stock ?? 0;
      const stored_allocated = part.allocated_stock ?? 0;

      // Compute true allocated from commitments
      const partCommitments = commitmentsByPart.get(part.id) || [];
      const computed_allocated = partCommitments.reduce((sum, c) => {
        return sum + (c.reserved_from_stock ?? c.qty_reserved ?? 0);
      }, 0);

      // Compute true physical from receipts minus installations
      const partReceipts = receiptsByPart.get(part.id) || [];
      const partInstalls = installsByPart.get(part.id) || [];
      
      const total_received = partReceipts.reduce((sum, r) => sum + (r.qty_received ?? 0), 0);
      const total_installed = partInstalls.reduce((sum, ip) => sum + (ip.qty_installed ?? 0), 0);
      const computed_physical = total_received - total_installed;

      // Check if this part has allocation > physical issue
      if (computed_allocated > physical_stock || stored_allocated > physical_stock) {
        const issue = {
          part_id: part.id,
          part_name: part.part_name,
          
          // Current stored values
          stored_physical_stock: physical_stock,
          stored_allocated_stock: stored_allocated,
          
          // Computed values
          computed_physical_stock: computed_physical,
          computed_allocated_stock: computed_allocated,
          
          // Trace data
          receipt_count: partReceipts.length,
          total_received,
          install_count: partInstalls.length,
          total_installed,
          commitment_count: partCommitments.length,
          
          // Analysis
          physical_drift: computed_physical - physical_stock,
          allocated_drift: computed_allocated - stored_allocated,
          overage: computed_allocated - physical_stock
        };

        // Determine fix strategy
        let fix_action = 'QUARANTINE';
        let fix_details = {};

        // Case 1: Physical stock is wrong, allocated is correct
        if (computed_physical >= computed_allocated && physical_stock < computed_allocated) {
          fix_action = 'UPDATE_PHYSICAL';
          fix_details = {
            field: 'physical_stock',
            old_value: physical_stock,
            new_value: computed_physical,
            reason: 'Physical stock underreported based on receipt/install records'
          };
        }
        // Case 2: Allocated stock is wrong, physical is correct
        else if (stored_allocated !== computed_allocated && computed_allocated <= physical_stock) {
          fix_action = 'UPDATE_ALLOCATED';
          fix_details = {
            field: 'allocated_stock',
            old_value: stored_allocated,
            new_value: computed_allocated,
            reason: 'Allocated stock drifted from commitment reservations'
          };
        }
        // Case 3: Both need adjustment
        else if (computed_physical !== physical_stock && stored_allocated !== computed_allocated) {
          if (computed_allocated <= computed_physical) {
            fix_action = 'UPDATE_BOTH';
            fix_details = {
              physical: { old: physical_stock, new: computed_physical },
              allocated: { old: stored_allocated, new: computed_allocated },
              reason: 'Both values drifted, computed values are consistent'
            };
          } else {
            fix_action = 'QUARANTINE';
            fix_details = {
              reason: 'Computed allocated still exceeds computed physical - manual review required',
              computed_allocated,
              computed_physical
            };
          }
        }
        // Case 4: Over-reservation on commitments
        else if (computed_allocated > computed_physical) {
          fix_action = 'REDUCE_RESERVATIONS';
          fix_details = {
            reason: 'Reservations exceed available stock - need to reduce commitment reservations',
            excess: computed_allocated - computed_physical,
            commitments: partCommitments.map(c => ({
              id: c.id,
              project_id: c.project_id,
              reserved: c.reserved_from_stock ?? c.qty_reserved ?? 0
            }))
          };
        }

        issue.fix_action = fix_action;
        issue.fix_details = fix_details;
        issues.push(issue);

        // Apply fix if not dry run
        if (!isDryRun && fix_action !== 'QUARANTINE') {
          try {
            if (fix_action === 'UPDATE_PHYSICAL') {
              await base44.asServiceRole.entities.Part.update(part.id, {
                physical_stock: fix_details.new_value
              });
              fixes.push({ part_id: part.id, action: fix_action, success: true });
            } 
            else if (fix_action === 'UPDATE_ALLOCATED') {
              await base44.asServiceRole.entities.Part.update(part.id, {
                allocated_stock: fix_details.new_value
              });
              fixes.push({ part_id: part.id, action: fix_action, success: true });
            }
            else if (fix_action === 'UPDATE_BOTH') {
              await base44.asServiceRole.entities.Part.update(part.id, {
                physical_stock: fix_details.physical.new,
                allocated_stock: fix_details.allocated.new
              });
              fixes.push({ part_id: part.id, action: fix_action, success: true });
            }
            else if (fix_action === 'REDUCE_RESERVATIONS') {
              // Reduce reservations proportionally
              const excess = fix_details.excess;
              let remaining_reduction = excess;
              
              for (const c of partCommitments) {
                if (remaining_reduction <= 0) break;
                
                const current_reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
                const reduction = Math.min(current_reserved, remaining_reduction);
                
                if (reduction > 0) {
                  await base44.asServiceRole.entities.PartCommitment.update(c.id, {
                    reserved_from_stock: current_reserved - reduction,
                    qty_reserved: current_reserved - reduction,
                    integrity_warning: true,
                    integrity_warning_details: `Reservation reduced by ${reduction} to fix over-allocation`
                  });
                  remaining_reduction -= reduction;
                }
              }
              
              // Update part allocated_stock
              await base44.asServiceRole.entities.Part.update(part.id, {
                allocated_stock: computed_allocated - excess
              });
              
              fixes.push({ part_id: part.id, action: fix_action, success: true, reduced: excess });
            }

            // Log lifecycle event
            await base44.asServiceRole.entities.LifecycleEvent.create({
              entity_type: 'Part',
              entity_id: part.id,
              event_type: 'ALLOCATION_FIXED',
              actor_email: user.email,
              details: JSON.stringify({ action: fix_action, ...fix_details }),
              created_date: new Date().toISOString()
            });

          } catch (error) {
            fixes.push({ part_id: part.id, action: fix_action, success: false, error: error.message });
          }
        }
      }
    }

    return Response.json({
      success: true,
      mode,
      issues_found: issues.length,
      fixes_applied: fixes.filter(f => f.success).length,
      issues,
      fixes: isDryRun ? [] : fixes
    });

  } catch (error) {
    console.error("fixAllocatedExceedsPhysical error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});