/**
 * createPurchaseOrdersFromCommitments.js
 * 
 * UNIFIED SUPPLY EXECUTION ENGINE - PO CREATION
 * 
 * This is the CANONICAL entry point for all project-linked PO creation.
 * ProjectSupplyManager MUST route through this function for:
 * - Bulk "Create PO" operations
 * - Single row "Create PO" actions
 * 
 * NO DIRECT Order/PartPurchaseLineItem creation is permitted in the UI
 * for project-linked procurement flows.
 * 
 * Governance:
 * - Validates eligibility per commitment
 * - Groups by vendor for multi-vendor bulk orders
 * - Generates canonical PO numbers (AK-YYYY-####)
 * - Enforces qty invariants
 * - Emits LifecycleEvents
 * - Returns structured results with blocked/created breakdown
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      project_id,
      commitment_ids = [],
      mode = 'BULK', // 'BULK' | 'SINGLE'
      allow_multi_vendor = true,
      override_vendor_id = null,
      eta_date = null,
      notes = null,
      dry_run = false
    } = payload;

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    if (!commitment_ids || commitment_ids.length === 0) {
      return Response.json({ error: 'commitment_ids array is required and must not be empty' }, { status: 400 });
    }

    // Load all required data
    const [commitments, parts, vendors, existingLineItems, poSequences] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.filter({ project_id }),
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.Vendor.list(),
      base44.asServiceRole.entities.PartPurchaseLineItem.list(),
      base44.asServiceRole.entities.POSequence.list(),
    ]);

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const commitmentMap = new Map(commitments.map(c => [c.id, c]));

    // Filter to only requested commitments
    const requestedCommitments = commitment_ids
      .map(id => commitmentMap.get(id))
      .filter(Boolean);

    if (requestedCommitments.length === 0) {
      return Response.json({
        ok: false,
        error: 'No valid commitments found for the provided IDs',
        created_orders: [],
        blocked: commitment_ids.map(id => ({
          commitment_id: id,
          reason_code: 'NOT_FOUND',
          message: 'Commitment not found in project'
        })),
        updated_commitments: [],
        summary: { eligible_count: 0, blocked_count: commitment_ids.length, order_count: 0 }
      });
    }

    // Eligibility check for each commitment
    const eligible = [];
    const blocked = [];

    for (const commitment of requestedCommitments) {
      const part = partMap.get(commitment.part_id);
      const blockReason = checkEligibility(commitment, part, override_vendor_id);
      
      if (blockReason) {
        blocked.push({
          commitment_id: commitment.id,
          reason_code: blockReason.code,
          message: blockReason.message,
          part_name: part?.part_name || 'Unknown'
        });
      } else {
        // Determine vendor
        const vendorId = override_vendor_id || part?.default_vendor_id;
        const vendor = vendorMap.get(vendorId);
        
        eligible.push({
          commitment,
          part,
          vendor_id: vendorId,
          vendor_name: vendor?.vendor_name || 'Unknown Vendor',
          qty_to_order: commitment.qty_to_order || 0,
          unit_cost: commitment.unit_cost_snapshot || part?.cost || part?.default_cost || 0
        });
      }
    }

    // If dry_run, return preview without making changes
    if (dry_run) {
      // Group eligible by vendor for preview
      const vendorGroups = groupByVendor(eligible);
      const preview = Object.entries(vendorGroups).map(([vendorId, items]) => ({
        vendor_id: vendorId,
        vendor_name: items[0]?.vendor_name || 'Unknown',
        commitment_count: items.length,
        total_qty: items.reduce((sum, i) => sum + i.qty_to_order, 0),
        estimated_cost: items.reduce((sum, i) => sum + (i.qty_to_order * i.unit_cost), 0)
      }));

      return Response.json({
        ok: true,
        dry_run: true,
        preview: {
          vendor_groups: preview,
          total_orders_to_create: Object.keys(vendorGroups).length,
          total_line_items: eligible.length,
          total_qty: eligible.reduce((sum, i) => sum + i.qty_to_order, 0)
        },
        blocked,
        summary: {
          eligible_count: eligible.length,
          blocked_count: blocked.length,
          order_count: Object.keys(vendorGroups).length
        }
      });
    }

    // If no eligible commitments, return early
    if (eligible.length === 0) {
      return Response.json({
        ok: false,
        error: 'No eligible commitments to order',
        created_orders: [],
        blocked,
        updated_commitments: [],
        summary: { eligible_count: 0, blocked_count: blocked.length, order_count: 0 }
      });
    }

    // Group by vendor
    const vendorGroups = groupByVendor(eligible);

    // For SINGLE mode with multiple vendors, error if no override
    if (mode === 'SINGLE' && Object.keys(vendorGroups).length > 1 && !override_vendor_id) {
      return Response.json({
        ok: false,
        error: 'Single mode requires vendor override when commitments have different vendors',
        created_orders: [],
        blocked,
        updated_commitments: [],
        summary: { eligible_count: eligible.length, blocked_count: blocked.length, order_count: 0 }
      });
    }

    // Create orders for each vendor group
    const createdOrders = [];
    const updatedCommitments = [];
    const lifecycleEvents = [];
    const today = new Date().toISOString().split('T')[0];

    for (const [vendorId, items] of Object.entries(vendorGroups)) {
      // Generate canonical PO number
      const poNumber = await generateCanonicalPONumber(base44, poSequences);

      // Create Order
      const order = await base44.asServiceRole.entities.Order.create({
        vendor_id: vendorId,
        po_prefix: 'AK',
        po_number: poNumber,
        order_date: today,
        eta_date: eta_date || null,
        status: 'Ordered',
        notes: notes || `Created via Unified Supply Engine for ${items.length} commitment(s)`,
        billing_status: 'Not Invoiced'
      });

      const lineItemIds = [];

      // Create line items and update commitments
      for (const item of items) {
        const { commitment, part, qty_to_order, unit_cost } = item;
        
        // Create PartPurchaseLineItem
        const lineItem = await base44.asServiceRole.entities.PartPurchaseLineItem.create({
          order_id: order.id,
          part_id: part.id,
          commitment_id: commitment.id,
          vendor_id: vendorId,
          qty_ordered: qty_to_order,
          qty_received: 0,
          unit_cost: unit_cost,
          unit_price: unit_cost, // deprecated but kept for compatibility
          extended_cost: unit_cost * qty_to_order,
          line_total: unit_cost * qty_to_order,
          cost_source_reference: `commitment:${commitment.id}`,
          status: 'Ordered',
          is_legacy: false,
          legacy_link_status: 'linked',
          is_delta_order: false
        });

        lineItemIds.push(lineItem.id);

        // Update commitment quantities
        const newQtyOrdered = (commitment.qty_ordered || 0) + qty_to_order;
        
        // Recompute qty_to_order from invariant:
        // qty_to_order = qty_committed - qty_reserved - qty_ordered
        const newQtyToOrder = Math.max(0, 
          (commitment.qty_committed || 0) - 
          (commitment.qty_reserved || 0) - 
          newQtyOrdered
        );

        // Determine new status
        let newStatus = commitment.commitment_status;
        if (newQtyOrdered > 0 && (commitment.qty_received || 0) === 0) {
          newStatus = 'ordered';
        }

        // Update commitment
        await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
          qty_ordered: newQtyOrdered,
          qty_to_order: newQtyToOrder,
          commitment_status: newStatus,
          order_line_item_ids: [...(commitment.order_line_item_ids || []), lineItem.id]
        });

        // Track updated commitment
        updatedCommitments.push({
          id: commitment.id,
          qty_to_order: newQtyToOrder,
          qty_ordered: newQtyOrdered,
          qty_reserved: commitment.qty_reserved || 0,
          coverage_status: commitment.coverage_status
        });

        // Create LifecycleEvent
        await base44.asServiceRole.entities.LifecycleEvent.create({
          event_type: 'PO_CREATED',
          commitment_id: commitment.id,
          project_id: project_id,
          part_id: part.id,
          order_id: order.id,
          line_item_id: lineItem.id,
          vendor_id: vendorId,
          qty_delta: qty_to_order,
          before_state: JSON.stringify({
            qty_ordered: commitment.qty_ordered || 0,
            qty_to_order: commitment.qty_to_order || 0,
            status: commitment.commitment_status
          }),
          after_state: JSON.stringify({
            qty_ordered: newQtyOrdered,
            qty_to_order: newQtyToOrder,
            status: newStatus
          }),
          metadata: JSON.stringify({
            po_number: poNumber,
            unit_cost: unit_cost,
            extended_cost: unit_cost * qty_to_order
          }),
          actor_email: user.email,
          actor_id: user.id,
          is_reversible: false
        });
      }

      createdOrders.push({
        order_id: order.id,
        po_number: poNumber,
        vendor_id: vendorId,
        vendor_name: items[0]?.vendor_name,
        commitment_ids: items.map(i => i.commitment.id),
        line_item_ids: lineItemIds,
        total_qty: items.reduce((sum, i) => sum + i.qty_to_order, 0),
        total_cost: items.reduce((sum, i) => sum + (i.qty_to_order * i.unit_cost), 0)
      });
    }

    // Validate invariants for all updated commitments
    const invariantErrors = [];
    for (const updated of updatedCommitments) {
      const freshCommitment = await base44.asServiceRole.entities.PartCommitment.filter({ id: updated.id });
      if (freshCommitment.length > 0) {
        const c = freshCommitment[0];
        const error = validateCommitmentQtyInvariant(c);
        if (error) {
          invariantErrors.push({ commitment_id: c.id, error });
        }
      }
    }

    if (invariantErrors.length > 0) {
      // Log but don't fail - orders already created
      console.warn('Invariant warnings after PO creation:', invariantErrors);
    }

    return Response.json({
      ok: true,
      created_orders: createdOrders,
      blocked,
      updated_commitments: updatedCommitments,
      invariant_warnings: invariantErrors,
      summary: {
        eligible_count: eligible.length,
        blocked_count: blocked.length,
        order_count: createdOrders.length
      }
    });

  } catch (error) {
    console.error('createPurchaseOrdersFromCommitments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Check if a commitment is eligible for PO creation
 */
