import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Migration Script: Create PartCommitment records from existing PartProjectRequirement data
 * 
 * SAFETY:
 * - Idempotent: Checks if commitment already exists before creating
 * - Non-destructive: Does not modify or delete any existing data
 * - Logged: Returns detailed migration report
 * - Rollback capable: Commitments can be deleted to restore legacy behavior
 * 
 * ADMIN ONLY: This function requires admin privileges
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dry_run = true } = await req.json().catch(() => ({}));

    // Fetch all data
    const [requirements, lineItems, existingCommitments] = await Promise.all([
      base44.asServiceRole.entities.PartProjectRequirement.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
    ]);

    const report = {
      dry_run,
      timestamp: new Date().toISOString(),
      requirements_scanned: requirements.length,
      line_items_scanned: lineItems.length,
      existing_commitments: existingCommitments.length,
      commitments_created: 0,
      commitments_skipped: 0,
      line_items_linked: 0,
      errors: [],
      created_records: [],
      skipped_records: [],
    };

    // Index existing commitments by requirement_id for duplicate check
    const commitmentsByReqId = {};
    existingCommitments.forEach(c => {
      if (c.requirement_id) {
        if (!commitmentsByReqId[c.requirement_id]) commitmentsByReqId[c.requirement_id] = [];
        commitmentsByReqId[c.requirement_id].push(c);
      }
    });

    // Index line items by requirement_id
    const lineItemsByReqId = {};
    lineItems.forEach(li => {
      if (li.requirement_id) {
        if (!lineItemsByReqId[li.requirement_id]) lineItemsByReqId[li.requirement_id] = [];
        lineItemsByReqId[li.requirement_id].push(li);
      }
    });

    // Process each requirement
    for (const req of requirements) {
      try {
        // Skip if no meaningful data
        if ((req.qty_allocated || 0) === 0 && (req.qty_ordered || 0) === 0 && (req.qty_installed || 0) === 0) {
          // Only create commitment if qty_needed > 0
          if ((req.qty_needed || 0) === 0) {
            report.skipped_records.push({
              requirement_id: req.id,
              reason: 'No quantities to migrate'
            });
            report.commitments_skipped++;
            continue;
          }
        }

        // Check for existing commitment
        if (commitmentsByReqId[req.id]?.length > 0) {
          report.skipped_records.push({
            requirement_id: req.id,
            reason: 'Commitment already exists',
            existing_commitment_ids: commitmentsByReqId[req.id].map(c => c.id)
          });
          report.commitments_skipped++;
          continue;
        }

        // Determine status from quantities
        let status = 'planned';
        const { qty_needed = 0, qty_allocated = 0, qty_ordered = 0, qty_installed = 0 } = req;
        
        if (qty_installed >= qty_needed && qty_needed > 0) {
          status = 'installed';
        } else if (qty_installed > 0) {
          status = 'installed'; // Partial install
        } else if (qty_allocated >= qty_needed && qty_needed > 0) {
          status = 'allocated';
        } else if (qty_allocated > 0) {
          status = 'allocated';
        } else if (qty_ordered > 0) {
          // Check if received
          const reqLineItems = lineItemsByReqId[req.id] || [];
          const totalReceived = reqLineItems.reduce((s, li) => s + (li.qty_received || 0), 0);
          if (totalReceived >= qty_ordered) {
            status = 'received';
          } else if (totalReceived > 0) {
            status = 'partially_received';
          } else {
            status = 'ordered';
          }
        }

        // Collect linked line item IDs
        const linkedLineItemIds = (lineItemsByReqId[req.id] || []).map(li => li.id);
        const totalReceived = (lineItemsByReqId[req.id] || []).reduce((s, li) => s + (li.qty_received || 0), 0);

        const commitmentData = {
          project_id: req.project_id,
          part_id: req.part_id,
          requirement_id: req.id,
          qty_committed: qty_needed,
          qty_ordered: qty_ordered,
          qty_received: totalReceived,
          qty_allocated: qty_allocated,
          qty_installed: qty_installed,
          qty_cancelled: 0,
          commitment_status: status,
          allocation_source: 'migrated_requirement',
          billing_status: 'billable',
          order_line_item_ids: linkedLineItemIds,
          notes: `Migrated from requirement ${req.id}`
        };

        if (!dry_run) {
          const created = await base44.asServiceRole.entities.PartCommitment.create(commitmentData);
          report.created_records.push({
            commitment_id: created.id,
            requirement_id: req.id,
            project_id: req.project_id,
            part_id: req.part_id,
            status: status,
            linked_line_items: linkedLineItemIds.length
          });
        } else {
          report.created_records.push({
            commitment_id: '[DRY RUN]',
            requirement_id: req.id,
            project_id: req.project_id,
            part_id: req.part_id,
            status: status,
            linked_line_items: linkedLineItemIds.length,
            data: commitmentData
          });
        }

        report.commitments_created++;
        report.line_items_linked += linkedLineItemIds.length;

      } catch (err) {
        report.errors.push({
          requirement_id: req.id,
          error: err.message
        });
      }
    }

    // Validation summary
    report.validation = {
      total_commitments_after: dry_run 
        ? report.existing_commitments + report.commitments_created 
        : 'Run query to verify',
      requirements_with_commitments: report.commitments_created + report.commitments_skipped,
      requirements_without_commitments: requirements.length - report.commitments_created - report.commitments_skipped,
    };

    return Response.json(report);

  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});