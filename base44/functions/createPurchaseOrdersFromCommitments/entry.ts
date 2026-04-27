/**
 * createPurchaseOrdersFromCommitments.js
 * PHASE 1 CANONICAL ALIGNMENT:
 * - Gap = required_total - reserved_from_stock - covered_from_po (CANONICAL)
 * - qty_to_order no longer read for eligibility
 * - commitment_id REQUIRED for new PO lines
 *
 * PO INTEGRITY GUARDS (P0):
 * - Every line item MUST have unit_cost > 0 — hard block, not warning
 * Guards are inlined (no local imports in Deno deploy).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── PO INTEGRITY GUARD (canonical — inlined from poValidationGuards.js) ──
function guardPOLineItemCosts(lineItems) {
  const errors = [];
  for (const item of lineItems) {
    const cost = Number(item.unit_cost);
    const id = item.commitment_id || item.commitment?.id || item.id || 'unknown';
    const name = item.part_name || item.part?.part_name || '';
    if (cost === null || cost === undefined || !Number.isFinite(cost)) {
      errors.push({ commitment_id: id, reason_code: 'MISSING_COST', part_name: name, message: `Missing cost for ${name || id}` });
    } else if (cost <= 0) {
      errors.push({ commitment_id: id, reason_code: 'ZERO_COST', part_name: name, message: `$0 cost for ${name || id} — cannot create PO line with zero cost` });
    }
  }
  return errors;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { project_id, commitment_ids=[], mode='BULK', override_vendor_id=null, eta_date=null, notes=null, dry_run=false, vendor_order_data={}, qty_overrides={}, manual_lines=[] } = payload;
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
    if (!commitment_ids?.length) return Response.json({ error: 'commitment_ids required' }, { status: 400 });

    const warnings = [];
    const [commitments, project, poSequences] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.filter({ id: { $in: commitment_ids } }),
      base44.asServiceRole.entities.Project.filter({ id: project_id }).then(r => r[0]),
      base44.asServiceRole.entities.POSequence.list(),
    ]);
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const parts = partIds.length > 0 ? await base44.asServiceRole.entities.Part.filter({ id: { $in: partIds } }) : [];
    
    // Phase 2: Fetch vendor sources for all parts (for source-based cost/vendor resolution)
    const vendorSources = partIds.length > 0 
      ? await base44.asServiceRole.entities.PartVendorSource.filter({ part_id: { $in: partIds }, is_active: true })
      : [];
    const sourceMap = new Map(vendorSources.map(s => [s.id, s]));
    const sourcesByPart = new Map();
    for (const s of vendorSources) {
      if (!sourcesByPart.has(s.part_id)) sourcesByPart.set(s.part_id, []);
      sourcesByPart.get(s.part_id).push(s);
    }
    
    // Parse per-commitment source selections: { commitment_id: source_id }
    const { selected_sources = {} } = payload;
    
    const vendorIds = [...new Set([
      ...parts.map(p => p.default_vendor_id).filter(Boolean),
      ...vendorSources.map(s => s.vendor_id).filter(Boolean),
    ])];
    if (override_vendor_id && !vendorIds.includes(override_vendor_id)) vendorIds.push(override_vendor_id);
    const vendors = vendorIds.length > 0 ? await base44.asServiceRole.entities.Vendor.filter({ id: { $in: vendorIds } }) : [];
    const partMap = new Map(parts.map(p => [p.id, p]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const cMap = new Map(commitments.map(c => [c.id, c]));
    const reqC = commitment_ids.map(id => cMap.get(id)).filter(Boolean);

    if (!reqC.length) return Response.json({ ok: false, error: 'No valid commitments', created_orders: [], blocked: commitment_ids.map(id => ({ commitment_id: id, reason_code: 'NOT_FOUND' })), updated_commitments: [], summary: { eligible_count: 0, blocked_count: commitment_ids.length, order_count: 0 } });

    const isFwd = project?.financial_model_version === 'forward';
    const eligible = [], blocked = [];

    for (const c of reqC) {
      const part = partMap.get(c.part_id);
      // PHASE 1: Canonical eligibility
      if (c.commitment_status === 'cancelled') { blocked.push({ commitment_id: c.id, reason_code: 'CANCELLED', part_name: part?.part_name, message: 'Commitment cancelled' }); continue; }
      if (c.commitment_status === 'closed') { blocked.push({ commitment_id: c.id, reason_code: 'CLOSED', part_name: part?.part_name, message: 'Commitment closed' }); continue; }
      // CANONICAL: effective_required = required_total - qty_removed
      const effective_required = Math.max(0, (c.required_total ?? 0) - (c.qty_removed ?? 0));
      const gap = Math.max(0, effective_required - (c.reserved_from_stock ?? 0) - (c.covered_from_po ?? 0) - (c.qty_installed ?? 0));
      if (gap <= 0) { blocked.push({ commitment_id: c.id, reason_code: 'NOTHING_TO_ORDER', part_name: part?.part_name, message: 'Fully covered, nothing to order' }); continue; }

      // Drift detection
      const storedTO = c.qty_to_order ?? 0;
      if (Math.abs(gap - storedTO) > 0.01 && storedTO > 0) warnings.push({ type: 'QTY_TO_ORDER_DRIFT', id: c.id, msg: `stored(${storedTO})!=gap(${gap})` });

      // Phase 2: Resolve vendor via selected_source → PartVendorSource → Part.default_vendor_id
      let resolvedSourceId = selected_sources[c.id] || null;
      let resolvedSource = resolvedSourceId ? sourceMap.get(resolvedSourceId) : null;
      
      // If no explicit source selected, find preferred source for this part
      if (!resolvedSource) {
        const partSources = sourcesByPart.get(c.part_id) || [];
        resolvedSource = partSources.find(s => s.is_preferred) || null;
        resolvedSourceId = resolvedSource?.id || null;
      }
      
      // Resolve vendor: override > source > Part.default
      const vid = override_vendor_id || resolvedSource?.vendor_id || part?.default_vendor_id;
      if (!vid) { blocked.push({ commitment_id: c.id, reason_code: 'MISSING_VENDOR', part_name: part?.part_name, message: 'No default vendor assigned' }); continue; }
      if (c.requires_prepay && c.billing_status !== 'paid') { blocked.push({ commitment_id: c.id, reason_code: 'PREPAY_REQUIRED', part_name: part?.part_name, message: 'Prepayment required' }); continue; }
      if (part?.is_archived) { blocked.push({ commitment_id: c.id, reason_code: 'PART_ARCHIVED', part_name: part?.part_name, message: 'Part is archived' }); continue; }

      let unit_cost, cost_src, cost_review = false;
      if (isFwd) {
        // Phase 2: Source cost → commitment snapshot → Part.cost → default_cost → 0
        if (resolvedSource?.unit_cost > 0) { unit_cost = resolvedSource.unit_cost; cost_src = `vendor_source:${resolvedSourceId}`; }
        else if (c.unit_cost_snapshot > 0) { unit_cost = c.unit_cost_snapshot; cost_src = 'commitment_snapshot'; }
        else if (part?.cost > 0) { unit_cost = part.cost; cost_src = 'part_cost'; }
        else if (part?.default_cost > 0) { unit_cost = part.default_cost; cost_src = 'default_estimate'; cost_review = true; }
        else { unit_cost = 0; cost_src = 'missing'; cost_review = true; }
      } else {
        const resolved = (resolvedSource?.unit_cost > 0) ? resolvedSource.unit_cost : (c.unit_cost_snapshot && c.unit_cost_snapshot > 0) ? c.unit_cost_snapshot : (part?.cost && part.cost > 0) ? part.cost : (part?.default_cost && part.default_cost > 0) ? part.default_cost : 0;
        unit_cost = resolved;
        cost_src = (resolvedSource?.unit_cost > 0) ? `vendor_source:${resolvedSourceId}` : (c.unit_cost_snapshot > 0) ? 'commitment_snapshot' : (part?.cost > 0) ? 'part_cost' : (part?.default_cost > 0) ? 'default_estimate' : 'missing';
        if (unit_cost <= 0) cost_review = true;
      }
      // Note: $0 cost is now hard-blocked by guardPOLineItemCosts() batch guard above.
      // Lines reaching here with cost <= 0 will be caught before any writes occur.
      // Use qty_override if provided (allows user to order more than gap)
      const qtyOverride = qty_overrides[c.id];
      const finalQty = (qtyOverride != null && qtyOverride > 0) ? qtyOverride : gap;
      eligible.push({ commitment: c, part, vendor_id: vid, vendor_name: vendorMap.get(vid)?.vendor_name || 'Unknown', qty_to_order: finalQty, canonical_gap: gap, unit_cost, cost_src, cost_review, source_id: resolvedSourceId, price_ordered: unit_cost });
    }

    // ── P0 GUARD: Hard-block $0 / missing cost lines (replaces old strictMode-only check) ──
    const costErrors = guardPOLineItemCosts(eligible);
    if (costErrors.length > 0 && !dry_run) {
      console.error(`[PO_CREATE_COST_GUARD] Blocked: ${costErrors.length} line(s) with invalid cost`, costErrors);
      return Response.json({
        ok: false,
        error: 'PO_COST_VALIDATION_FAILED',
        error_code: 'ZERO_COST_BLOCKED',
        message: `${costErrors.length} line item(s) have missing or $0 cost. All lines must have cost > $0.`,
        cost_errors: costErrors,
        blocked,
        summary: { eligible_count: eligible.length, blocked_count: blocked.length, order_count: 0 },
      });
    }

    if (dry_run) {
      const vg = {}; for (const e of eligible) { if (!vg[e.vendor_id]) vg[e.vendor_id] = []; vg[e.vendor_id].push(e); }
      return Response.json({ ok: true, dry_run: true, cost_errors: costErrors.length > 0 ? costErrors : undefined, preview: { vendor_groups: Object.entries(vg).map(([v, items]) => ({ vendor_id: v, vendor_name: items[0]?.vendor_name, commitment_count: items.length, total_qty: items.reduce((s, i) => s + i.qty_to_order, 0), estimated_cost: items.reduce((s, i) => s + i.qty_to_order * i.unit_cost, 0), items: items.map(i => ({ commitment_id: i.commitment.id, part_name: i.part?.part_name, qty: i.qty_to_order, unit_cost: i.unit_cost, cost_src: i.cost_src, project_name: null })) })), total_orders_to_create: Object.keys(vg).length, total_line_items: eligible.length }, blocked, phase1_warnings: warnings.length ? warnings : undefined, summary: { eligible_count: eligible.length, blocked_count: blocked.length, order_count: Object.keys(vg).length } });
    }

    if (!eligible.length && !manual_lines.length) return Response.json({ ok: false, error: 'No eligible commitments', created_orders: [], blocked, updated_commitments: [], summary: { eligible_count: 0, blocked_count: blocked.length, order_count: 0 } });

    const vg = {}; for (const e of eligible) { if (!vg[e.vendor_id]) vg[e.vendor_id] = []; vg[e.vendor_id].push(e); }
    if (mode === 'SINGLE' && Object.keys(vg).length > 1 && !override_vendor_id) return Response.json({ ok: false, error: 'Single mode requires vendor override', created_orders: [], blocked, updated_commitments: [], summary: { eligible_count: eligible.length, blocked_count: blocked.length, order_count: 0 } });

    const createdOrders = [], updatedCommitments = [], today = new Date().toISOString().split('T')[0];

    for (const [vid, items] of Object.entries(vg)) {
      const poNum = await genPONumber(base44, poSequences);
      const vd = vendor_order_data[vid] || {};
      const od = { vendor_id: vid, po_prefix: vd.po_prefix || 'AK', po_number: poNum, order_number: vd.order_number || null, order_url: vd.order_url || null, order_date: vd.order_date || today, eta_date: vd.eta_date || eta_date || null, status: 'Ordered', notes: vd.notes || notes || `Supply Engine: ${items.length} commitment(s)`, freight_cost: vd.freight_cost || 0, tariff_cost: vd.tariff_cost || 0 };
      if (!isFwd) od.billing_status = 'Not Invoiced';
      const order = await base44.asServiceRole.entities.Order.create(od);
      const liIds = [];

      const commitmentIdsForCostSync = [];
      for (const item of items) {
        const { commitment: c, part, qty_to_order, unit_cost, cost_src, cost_review } = item;
        const liData = { order_id: order.id, part_id: part.id, commitment_id: c.id, vendor_id: vid, qty_ordered: qty_to_order, qty_received: 0, unit_cost, unit_price: unit_cost, extended_cost: unit_cost * qty_to_order, line_total: unit_cost * qty_to_order, cost_source_reference: cost_src, status: 'Ordered', is_legacy: false, legacy_link_status: 'linked', is_delta_order: false, source_id: item.source_id || null, price_ordered: item.price_ordered || unit_cost };
        if (isFwd && cost_review) liData.cost_requires_review = true;
        const li = await base44.asServiceRole.entities.PartPurchaseLineItem.create(liData);
        liIds.push(li.id);
        commitmentIdsForCostSync.push(c.id);

        // PHASE 1: Canonical update
        const curCov = c.covered_from_po ?? 0, newCov = curCov + qty_to_order;
        const reqT = c.required_total ?? 0, resS = c.reserved_from_stock ?? 0;
        const instQ = c.qty_installed ?? 0;
        const newTO = Math.max(0, reqT - resS - newCov - instQ);
        const invSum = resS + newCov + instQ + newTO;
        if (Math.abs(invSum - reqT) > 0.01) throw new Error(`COVERAGE_INVARIANT: c=${c.id} sum=${invSum} exp=${reqT}`);
        const newQO = (c.qty_ordered || 0) + qty_to_order;
        let ns = c.commitment_status; if (newQO > 0 && (c.qty_received || 0) === 0) ns = 'ordered';

        // Sync cost from PO line to commitment
        const costUpdate = {};
        const oldCostSnap = c.unit_cost_snapshot ?? 0;
        // Only update cost if commitment isn't billing-locked
        if (!['invoiced', 'paid'].includes(c.billing_status)) {
          if (unit_cost > 0 && Math.abs(unit_cost - oldCostSnap) > 0.001) {
            costUpdate.unit_cost_snapshot = unit_cost;
            costUpdate.planned_cost_total = unit_cost * reqT;
            // Update pricing integrity
            const curRetail = c.unit_retail_snapshot ?? 0;
            if (curRetail > 0 && curRetail >= unit_cost) {
              costUpdate.pricing_integrity_status = 'ok';
              costUpdate.margin_pct = Math.round(((curRetail - unit_cost) / curRetail) * 10000) / 100;
            } else if (curRetail > 0 && curRetail < unit_cost) {
              costUpdate.pricing_integrity_status = 'margin_negative';
            } else if (curRetail <= 0) {
              costUpdate.pricing_integrity_status = 'missing_retail';
            }
          }
        }

        await base44.asServiceRole.entities.PartCommitment.update(c.id, { covered_from_po: newCov, qty_to_order: newTO, qty_ordered: newQO, commitment_status: ns, order_line_item_ids: [...(c.order_line_item_ids || []), li.id], ...costUpdate });
        updatedCommitments.push({ id: c.id, required_total: reqT, reserved_from_stock: resS, covered_from_po: newCov, gap: newTO, qty_to_order: newTO, qty_ordered: newQO, coverage_status: newTO === 0 ? 'FULLY_COVERED' : 'PARTIALLY_COVERED', cost_synced: Object.keys(costUpdate).length > 0, new_cost: costUpdate.unit_cost_snapshot ?? oldCostSnap });

        await base44.asServiceRole.entities.LifecycleEvent.create({ event_type: 'PO_CREATED', commitment_id: c.id, project_id, part_id: part.id, order_id: order.id, line_item_id: li.id, vendor_id: vid, qty_delta: qty_to_order, before_state: JSON.stringify({ covered_from_po: curCov, status: c.commitment_status }), after_state: JSON.stringify({ covered_from_po: newCov, qty_to_order: newTO, status: ns }), metadata: JSON.stringify({ po_number: poNum, unit_cost, extended_cost: unit_cost * qty_to_order }), actor_email: user.email, actor_id: user.id, is_reversible: false });
      }

      // Post-PO: Run landed cost allocation (distributes freight/tariff/misc/tax to lines)
      // This also triggers syncPOCostToCommitment internally
      try {
        await base44.asServiceRole.functions.invoke('allocatePOCosts', { order_id: order.id });
      } catch (e) {
        console.warn(`[PO_COST_ALLOC] Allocation failed for order ${order.id}: ${e.message}`);
        // Fallback: try direct cost sync
        for (const cid of commitmentIdsForCostSync) {
          try {
            await base44.asServiceRole.functions.invoke('syncPOCostToCommitment', { commitment_id: cid, skip_retail_update: false });
          } catch (e2) {
            console.warn(`[PO_COST_SYNC] Sync failed for ${cid}: ${e2.message}`);
          }
        }
      }

      // Handle manual lines (no commitment) for this vendor group
      if (vid === (override_vendor_id || vid)) {
        for (const ml of manual_lines) {
          if (!ml.part_id || !ml.qty || ml.qty <= 0) continue;
          const mlPart = partMap.get(ml.part_id);
          const mlCost = ml.unit_cost || mlPart?.cost || 0;
          const mlLiData = {
            order_id: order.id,
            part_id: ml.part_id,
            vendor_id: vid,
            qty_ordered: ml.qty,
            qty_received: 0,
            unit_cost: mlCost,
            unit_price: mlCost,
            extended_cost: mlCost * ml.qty,
            line_total: mlCost * ml.qty,
            cost_source_reference: 'manual_entry',
            status: 'Ordered',
            is_legacy: false,
            legacy_link_status: 'unlinked',
            is_delta_order: false,
            source_id: ml.source_id || null,
            price_ordered: mlCost,
          };
          const mlLi = await base44.asServiceRole.entities.PartPurchaseLineItem.create(mlLiData);
          liIds.push(mlLi.id);
        }
      }

      createdOrders.push({ order_id: order.id, po_number: poNum, vendor_id: vid, vendor_name: items[0]?.vendor_name, commitment_ids: items.map(i => i.commitment.id), line_item_ids: liIds, total_qty: items.reduce((s, i) => s + i.qty_to_order, 0), total_cost: items.reduce((s, i) => s + i.qty_to_order * i.unit_cost, 0) });
    }

    if (warnings.length) console.warn(`[PHASE1_PO] ${warnings.length} warnings`);
    return Response.json({ ok: true, created_orders: createdOrders, blocked, updated_commitments: updatedCommitments, phase1_warnings: warnings.length ? warnings : undefined, summary: { eligible_count: eligible.length, blocked_count: blocked.length, order_count: createdOrders.length } });
  } catch (error) {
    console.error('createPurchaseOrdersFromCommitments error:', error);
    return Response.json({ success: false, data: [], error: 'Supply data unavailable: ' + error.message }, { status: 500 });
  }
});

async function genPONumber(base44, seqs) {
  const yr = new Date().getFullYear();
  let ys = seqs.find(s => s.year === yr); let ns;
  if (ys) { ns = (ys.last_sequence || 0) + 1; await base44.asServiceRole.entities.POSequence.update(ys.id, { last_sequence: ns }); ys.last_sequence = ns; }
  else { ns = 1; const n = await base44.asServiceRole.entities.POSequence.create({ year: yr, last_sequence: ns }); seqs.push(n); }
  return `AK-${yr}-${String(ns).padStart(4, '0')}`;
}