function checkEligibility(commitment, part, overrideVendorId) {
  // Cancelled or closed
  if (commitment.commitment_status === 'cancelled') {
    return { code: 'CANCELLED', message: 'Commitment is cancelled' };
  }
  if (commitment.commitment_status === 'closed') {
    return { code: 'CLOSED', message: 'Commitment is closed' };
  }

  // Nothing to order
  if (!commitment.qty_to_order || commitment.qty_to_order <= 0) {
    return { code: 'NOTHING_TO_ORDER', message: 'No quantity remaining to order (qty_to_order = 0)' };
  }

  // Missing vendor
  const vendorId = overrideVendorId || part?.default_vendor_id;
  if (!vendorId) {
    return { code: 'MISSING_VENDOR', message: 'No vendor assigned to part and no override provided' };
  }

  // Prepay gating - if requires_prepay and billing_status not paid
  if (commitment.requires_prepay && commitment.billing_status !== 'paid') {
    return { code: 'PREPAY_REQUIRED', message: 'Client prepayment required before ordering' };
  }

  // Part archived
  if (part?.is_archived) {
    return { code: 'PART_ARCHIVED', message: 'Part is archived' };
  }

  return null; // Eligible
}

/**
 * Group eligible items by vendor
 */
function groupByVendor(items) {
  const groups = {};
  for (const item of items) {
    const vendorId = item.vendor_id;
    if (!groups[vendorId]) {
      groups[vendorId] = [];
    }
    groups[vendorId].push(item);
  }
  return groups;
}

