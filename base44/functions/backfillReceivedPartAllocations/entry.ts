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
      
      // 3. Identify and sort needy commitments
      const needyCommitments = partCommitments.filter(c => 
        (c.required_total || 0) > (c.reserved_from_stock || 0) &&
        !c.is_archived && 
        c.commitment_status !== 'cancelled' && 
        c.commitment_status !== 'closed'
      );
      
      const sortedNeedyCommitments = _.sortBy(needyCommitments, c => new Date(c.created_date));

      // 4. Allocate available stock
      for (const commitment of sortedNeedyCommitments) {
        if (available_stock <= 0) {
          break; // No more stock for this part
        }

        const needed_qty = (commitment.required_total || 0) - (commitment.reserved_from_stock || 0);
        const qty_to_allocate = Math.min(available_stock, needed_qty);

        if (qty_to_allocate > 0) {
          const log_message = `Part ${partId} (Avail: ${available_stock.toFixed(2)}): Allocating ${qty_to_allocate.toFixed(2)} to commitment ${commitment.id} (Needed: ${needed_qty.toFixed(2)})`;
          summary.logs.push(log_message);

          if (!dry_run) {
            const previous_reserved = commitment.reserved_from_stock || 0;
            const new_reserved = previous_reserved + qty_to_allocate;

            try {
              // Update commitment
              await base44.asServiceRole.entities.PartCommitment.update(
                { id: commitment.id },
                { reserved_from_stock: new_reserved },
              );

              // Create audit log
              await base44.asServiceRole.entities.CommitmentAuditLog.create([{
                commitment_id: commitment.id,
                action_type: 'qty_change',
                previous_values: { reserved_from_stock: previous_reserved },
                new_values: { reserved_from_stock: new_reserved },
                trigger_source: 'manual',
                triggered_by: user.email,
                actor_email: user.email,
                notes: 'Backfill allocation after receiving',
              }]);

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
    
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Backfill Error:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});