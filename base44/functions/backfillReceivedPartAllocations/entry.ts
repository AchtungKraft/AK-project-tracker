import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import _ from 'npm:lodash@4.17.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { dry_run = true } = await req.json();
    let summary = {
      parts_checked: 0,
      commitments_updated: 0,
      total_qty_allocated: 0,
      logs: [],
    };

    // 1. Get all Parts and Commitments
    const parts = await base44.asServiceRole.entities.Part.list('-created_date', 5000);
    const commitments = await base44.asServiceRole.entities.PartCommitment.list('-created_date', 10000);

    const partsMap = new Map(parts.map(p => [p.id, p]));
    const commitmentsByPart = _.groupBy(commitments, 'part_id');

    summary.parts_checked = parts.length;

    // 2. Process each part
    for (const partId of Object.keys(commitmentsByPart)) {
      const partRecord = partsMap.get(partId);
      if (!partRecord) {
        summary.logs.push(`Part ${partId} found in commitments but not in Parts entity. Skipping.`);
        continue;
      }

      const partCommitments = commitmentsByPart[partId];
      const physical_stock = partRecord.physical_stock || 0;
      const total_reserved = _.sumBy(partCommitments, c => c.reserved_from_stock || 0);
      let available_stock = physical_stock - total_reserved;

      if (available_stock <= 0) {
        continue;
      }
      
      // 3. Identify and sort needy commitments (COVERAGE-SAFE)
      // Gap = required_total - reserved_from_stock - covered_from_po
      // Only include commitments where gap > 0
      const needyCommitments = partCommitments.filter(c => {
        if (c.is_archived || c.commitment_status === 'cancelled' || c.commitment_status === 'closed') return false;
        const required = c.required_total || 0;
        const reserved = c.reserved_from_stock || 0;
        const covered = c.covered_from_po || 0;
        const gap = required - reserved - covered;
        return gap > 0;
      });
      
      const sortedNeedyCommitments = _.sortBy(needyCommitments, c => new Date(c.created_date));

      // 4. Allocate available stock (COVERAGE-SAFE)
      for (const commitment of sortedNeedyCommitments) {
        if (available_stock <= 0) {
          break; // No more stock for this part
        }

        const required = commitment.required_total || 0;
        const reserved_before = commitment.reserved_from_stock || 0;
        const covered_po = commitment.covered_from_po || 0;
        const gap = required - reserved_before - covered_po;

        // Skip if fully covered by PO or no gap
        if (gap <= 0) continue;

        const qty_to_allocate = Math.min(available_stock, gap);

        // Invariant validation: ensure no over-allocation
        const new_reserved = reserved_before + qty_to_allocate;
        if (new_reserved + covered_po > required) {
          summary.logs.push(`INVARIANT VIOLATION PREVENTED: Part ${partId}, commitment ${commitment.id} — reserved(${new_reserved}) + covered_po(${covered_po}) = ${new_reserved + covered_po} > required(${required}). Skipping.`);
          continue;
        }

        if (qty_to_allocate > 0) {
          const log_message = `Part ${partId} (Avail: ${available_stock.toFixed(2)}): Allocating ${qty_to_allocate.toFixed(2)} to commitment ${commitment.id} | required=${required} reserved_before=${reserved_before} covered_po=${covered_po} gap=${gap}`;
          summary.logs.push(log_message);

          if (!dry_run) {

            try {
              // Update commitment
              await base44.asServiceRole.entities.PartCommitment.update(
                commitment.id,
                { reserved_from_stock: new_reserved },
              );

              // Create audit log
              await base44.asServiceRole.entities.CommitmentAuditLog.create({
                commitment_id: commitment.id,
                action_type: 'qty_change',
                previous_values: { reserved_from_stock: reserved_before },
                new_values: { reserved_from_stock: new_reserved },
                trigger_source: 'manual',
                triggered_by: user.email,
                actor_email: user.email,
                notes: `Backfill allocation: gap=${gap}, allocated=${qty_to_allocate}, covered_po=${covered_po}`,
              });

              summary.commitments_updated++;
              summary.total_qty_allocated += qty_to_allocate;

            } catch (e) {
              summary.logs.push(`ERROR updating commitment ${commitment.id}: ${JSON.stringify(e)}`);
            }
          } else {
             // In dry run, just log and decrement available stock as if it worked
             summary.commitments_updated++;
             summary.total_qty_allocated += qty_to_allocate;
          }
          
          available_stock -= qty_to_allocate;
        }
      }
    }
    
    // Final audit: verify no violations were introduced
    if (!dry_run && summary.commitments_updated > 0) {
      const postCheck = [];
      const updatedCommitments = await base44.asServiceRole.entities.PartCommitment.list('-updated_date', 100);
      for (const c of updatedCommitments) {
        const req = c.required_total || 0;
        const res = c.reserved_from_stock || 0;
        const cov = c.covered_from_po || 0;
        if (res + cov > req + 0.001) {
          postCheck.push({ commitment_id: c.id, required_total: req, reserved_from_stock: res, covered_from_po: cov, total: res + cov, overallocation: (res + cov) - req });
        }
      }
      if (postCheck.length > 0) {
        summary.post_audit_violations = postCheck;
        summary.logs.push(`POST-AUDIT: ${postCheck.length} invariant violations detected after backfill`);
      }
    }

    return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Backfill Error:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});