/**
 * Generate canonical PO number: AK-YYYY-####
 */
async function generateCanonicalPONumber(base44, existingSequences) {
  const currentYear = new Date().getFullYear();
  
  // Find or create sequence for current year
  let yearSequence = existingSequences.find(s => s.year === currentYear);
  let nextSequence;

  if (yearSequence) {
    nextSequence = (yearSequence.last_sequence || 0) + 1;
    await base44.asServiceRole.entities.POSequence.update(yearSequence.id, {
      last_sequence: nextSequence
    });
    // Update local cache for subsequent calls in same request
    yearSequence.last_sequence = nextSequence;
  } else {
    nextSequence = 1;
    const newSeq = await base44.asServiceRole.entities.POSequence.create({
      year: currentYear,
      last_sequence: nextSequence
    });
    existingSequences.push(newSeq);
  }

  return `AK-${currentYear}-${String(nextSequence).padStart(4, '0')}`;
}

/**
 * Validate commitment quantity invariant:
 * qty_committed = qty_reserved + qty_to_order + qty_ordered
 * qty_ordered >= qty_received
 * qty_received >= qty_installed
 */
function validateCommitmentQtyInvariant(commitment) {
  const {
    qty_committed = 0,
    qty_reserved = 0,
    qty_to_order = 0,
    qty_ordered = 0,
    qty_received = 0,
    qty_installed = 0
  } = commitment;

  // Primary invariant: committed = reserved + to_order + ordered
  // Note: This invariant holds when nothing received yet
  // After receiving: ordered stays same, received increases
  // After install: installed increases
  
  // Check ordering invariant
  if (qty_ordered < qty_received) {
    return `qty_ordered (${qty_ordered}) < qty_received (${qty_received})`;
  }

  // Check receiving invariant
  if (qty_received < qty_installed) {
    return `qty_received (${qty_received}) < qty_installed (${qty_installed})`;
  }

  // Check coverage invariant (soft)
  const coverageSum = qty_reserved + qty_to_order + qty_ordered;
  if (Math.abs(coverageSum - qty_committed) > 0.01 && qty_received === 0) {
    // Only enforce before receiving starts
    return `Coverage invariant violation: reserved(${qty_reserved}) + to_order(${qty_to_order}) + ordered(${qty_ordered}) = ${coverageSum} != committed(${qty_committed})`;
  }

  return null; // Valid
}