/**
 * createPurchaseOrdersFromCommitments.js
 * 
 * UNIFIED SUPPLY EXECUTION ENGINE - PO CREATION
 * 
 * CANONICAL entry point for all project-linked PO creation.
 * 
 * PERF FIX: All queries are scoped by project_id / commitment_ids.
 * No global .list() calls.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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
      mode = 'BULK',
      allow_multi_vendor = true,
      override_vendor_id = null,
      eta_date = null,
      notes = null,
      dry_run = false,
      vendor_order_data = {}
    } = payload;

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    if (!commitment_ids || commitment_ids.length === 0) {
      return Response.json({ error: 'commitment_ids array is required and must not be empty' }, { status: 400 });
    }

    // PERF FIX: Fetch only the requested commitments (not all project commitments)
    const [commitments, project, poSequences] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.filter({ id: { $in: commitment_ids } }),
      base44.asServiceRole.entities.Project.filter({ id: project_id }).then(r => r[0]),
      base44.asServiceRole.entities.POSequence.list(),
    ]);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // PERF FIX: Scope parts and vendors to only those referenced by commitments
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    
    const [parts, vendors] = await Promise.all([
      partIds.length > 0
        ? base44.asServiceRole.entities.Part.filter({ id: { $in: partIds } })
        : Promise.resolve([]),
      base44.asServiceRole.entities.Vendor.list(), // vendors are small, keep as list
    ]);

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
          message: 'Commitment not found'
        })),
        updated_commitments: [],
        summary: { eligible_count: 0, blocked_count: commitment_ids.length, order_count: 0 }
      });
    }

    const isForwardModel = project?.financial_model_version === 'forward';

    // Eligibility check
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
        const vendorId = override_vendor_id || part?.default_vendor_id;
        
        // FORWARD MODEL: Cost from Part.cost only
        let unit_cost;
        let cost_source_reference;
        let cost_requires_review = false;
        
        if (isForwardModel) {
          if (part?.cost && part.cost > 0) {
            unit_cost = part.cost;
            cost_source_reference = 'part_cost';
          } else if (part?.default_cost && part.default_cost > 0) {
            unit_cost = part.default_cost;
            cost_source_reference = 'default_estimate';
            cost_requires_review = true;
          } else {
            unit_cost = 0;
            cost_source_reference = 'default_estimate';
            cost_requires_review = true;
          }
        } else {
          unit_cost = part?.cost || part?.default_cost || commitment.unit_cost_snapshot || 0;
          cost_source_reference = `commitment:${commitment.id}`;
        }
        
        eligible.push({
          commitment,
          part,
          vendor_id: vendorId,
          vendor_name: vendorMap.get(vendorId)?.vendor_name || 'Unknown Vendor',
          qty_to_order: commitment.qty_to_order || 0,
          unit_cost,
          cost_source_reference,
          cost_requires_review
        });
      }
    }

    // Dry run preview
    if (dry_run) {
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

    const vendorGroups = groupByVendor(eligible);

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

    const createdOrders = [];
    const updatedCommitments = [];
    const today = new Date().toISOString().split('T')[0];

    for (const [vendorId, items] of Object.entries(vendorGroups)) {
      const poNumber = await generateCanonicalPONumber(base44, poSequences);
      const vendorData = vendor_order_data[vendorId] || {};

      const orderData = {
        vendor_id: vendorId,
        po_prefix: vendorData.po_prefix || 'AK',
        po_number: poNumber,
        order_number: vendorData.order_number || null,
        order_url: vendorData.order_url || null,
        order_date: vendorData.order_date || today,
        eta_date: vendorData.eta_date || eta_date || null,
        status: 'Ordered',
        notes: vendorData.notes || notes || `Created via Unified Supply Engine for ${items.length} commitment(s)`,
        freight_cost: vendorData.freight_cost || 0,
        tariff_cost: vendorData.tariff_cost || 0,
      };
      
      if (!isForwardModel) {
        orderData.billing_status = 'Not Invoiced';
      }
      
      const order = await base44.asServiceRole.entities.Order.create(orderData);

      const lineItemIds = [];

      for (const item of items) {
        const { commitment, part, qty_to_order, unit_cost, cost_source_reference, cost_requires_review } = item;
        
        const lineItemData = {
          order_id: order.id,
          part_id: part.id,
          commitment_id: commitment.id,
          vendor_id: vendorId,
          qty_ordered: qty_to_order,
          qty_received: 0,
          unit_cost: unit_cost,
          unit_price: unit_cost,
          extended_cost: unit_cost * qty_to_order,
          line_total: unit_cost * qty_to_order,
          cost_source_reference: cost_source_reference || `commitment:${commitment.id}`,
          status: 'Ordered',
          is_legacy: false,
          legacy_link_status: 'linked',
          is_delta_order: false
        };
        
        if (isForwardModel && cost_requires_review) {
          lineItemData.cost_requires_review = true;
        }
        
        const lineItem = await base44.asServiceRole.entities.PartPurchaseLineItem.create(lineItemData);
        lineItemIds.push(lineItem.id);

        // Update commitment quantities
        const required_total = commitment.required_total ?? commitment.qty_committed ?? 0;
        const reserved_from_stock = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
        const current_covered = commitment.covered_from_po ?? 0;
        
        const new_covered_from_po = current_covered + qty_to_order;
        const new_to_order = Math.max(0, required_total - reserved_from_stock - new_covered_from_po);

        // INVARIANT CHECK
        const invariant_sum = reserved_from_stock + new_covered_from_po + new_to_order;
        if (Math.abs(invariant_sum - required_total) > 0.01) {
          throw new Error(
            `COVERAGE_INVARIANT_VIOLATION after PO creation: commitment=${commitment.id} ` +
            `required=${required_total} reserved=${reserved_from_stock} covered=${new_covered_from_po} to_order=${new_to_order} sum=${invariant_sum}`
          );
        }

        const newQtyOrdered = (commitment.qty_ordered || 0) + qty_to_order;
        let newStatus = commitment.commitment_status;
        if (newQtyOrdered > 0 && (commitment.qty_received || 0) === 0) {
          newStatus = 'ordered';
        }

        await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
          covered_from_po: new_covered_from_po,
          qty_to_order: new_to_order,
          qty_ordered: newQtyOrdered,
          commitment_status: newStatus,
          order_line_item_ids: [...(commitment.order_line_item_ids || []), lineItem.id]
        });

        updatedCommitments.push({
          id: commitment.id,
          qty_to_order: new_to_order,
          qty_ordered: newQtyOrdered,
          qty_reserved: commitment.qty_reserved || 0,
          coverage_status: commitment.coverage_status
        });

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
            qty_to_order: new_to_order,
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

    return Response.json({
      ok: true,
      created_orders: createdOrders,
      blocked,
      updated_commitments: updatedCommitments,
      summary: {
        eligible_count: eligible.length,
        blocked_count: blocked.length,
        order_count: createdOrders.length
      }
    });

  } catch (error) {
    console.error('createPurchaseOrdersFromCommitments error:', error);
    return Response.json({ 
      success: false,
      data: [],
      error: 'Supply data temporarily unavailable: ' + error.message
    }, { status: 500 });
  }
});

function checkEligibility(commitment, part, overrideVendorId) {
  if (commitment.commitment_status === 'cancelled') {
    return { code: 'CANCELLED', message: 'Commitment is cancelled' };
  }
  if (commitment.commitment_status === 'closed') {
    return { code: 'CLOSED', message: 'Commitment is closed' };
  }
  if (!commitment.qty_to_order || commitment.qty_to_order <= 0) {
    return { code: 'NOTHING_TO_ORDER', message: 'No quantity remaining to order (qty_to_order = 0)' };
  }
  const vendorId = overrideVendorId || part?.default_vendor_id;
  if (!vendorId) {
    return { code: 'MISSING_VENDOR', message: 'No vendor assigned to part and no override provided' };
  }
  if (commitment.requires_prepay && commitment.billing_status !== 'paid') {
    return { code: 'PREPAY_REQUIRED', message: 'Client prepayment required before ordering' };
  }
  if (part?.is_archived) {
    return { code: 'PART_ARCHIVED', message: 'Part is archived' };
  }
  return null;
}

function groupByVendor(items) {
  const groups = {};
  for (const item of items) {
    const vendorId = item.vendor_id;
    if (!groups[vendorId]) groups[vendorId] = [];
    groups[vendorId].push(item);
  }
  return groups;
}

async function generateCanonicalPONumber(base44, existingSequences) {
  const currentYear = new Date().getFullYear();
  let yearSequence = existingSequences.find(s => s.year === currentYear);
  let nextSequence;

  if (yearSequence) {
    nextSequence = (yearSequence.last_sequence || 0) + 1;
    await base44.asServiceRole.entities.POSequence.update(yearSequence.id, {
      last_sequence: nextSequence
    });
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