import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * recomputeOnOrderForParts - Fix on_order drift
 * 
 * on_order = SUM(qty_ordered - qty_received) for open PO line items
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

    // Fetch parts
    const partsFilter = part_ids && part_ids.length > 0 ? { id: { $in: part_ids } } : {};
    const parts = await base44.entities.Part.filter(partsFilter);

    // Fetch open PO line items
    const lineItems = await base44.entities.PartPurchaseLineItem.filter({
      status: { $in: ['Ordered', 'Partial'] }
    });

    // Group line items by part
    const lineItemsByPart = new Map();
    for (const li of lineItems) {
      if (!lineItemsByPart.has(li.part_id)) {
        lineItemsByPart.set(li.part_id, []);
      }
      lineItemsByPart.get(li.part_id).push(li);
    }

    const updates = [];
    const drifts = [];

    for (const part of parts) {
      const partLineItems = lineItemsByPart.get(part.id) || [];
      
      // Compute on_order
      const computed_on_order = partLineItems.reduce((sum, li) => {
        const ordered = li.qty_ordered ?? 0;
        const received = li.qty_received ?? 0;
        return sum + Math.max(0, ordered - received);
      }, 0);

      const stored_on_order = part.on_order ?? 0;
      const drift = computed_on_order - stored_on_order;

      if (drift !== 0) {
        drifts.push({
          part_id: part.id,
          part_name: part.part_name,
          stored_on_order,
          computed_on_order,
          drift,
          open_line_items: partLineItems.length
        });

        if (!isDryRun) {
          await base44.asServiceRole.entities.Part.update(part.id, {
            on_order: computed_on_order
          });
          updates.push({ part_id: part.id, new_on_order: computed_on_order });
        }
      }
    }

    return Response.json({
      success: true,
      mode,
      parts_checked: parts.length,
      drifts_found: drifts.length,
      updates_applied: isDryRun ? 0 : updates.length,
      drifts,
      updates: isDryRun ? [] : updates
    });

  } catch (error) {
    console.error("recomputeOnOrderForParts error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});