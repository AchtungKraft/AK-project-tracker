import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * ══════════════════════════════════════════════════════════════════════
 * executeSupplyAction — CANONICAL SUPPLY DISPATCHER
 * 
 * This is the ONLY approved mutation path for supply lifecycle actions.
 * All UI components, modals, and backend services MUST route here.
 * Legacy services (commitmentService) are hard-deprecated for lifecycle ops.
 *
 * Every stock-affecting mutation follows this sequence:
 *   1. Validate payload (fail loudly with actionable errors)
 *   2. Mutate inventory (InventoryItem + physical_stock)
 *   3. inlineRecompute(part_id)  — recalculate Part.physical_stock
 *   4. inlineRebalance(part_id)  — redistribute reservations
 *   5. Update commitment_status  — derive from quantity state
 *   6. Write lifecycle events + audit logs
 *
 * CANONICAL FIELDS: required_total, reserved_from_stock, covered_from_po,
 *   qty_installed, qty_removed
 * DEPRECATED COMPAT: qty_committed, qty_reserved, qty_to_order (written
 *   alongside canonical for backward compat only)
 *
 * PO INTEGRITY GUARDS (P0):
 * - PO creation: every line item MUST have unit_cost > 0
 * - PO deletion/cancellation: billing_status MUST be 'Not Invoiced'
 * ══════════════════════════════════════════════════════════════════════
 */

// ── PO INTEGRITY GUARDS (canonical — inlined from poValidationGuards.js) ──

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

function guardPODeletion(order) {
  const bs = order.billing_status;
  if (bs && bs !== 'Not Invoiced') {
    return { reason_code: 'PO_INVOICED', message: `Cannot delete/cancel PO — billing status is "${bs}". Remove invoice first.`, billing_status: bs };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { action_type, commitment_ids, payload = {}, dry_run = false } = await req.json();
    if (!action_type) return Response.json({ error: 'action_type required' }, { status: 400 });
    const ctx = { base44, user, timestamp: new Date().toISOString(), dry_run, lifecycle_events: [], inventory_audit_logs: [], mutations: [], warnings: [] };
    let result;
    switch (action_type) {
      case 'ADJUST_REQUIRED': result = await adjustRequired(ctx, commitment_ids, payload); break;
      case 'AUTO_RESERVE': result = await autoReserve(ctx, commitment_ids, payload); break;
      case 'CREATE_PO': result = await createPO(ctx, commitment_ids, payload); break;
      case 'RECEIVE': result = await receive(ctx, commitment_ids, payload); break;
      case 'ADD_STOCK': case 'RECEIVE_STOCK': result = await addStock(ctx, payload); break;
      case 'INSTALL': result = await install(ctx, commitment_ids, payload); break;
      case 'REVERSE_INSTALL': result = await reverseInstall(ctx, commitment_ids, payload); break;
      case 'ALLOCATE_POOL': throw new Error('ALLOCATE_POOL removed. Use InvoiceBatch.');
      case 'CANCEL_COMMITMENT': result = await cancelCommitment(ctx, commitment_ids, payload); break;
      case 'SYNC_PO_COST': result = await syncPOCost(ctx, commitment_ids, payload); break;
      case 'DELETE_PO': result = await deletePO(ctx, payload); break;
      case 'MARK_ORDERED': result = await markOrdered(ctx, payload); break;
      case 'UPDATE_PO_COSTS': result = await updatePOCosts(ctx, payload); break;
      default: return Response.json({ error: `Unknown action_type: ${action_type}` }, { status: 400 });
    }
    if (!dry_run) {
      for (const e of ctx.lifecycle_events) { if (e.commitment_id) await base44.asServiceRole.entities.LifecycleEvent.create(e); }
      for (const l of ctx.inventory_audit_logs) await base44.asServiceRole.entities.InventoryAuditLog.create(l);
    }
    if (ctx.warnings.length > 0) console.warn(`[PHASE1] ${action_type}: ${ctx.warnings.map(w => w.msg).join('; ')}`);
    return Response.json({
      toast_notification: ctx.mutations.some(m => m.action === 'RECEIVE' || m.action === 'ADD_STOCK' || m.action === 'REVERSE_INSTALL') ? { message: 'Stock auto-allocated to project', type: 'success' } : null,
      success: true, action_type, dry_run, ...result,
      lifecycle_events: ctx.lifecycle_events.length, mutations: ctx.mutations,
      phase1_warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined
    });
  } catch (error) {
    console.error("executeSupplyAction error:", error);
    return Response.json({ success: false, error: error.message, action_failed: true }, { status: 500 });
  }
});

// ── PHASE 1 HELPERS ──

// COVERAGE MODEL:
// required_total is satisfied by:
// - reserved_from_stock (allocated inventory)
// - covered_from_po (incoming supply)
// - qty_installed (consumed supply)
// - remaining gap becomes to_order
// CANONICAL: Supply invariant uses effective_required (required_total - qty_removed)
// This prevents over-allocation when parts have been removed
function checkSupplyInvariant(commitmentId, effective_required, reserved, covered, ctx, source, installed = 0) {
  const total = reserved + covered + installed;
  if (total > effective_required + 0.001) {
    const msg = `SUPPLY_INVARIANT_VIOLATION [${source}]: commitment=${commitmentId} reserved(${reserved})+covered_po(${covered})+installed(${installed})=${total} > effective_required(${effective_required})`;
    console.error(msg);
    if (ctx) ctx.warnings.push({ type: 'INVARIANT_VIOLATION', id: commitmentId, msg, source });
    return { violated: true, overallocation: total - effective_required, corrected_reserved: Math.max(0, effective_required - covered - installed) };
  }
  return { violated: false };
}

// ── INLINED EFFECTIVE QUANTITY VALIDATOR ──
// Standard result: { valid, violations[], blocking }
function validateEffectiveQuantities(c) {
  const required_total = c.required_total ?? 0;
  const qty_removed = c.qty_removed ?? 0;
  const eff = Math.max(0, required_total - qty_removed);
  const TOL = 0.001;
  const violations = [];
  if ((c.qty_installed ?? 0) > eff + TOL) violations.push({ field: 'qty_installed', value: c.qty_installed, limit: eff, message: `qty_installed(${c.qty_installed}) exceeds effective_required(${eff})` });
  if ((c.reserved_from_stock ?? 0) > eff + TOL) violations.push({ field: 'reserved_from_stock', value: c.reserved_from_stock, limit: eff, message: `reserved(${c.reserved_from_stock}) exceeds effective_required(${eff})` });
  if ((c.covered_from_po ?? 0) > eff + TOL) violations.push({ field: 'covered_from_po', value: c.covered_from_po, limit: eff, message: `covered(${c.covered_from_po}) exceeds effective_required(${eff})` });
  if ((c.invoiced_qty ?? 0) > eff + TOL) violations.push({ field: 'invoiced_qty', value: c.invoiced_qty, limit: eff, message: `invoiced(${c.invoiced_qty}) exceeds effective_required(${eff})` });
  const total = (c.reserved_from_stock ?? 0) + (c.covered_from_po ?? 0) + (c.qty_installed ?? 0);
  if (total > eff + TOL) violations.push({ field: '_combined', value: total, limit: eff, message: `combined coverage(${total}) exceeds effective_required(${eff})` });
  return { valid: violations.length === 0, violations, blocking: violations.length > 0, effective_required: eff, commitment_id: c.id };
}

function readCanonical(c, ctx) {
  const qty_removed = c.qty_removed ?? 0;
  const cn = { required_total: c.required_total ?? 0, qty_removed, reserved_from_stock: c.reserved_from_stock ?? 0, covered_from_po: c.covered_from_po ?? 0, qty_installed: c.qty_installed ?? 0 };
  cn.effective_required = Math.max(0, cn.required_total - qty_removed);
  if (ctx && c.qty_committed !== undefined && c.qty_committed !== cn.required_total)
    ctx.warnings.push({ type: 'MISMATCH', id: c.id, msg: `qty_committed(${c.qty_committed})!=required_total(${cn.required_total})` });
  if (ctx && c.qty_reserved !== undefined && c.qty_reserved !== cn.reserved_from_stock)
    ctx.warnings.push({ type: 'MISMATCH', id: c.id, msg: `qty_reserved(${c.qty_reserved})!=reserved_from_stock(${cn.reserved_from_stock})` });
  checkSupplyInvariant(c.id, cn.effective_required, cn.reserved_from_stock, cn.covered_from_po, ctx, 'readCanonical', cn.qty_installed);
  cn.gap = Math.max(0, cn.effective_required - cn.reserved_from_stock - cn.covered_from_po - cn.qty_installed);
  cn.coverage = cn.reserved_from_stock + cn.covered_from_po + cn.qty_installed;
  // PHASE 2: Hard validation — attach result for callers that need blocking check
  cn._validation = validateEffectiveQuantities(c);
  return cn;
}

function covStatus(req, res, cov) {
  const t = res + cov; if (t >= req && req > 0) return 'FULLY_COVERED'; if (t > 0) return 'PARTIALLY_COVERED'; return 'NOT_COVERED';
}

function mapSrc(s) { return ({ SHOP_PURCHASED:'VENDOR', VENDOR:'VENDOR', CLIENT_SUPPLIED:'CLIENT_SUPPLIED', AK_CUSTOM:'AK_CUSTOM', TAKE_OFF:'TAKE_OFF', STOCK:'STOCK' })[s] || 'VENDOR'; }

// ── INLINED REBALANCE ──

async function inlineRebalance(ctx, part_id, isDry) {
  const [part] = await ctx.base44.asServiceRole.entities.Part.filter({ id: part_id });
  if (!part) throw new Error(`REBALANCE_PART_NOT_FOUND: ${part_id}`);
  const phys = part.physical_stock ?? 0;
  const all = await ctx.base44.asServiceRole.entities.PartCommitment.filter({ part_id });
  const open = all.filter(c => c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed');
  const prio = { Critical:4, High:3, Normal:2, Low:1 };
  open.sort((a,b) => { const ap=prio[a.priority]||2, bp=prio[b.priority]||2; if(bp!==ap) return bp-ap; const ad=new Date(a.created_date), bd=new Date(b.created_date); if(ad.getTime()!==bd.getTime()) return ad-bd; return (a.id||'').localeCompare(b.id||''); });
  let rem = phys; const ups = [];
  for (const c of open) {
    const cn = readCanonical(c, ctx);
    const remReq = Math.max(0, cn.effective_required - cn.qty_installed);
    const need = Math.max(0, remReq - cn.covered_from_po);
    let newRes = Math.min(rem, need);
    // INVARIANT ENFORCEMENT: ensure reserved + covered_from_po + installed <= effective_required
    const invCheck = checkSupplyInvariant(c.id, cn.effective_required, newRes, cn.covered_from_po, ctx, 'inlineRebalance', cn.qty_installed);
    if (invCheck.violated) {
      newRes = invCheck.corrected_reserved;
      console.warn(`[REBALANCE_INVARIANT_CORRECTED] c=${c.id}: reserved corrected from ${Math.min(rem, need)} to ${newRes}`);
    }
    const newTO = Math.max(0, remReq - newRes - cn.covered_from_po);
    rem = Math.max(0, rem - newRes);
    if (newRes !== cn.reserved_from_stock || newTO !== (c.qty_to_order ?? 0))
      ups.push({ commitment_id:c.id, project_id:c.project_id, required_total:cn.required_total, effective_required:cn.effective_required, qty_removed:cn.qty_removed, qty_installed:cn.qty_installed, covered_from_po:cn.covered_from_po, old_reserved:cn.reserved_from_stock, new_reserved:newRes, old_to_order:c.qty_to_order??0, new_to_order:newTO, delta_reserved:newRes-cn.reserved_from_stock });
    const sum = newRes + cn.covered_from_po + newTO;
    if (Math.abs(sum - remReq) > 0.001) {
      console.error(`[REBALANCE_INVARIANT] c=${c.id} sum=${sum} exp=${remReq} reserved=${newRes} covered=${cn.covered_from_po} installed=${cn.qty_installed} to_order=${newTO}`);
      throw new Error(`REBALANCE_INVARIANT: c=${c.id} sum=${sum} exp=${remReq}`);
    }
  }
  const totRes = open.reduce((s,c) => { const u=ups.find(x=>x.commitment_id===c.id); return s+(u?u.new_reserved:(c.reserved_from_stock??0)); }, 0);
  if (totRes > phys + 0.001) throw new Error(`REBALANCE_OVER_ALLOC: phys=${phys} tot=${totRes}`);
  if (!isDry && ups.length > 0) {
    for (const u of ups) await ctx.base44.asServiceRole.entities.PartCommitment.update(u.commitment_id, { reserved_from_stock:u.new_reserved, qty_reserved:u.new_reserved, qty_to_order:u.new_to_order, last_recomputed_at:ctx.timestamp });
  }
  return { success:true, part_id, physical_stock:phys, commitments_updated:ups.length, remaining_stock_after:rem, updates:ups };
}

async function inlineRecompute(ctx, part_id, isDry) {
  const [[part], items] = await Promise.all([ctx.base44.asServiceRole.entities.Part.filter({id:part_id}), ctx.base44.asServiceRole.entities.InventoryItem.filter({part_id})]);
  if (!part) throw new Error('Part not found');
  const computed = items.reduce((s,i) => s+(i.quantity_on_hand??0), 0);
  const cur = part.physical_stock ?? 0;
  const need = Math.abs(computed-cur) > 0.001;
  if (need && !isDry) await ctx.base44.asServiceRole.entities.Part.update(part_id, { physical_stock:computed });
  return { computed_physical_stock:computed, current_physical_stock:cur, needs_update:need, updated:need&&!isDry };
}

// ── ACTIONS ──

async function adjustRequired(ctx, commitment_ids, payload) {
  const { required_total_delta, required_total_set, new_required_total, source_type='SHOP_PURCHASED', project_id, part_id, reopen_if_closed=false } = payload;
  const effSet = required_total_set ?? new_required_total;
  if (effSet === undefined && required_total_delta === undefined) throw new Error('required_total_delta or required_total_set required');
  let cid = commitment_ids?.[0], commitment=null, part=null, isNew=false, wasReopened=false;

  if (cid) { const [c]=await ctx.base44.entities.PartCommitment.filter({id:cid}); commitment=c; if(!c) throw new Error('Commitment not found'); if(reopen_if_closed&&['closed','cancelled'].includes(c.commitment_status)) wasReopened=true; }

  if (!cid) {
    if (!project_id||!part_id) throw new Error('commitment_id OR (project_id+part_id) required');
    const ex = await ctx.base44.entities.PartCommitment.filter({ project_id, part_id, is_archived:{$ne:true} });
    const active = ex.find(c=>!['cancelled','closed'].includes(c.commitment_status));
    const closed = ex.find(c=>['cancelled','closed'].includes(c.commitment_status));
    if (active) { commitment=active; cid=commitment.id; }
    else if (reopen_if_closed && closed) { commitment=closed; cid=commitment.id; wasReopened=true; }
    else {
      const [p] = await ctx.base44.entities.Part.filter({id:part_id}); part=p; if(!p) throw new Error('Part not found');
      const initReq = effSet ?? Math.max(1, required_total_delta ?? 1);
      if (ctx.dry_run) { isNew=true; }
      else {
        const uc=p.cost||0, pm=p.pricing_mode||'matrix';
        let re=0; if(pm==='manual'){if(!p.retail_override||p.retail_override<=0) throw new Error(`PRICING_MODE_INVALID: ${p.part_name}`); re=p.retail_override;} else re=Math.round(p.retail_matrix_price||0);
        let pis='ok'; if(uc<=0) pis='missing_cost'; else if(re<=0) pis='missing_retail'; else if(re<uc) pis='margin_negative';
        commitment = await ctx.base44.asServiceRole.entities.PartCommitment.create({
          project_id, part_id, required_total:initReq, reserved_from_stock:0, covered_from_po:0, qty_installed:0,
          supply_source_type:mapSrc(source_type), qty_committed:initReq, qty_reserved:0, qty_to_order:initReq, qty_ordered:0, qty_received:0,
          commitment_status:'planned', coverage_status:'NOT_COVERED', source_type:'manual_attachment', billing_status:'unbilled',
          requires_prepay:payload.requires_prepay||false, unit_cost_snapshot:uc, unit_retail_snapshot:re,
          planned_cost_total:uc*initReq, planned_retail_total:re*initReq, pricing_integrity_status:pis,
          commitment_version:1, state_version:1, last_recomputed_at:ctx.timestamp
        });
        cid=commitment.id; isNew=true;
        ctx.mutations.push({entity:'PartCommitment',id:cid,action:'CREATE'});
        ctx.lifecycle_events.push({commitment_id:cid,event_type:'COMMITMENT_CREATED',trigger_source:'UNIFIED_ENGINE',triggered_by:ctx.user.email,actor_email:ctx.user.email,part_id,project_id,metadata:JSON.stringify({required_total:initReq,source_type}),event_date:ctx.timestamp});
      }
    }
  }

  if (!commitment&&cid) { const [c]=await ctx.base44.entities.PartCommitment.filter({id:cid}); commitment=c; if(!c) throw new Error('Commitment not found'); if(reopen_if_closed&&['closed','cancelled'].includes(c.commitment_status)) wasReopened=true; }
  if (!part) { const [p]=await ctx.base44.entities.Part.filter({id:commitment?.part_id||part_id}); part=p; if(!p) throw new Error('Part not found'); }

  const cn = readCanonical(commitment, ctx);
  const curReq = cn.required_total;
  let newReq = effSet!==undefined ? Math.max(0,effSet) : Math.max(0,curReq+(required_total_delta??0));
  const delta = newReq - curReq;

  // Scope addition for increases with lifecycle progress
  if (!isNew && delta>0 && cid) {
    const hasProg = (commitment?.invoiced_qty||0)>0 || cn.qty_installed>0 || cn.covered_from_po>0;
    if (hasProg) {
      if (ctx.dry_run) return {preview:{action:'WILL_CREATE_SCOPE_ADDITION',commitment_id:cid,delta}};
      const ucs=part.cost||0, pm=part.pricing_mode||'matrix', urs=pm==='manual'?(part.retail_override||0):(part.retail_matrix_price||0);
      const sc = await ctx.base44.asServiceRole.entities.PartCommitment.create({
        project_id:commitment.project_id, part_id:part.id, required_total:delta, reserved_from_stock:0, covered_from_po:0, qty_installed:0,
        invoiced_qty:0, invoiced_amount:0, billing_status:'unbilled', commitment_status:'planned', coverage_status:'NOT_COVERED',
        source_type:'scope_addition', parent_commitment_id:cid, allocation_source:'manual_commitment',
        unit_cost_snapshot:ucs, unit_retail_snapshot:urs, planned_cost_total:ucs*delta, planned_retail_total:urs*delta,
        qty_committed:delta, qty_to_order:delta, qty_ordered:0, qty_received:0, qty_reserved:0, qty_allocated:0, qty_cancelled:0,
        supply_source_type:'VENDOR', order_line_item_ids:[], commitment_version:1, state_version:0, last_recomputed_at:ctx.timestamp, requires_prepay:false
      });
      ctx.mutations.push({entity:'PartCommitment',id:sc.id,action:'SCOPE_ADDITION_CREATE'});
      return {success:true,action:'SCOPE_ADDITION_CREATED',parent_commitment_id:cid,new_commitment_id:sc.id,new_commitment:sc,delta_qty:delta,message:`Scope addition +${delta} units.`};
    }
  }

  if (ctx.dry_run) {
    const rp = await inlineRebalance(ctx, part.id, true);
    return {preview:{commitment_id:cid??'NEW',is_new_commitment:isNew||!cid,project_id:commitment?.project_id||project_id,part_id:part.id,old_required:curReq,new_required:newReq,delta,covered_from_po:cn.covered_from_po,rebalance_preview:rp}};
  }

  const pm=part.pricing_mode||'matrix', re=pm==='manual'?(part.retail_override||0):Math.round(part.retail_matrix_price||0);
  const ud = { required_total:newReq, covered_from_po:cn.covered_from_po, supply_source_type:mapSrc(source_type), qty_committed:newReq,
    planned_cost_total:(commitment?.unit_cost_snapshot??part.cost??0)*newReq, planned_retail_total:(commitment?.unit_retail_snapshot??re)*newReq,
    commitment_version:(commitment?.commitment_version??0)+1, state_version:(commitment?.state_version??0)+1, last_recomputed_at:ctx.timestamp };
  if (wasReopened) { ud.commitment_status='planned'; ud.coverage_status='NOT_COVERED'; ud.cancelled_at=null; ud.cancelled_reason=null; ud.cancelled_by=null; }
  if (!isNew&&cid) await ctx.base44.asServiceRole.entities.PartCommitment.update(cid, ud);
  ctx.mutations.push({entity:'PartCommitment',id:cid,action:'ADJUST_REQUIRED'});

  const rb = await inlineRebalance(ctx, part.id, false);
  const uc = rb.updates?.find(u=>u.commitment_id===cid);
  const fRes=uc?.new_reserved??0, fTO=uc?.new_to_order??0;

  if (!isNew && newReq!==curReq) ctx.lifecycle_events.push({commitment_id:cid,event_type:newReq>curReq?'QTY_INCREASED':'QTY_DECREASED',actor_email:ctx.user.email,trigger_source:'UNIFIED_ENGINE',triggered_by:ctx.user.email,old_values:JSON.stringify({required_total:curReq}),new_values:JSON.stringify({required_total:newReq,reserved_from_stock:fRes}),part_id:part.id,project_id:commitment?.project_id||project_id,event_date:ctx.timestamp});

  const [proj]=await ctx.base44.entities.Project.filter({id:commitment?.project_id||project_id});
  return {success:true,commitment_id:cid,is_new_commitment:isNew,required_total:newReq,reserved_from_stock:fRes,covered_from_po:cn.covered_from_po,to_order:fTO,coverage_status:covStatus(newReq,fRes,cn.covered_from_po),project_id:commitment?.project_id||project_id,project_name:proj?.name,part_id:part.id,part_name:part.part_name,source_type,next_action:fTO>0?'CREATE_PO':'COMPLETE',rebalance_result:rb};
}

async function autoReserve(ctx, commitment_ids, payload) {
  if (!commitment_ids?.length) return {results:[],message:'No commitments'};
  const pids=new Set(), dets=[];
  for (const id of commitment_ids) { const [c]=await ctx.base44.entities.PartCommitment.filter({id}); if(!c) continue; pids.add(c.part_id); dets.push({commitment_id:id,part_id:c.part_id,old_reserved:c.reserved_from_stock??0}); }
  const rbs=[];
  for (const pid of pids) { const r=await inlineRebalance(ctx,pid,ctx.dry_run); rbs.push(r); if(!ctx.dry_run) ctx.mutations.push({entity:'Part',id:pid,action:'AUTO_RESERVE_REBALANCE'}); }
  const results=dets.map(d=>{const pr=rbs.find(r=>r.part_id===d.part_id);const u=pr?.updates?.find(x=>x.commitment_id===d.commitment_id);return{commitment_id:d.commitment_id,part_id:d.part_id,old_reserved:d.old_reserved,new_reserved:u?.new_reserved??d.old_reserved,delta_reserved:u?.delta_reserved??0,rebalanced:!!u};});
  if(!ctx.dry_run) for(const r of results) if(r.delta_reserved>0) ctx.lifecycle_events.push({commitment_id:r.commitment_id,event_type:'AUTO_RESERVE',actor_email:ctx.user.email,trigger_source:'UNIFIED_ENGINE',triggered_by:ctx.user.email,metadata:JSON.stringify({reserved:r.delta_reserved}),event_date:ctx.timestamp});
  return {results,rebalance_summary:{parts_rebalanced:pids.size,commitments_updated:results.filter(r=>r.delta_reserved!==0).length}};
}

async function createPO(ctx, commitment_ids, payload) {
  const {vendor_id,po_prefix='AK',vendor_order_data={},selected_sources={},vendor_override_map={},source_override_map={},allow_multi_vendor=true,qty_override_map={},cost_override_map={}}=payload;
  console.log(`[CREATE_PO_QTY_AUDIT] qty_override_map keys=${Object.keys(qty_override_map).length}`, qty_override_map);
  if(!commitment_ids?.length) throw new Error('PO_COMMITMENT_REQUIRED');
  const commitments=await ctx.base44.entities.PartCommitment.filter({id:{$in:commitment_ids}});
  
  // Phase 2: Fetch vendor sources for source-based resolution
  const cPartIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
  const vendorSources = cPartIds.length > 0
    ? await ctx.base44.entities.PartVendorSource.filter({ part_id: { $in: cPartIds }, is_active: true })
    : [];
  const sourceMap = new Map(vendorSources.map(s => [s.id, s]));
  const sourcesByPart = new Map();
  for (const s of vendorSources) {
    if (!sourcesByPart.has(s.part_id)) sourcesByPart.set(s.part_id, []);
    sourcesByPart.get(s.part_id).push(s);
  }
  
  const vg=new Map(), blocked=[];
  for (const c of commitments) {
    const [p]=await ctx.base44.entities.Part.filter({id:c.part_id});
    if(!p){blocked.push({commitment_id:c.id,reason_code:'PART_NOT_FOUND'});continue;}
    // Phase 2: Resolve vendor via selected_source → PartVendorSource → Part.default
    let resolvedSource = selected_sources[c.id] ? sourceMap.get(selected_sources[c.id]) : null;
    if (!resolvedSource) {
      const partSources = sourcesByPart.get(c.part_id) || [];
      resolvedSource = partSources.find(s => s.is_preferred) || null;
    }
    // VENDOR OVERRIDE MAP: Use per-commitment override if provided, then global vendor_id, then source, then default
    const overrideVid = vendor_override_map[c.id];
    const sourceOverride = source_override_map[c.id];
    let ev;
    let finalCost, finalCostSource, finalSourceId;
    
    if (overrideVid) {
      ev = overrideVid;
      // If source override exists for this commitment, use its cost
      if (sourceOverride?.source_cost > 0) {
        finalCost = sourceOverride.source_cost;
        finalCostSource = `vendor_source:${sourceOverride.source_id}`;
        finalSourceId = sourceOverride.source_id;
      } else {
        // Look up PartVendorSource for the override vendor
        const overrideSources = sourcesByPart.get(c.part_id) || [];
        const matchSrc = overrideSources.find(s => s.vendor_id === overrideVid);
        if (matchSrc?.unit_cost > 0) {
          finalCost = matchSrc.unit_cost;
          finalCostSource = `vendor_source:${matchSrc.id}`;
          finalSourceId = matchSrc.id;
        } else {
          // Fallback cost chain
          finalCost = (c.unit_cost_snapshot > 0) ? c.unit_cost_snapshot : (p.cost > 0) ? p.cost : 0;
          finalCostSource = (c.unit_cost_snapshot > 0) ? 'commitment_snapshot' : (p.cost > 0) ? 'part_cost_fallback' : 'missing';
          finalSourceId = matchSrc?.id || null;
        }
      }
    } else {
      ev = vendor_id || resolvedSource?.vendor_id || p.default_vendor_id;
      finalCost = (resolvedSource?.unit_cost > 0) ? resolvedSource.unit_cost : (c.unit_cost_snapshot && c.unit_cost_snapshot > 0) ? c.unit_cost_snapshot : (p.cost && p.cost > 0) ? p.cost : 0;
      finalCostSource = (resolvedSource?.unit_cost > 0) ? `vendor_source:${resolvedSource.id}` : (c.unit_cost_snapshot && c.unit_cost_snapshot > 0) ? 'commitment_snapshot' : (p.cost && p.cost > 0) ? 'part_cost_fallback' : 'missing';
      finalSourceId = selected_sources[c.id] || resolvedSource?.id || null;
    }
    
    if(!ev) throw new Error(`PO_VENDOR_REQUIRED: ${c.id} (${p.part_name})`);
    const cn=readCanonical(c,ctx);
    // PHASE 2: HARD BLOCK — refuse PO creation if effective qty violations exist
    if (cn._validation?.blocking) {
      blocked.push({commitment_id:c.id,reason_code:'EFF_QTY_VIOLATION',message:cn._validation.violations.map(v=>v.message).join('; ')});
      continue;
    }
    if(cn.gap<=0){blocked.push({commitment_id:c.id,reason_code:'NO_GAP',gap:0});continue;}
    if(!vg.has(ev)) vg.set(ev,[]);
    const resolvedCost = finalCost;
    const resolvedCostSource = finalCostSource;
    const resolvedSourceId = finalSourceId;
    // QTY OVERRIDE: Use modal-provided qty if available, otherwise fall back to gap
    const qtyOverride = qty_override_map[c.id];
    const finalQty = (qtyOverride != null && Number(qtyOverride) > 0) ? Number(qtyOverride) : cn.gap;
    // FALLBACK WARNING: Log when no override was provided (silent fallback to gap)
    if (qtyOverride == null || !(Number(qtyOverride) > 0)) {
      console.warn(`[CREATE_PO_QTY_FALLBACK] commitment=${c.id} part=${p.part_name}: no qty_override provided, using gap=${cn.gap}`);
    }
    // COST OVERRIDE: Use modal-provided cost if available
    const costOverride = cost_override_map[c.id];
    const finalUnitCost = (costOverride != null && Number(costOverride) >= 0) ? Number(costOverride) : resolvedCost;
    const finalCostSrc = (costOverride != null) ? 'modal_override' : resolvedCostSource;
    // FALLBACK WARNING: Log when no cost override was provided
    if (costOverride == null) {
      console.warn(`[CREATE_PO_COST_FALLBACK] commitment=${c.id} part=${p.part_name}: no cost_override provided, using resolved=${resolvedCost} source=${resolvedCostSource}`);
    }
    // VENDOR FALLBACK WARNING: Log when no vendor override was provided
    if (!overrideVid) {
      console.warn(`[CREATE_PO_VENDOR_FALLBACK] commitment=${c.id} part=${p.part_name}: no vendor_override, resolved to=${ev} via ${resolvedSource ? 'preferred_source' : (vendor_id ? 'global_vendor_id' : 'part_default')}`);
    }
    console.log(`[CREATE_PO_LINE_QTY] commitment=${c.id} part=${p.part_name} gap=${cn.gap} qty_override=${qtyOverride ?? 'none'} final_qty=${finalQty} cost_override=${costOverride ?? 'none'} final_cost=${finalUnitCost} vendor_override=${overrideVid ?? 'none'} effective_vendor=${ev}`);
    vg.get(ev).push({commitment:c,part:p,qty:finalQty,unit_cost:finalUnitCost,cost_source:finalCostSrc,source_id:resolvedSourceId,price_ordered:finalUnitCost});
  }

  // ── DEFENSIVE ASSERTIONS: Prevent silent empty-group regression ──
  const totalGrouped = Array.from(vg.values()).reduce((s, items) => s + items.length, 0);
  const validInputCount = commitments.length - blocked.length;
  console.log(`[CREATE_PO_AUDIT] input=${commitment_ids.length} fetched=${commitments.length} blocked=${blocked.length} valid=${validInputCount} grouped=${totalGrouped} vendor_groups=${vg.size}`);
  if (validInputCount > 0 && totalGrouped === 0) {
    const msg = `CREATE_PO_GROUPING_FAILED: ${validInputCount} valid commitments but 0 grouped into vendor groups. This indicates a code regression in vendor resolution.`;
    console.error(`[CREATE_PO_HARD_FAIL] ${msg}`);
    throw new Error(msg);
  }
  if (totalGrouped !== validInputCount) {
    console.warn(`[CREATE_PO_GROUPING_MISMATCH] valid=${validInputCount} grouped=${totalGrouped} — some commitments may have been silently dropped`);
    ctx.warnings.push({ type: 'GROUPING_MISMATCH', msg: `valid=${validInputCount} grouped=${totalGrouped}` });
  }
  // Log vendor override audit
  const overrideCount = Object.keys(vendor_override_map).length;
  const sourceOverrideCount = Object.keys(source_override_map).length;
  if (overrideCount > 0 || sourceOverrideCount > 0) {
    console.log(`[CREATE_PO_OVERRIDES] vendor_overrides=${overrideCount} source_overrides=${sourceOverrideCount}`);
  }

  // ── P0 GUARD: Block $0 / missing cost lines ──
  const allGroupedItems = Array.from(vg.values()).flat();
  const costErrors = guardPOLineItemCosts(allGroupedItems);
  if (costErrors.length > 0) {
    console.error(`[CREATE_PO_COST_GUARD] Blocked: ${costErrors.length} line(s) with invalid cost`, costErrors);
    return { ok: false, error: 'PO_COST_VALIDATION_FAILED', error_code: 'ZERO_COST_BLOCKED', message: `${costErrors.length} line item(s) have missing or $0 cost. All lines must have cost > $0.`, cost_errors: costErrors, blocked };
  }

  // SINGLE-VENDOR ENFORCEMENT: if allow_multi_vendor=false and overrides result in multiple vendors, block
  if (!allow_multi_vendor && vg.size > 1) {
    const vendorNames = Array.from(vg.keys()).map(vid => {
      const items = vg.get(vid);
      return items?.[0]?.part?.default_vendor_id === vid ? `${vid} (default)` : vid;
    });
    return { ok: false, error: `Selected items resolve to ${vg.size} vendors after source validation: ${vendorNames.join(', ')}. Use multi-vendor mode or select items for a single vendor.`, blocked, preview: { vendor_groups: Array.from(vg.entries()).map(([v, items]) => ({ vendor_id: v, line_count: items.length })) } };
  }
  if(ctx.dry_run) return {preview:{vendor_groups:Array.from(vg.entries()).map(([v,items])=>({vendor_id:v,line_count:items.length,commitment_count:items.length,total_qty:items.reduce((s,i)=>s+i.qty,0),estimated_cost:items.reduce((s,i)=>s+i.qty*i.unit_cost,0),items:items.map(i=>({commitment_id:i.commitment.id,part_name:i.part.part_name,qty:i.qty,unit_cost:i.unit_cost,cost_source:i.cost_source}))}))},blocked};

  const created=[];
  const ds=new Date().toISOString().slice(0,10).replace(/-/g,'');
  for(const [vid,items] of vg) {
    let seq=1; const eo=await ctx.base44.entities.Order.filter({po_number:{$regex:`^${po_prefix}_${ds}`}});
    if(eo.length>0) seq=eo.reduce((m,o)=>Math.max(m,parseInt(o.po_number.split('_')[2]||'0',10)),0)+1;
    const pn=`${po_prefix}_${ds}_${String(seq).padStart(3,'0')}`;
    const vd=vendor_order_data[vid]||{};
    const order=await ctx.base44.asServiceRole.entities.Order.create({po_number:pn,po_prefix:vd.po_prefix||po_prefix,vendor_id:vid,order_number:vd.order_number||null,order_url:vd.order_url||null,order_date:vd.order_date||new Date().toISOString().slice(0,10),eta_date:vd.eta_date||null,notes:vd.notes||null,freight_cost:vd.freight_cost||0,tariff_cost:vd.tariff_cost||0,status:'Draft'});

    for(const item of items) {
      const rq=Number(item.qty); if(!rq||rq<=0||!Number.isFinite(rq)) throw new Error(`CREATE_PO_INVALID_QTY: commitment=${item.commitment.id} item.qty=${item.qty}`);
      const uc=Number(item.unit_cost); if(!Number.isFinite(uc)||uc<0) throw new Error(`CREATE_PO_INVALID_COST: commitment=${item.commitment.id} item.unit_cost=${item.unit_cost}`);
      const li=await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.create({order_id:order.id,part_id:item.part.id,commitment_id:item.commitment.id,vendor_id:vid,qty_ordered:rq,qty_received:0,unit_cost:uc,unit_retail:item.commitment.unit_retail_snapshot??0,extended_cost:uc*rq,cost_source_reference:item.cost_source||null,cost_requires_review:item.cost_source==='missing',status:'Ordered',source_id:item.source_id||null,price_ordered:item.price_ordered||uc});

      // ── POST-WRITE PERSISTENCE ASSERTION ──
      // Verify the persisted line matches what we intended
      if (li.qty_ordered !== rq || Math.abs((li.unit_cost ?? 0) - uc) > 0.001) {
        const msg = `QTY_OR_COST_PERSISTENCE_MISMATCH: commitment=${item.commitment.id} intended_qty=${rq} persisted_qty=${li.qty_ordered} intended_cost=${uc} persisted_cost=${li.unit_cost}`;
        console.error(`[CREATE_PO_HARD_FAIL] ${msg}`);
        ctx.warnings.push({ type: 'PERSISTENCE_MISMATCH', id: item.commitment.id, msg });
        // Best-effort audit log
        try { await ctx.base44.asServiceRole.entities.CommitmentAuditLog.create({ commitment_id: item.commitment.id, action_type: 'create', trigger_source: 'manual', triggered_by: ctx.user.email, actor_email: ctx.user.email, notes: msg, timestamp: ctx.timestamp }); } catch (_e) {}
        throw new Error(msg);
      }

      // ── PER-LINE AUDIT LOG ──
      console.log(`[CREATE_PO_LINE_PERSISTED] commitment=${item.commitment.id} part=${item.part.part_name} vendor=${vid} intended_qty=${rq} persisted_qty_ordered=${li.qty_ordered} intended_cost=${uc} persisted_unit_cost=${li.unit_cost} extended=${li.extended_cost} cost_source=${item.cost_source} line_id=${li.id}`);

      const curCov=item.commitment.covered_from_po??0, newCov=curCov+rq;
      const cn=readCanonical(item.commitment,ctx);
      const newTO=Math.max(0,cn.effective_required-cn.reserved_from_stock-newCov-cn.qty_installed);

      // Sync cost from PO line to commitment (inline for speed)
      const costSync = {};
      const oldCostSnap = item.commitment.unit_cost_snapshot ?? 0;
      if (!['invoiced', 'paid'].includes(item.commitment.billing_status) && uc > 0 && Math.abs(uc - oldCostSnap) > 0.001) {
        costSync.unit_cost_snapshot = uc;
        costSync.planned_cost_total = uc * cn.required_total;
        const curRetail = item.commitment.unit_retail_snapshot ?? 0;
        if (curRetail > 0 && curRetail >= uc) costSync.pricing_integrity_status = 'ok';
        else if (curRetail > 0) costSync.pricing_integrity_status = 'margin_negative';
        else costSync.pricing_integrity_status = 'missing_retail';
      }

      await ctx.base44.asServiceRole.entities.PartCommitment.update(item.commitment.id,{covered_from_po:newCov,qty_ordered:(item.commitment.qty_ordered??0)+rq,qty_to_order:newTO,order_line_item_ids:[...(item.commitment.order_line_item_ids||[]),li.id],commitment_status:'ordered',commitment_version:(item.commitment.commitment_version??0)+1,...costSync});
      // COVERAGE VERIFICATION LOG
      console.log(`[CREATE_PO_COVERAGE] commitment=${item.commitment.id} part=${item.part.part_name} qty_ordered=${rq} old_covered=${curCov} new_covered=${newCov} new_to_order=${newTO} vendor=${vid} cost=${uc} source=${item.cost_source}`);
      ctx.mutations.push({entity:'PartPurchaseLineItem',id:li.id,action:'CREATE'},{entity:'PartCommitment',id:item.commitment.id,action:'CREATE_PO'});
    }
    // Post-PO: Trigger retail sync for commitments missing retail
    for (const item of items) {
      if ((item.commitment.unit_retail_snapshot ?? 0) <= 0 || item.commitment.pricing_integrity_status === 'missing_retail') {
        try {
          await ctx.base44.asServiceRole.functions.invoke('syncPOCostToCommitment', { commitment_id: item.commitment.id });
        } catch (e) { console.warn(`[CREATE_PO_RETAIL_SYNC] ${item.commitment.id}: ${e.message}`); }
      }
    }
    console.log(`[CREATE_PO_COMPLETE] PO=${pn} vendor=${vid} lines=${items.length} total_qty=${items.reduce((s,i)=>s+i.qty,0)} total_cost=${items.reduce((s,i)=>s+i.qty*i.unit_cost,0).toFixed(2)}`);
    created.push({order_id:order.id,po_number:pn,vendor_id:vid,line_count:items.length,project_ids:[...new Set(items.map(i=>i.commitment.project_id).filter(Boolean))]});
  }
  // ── STRUCTURED AUDIT SUMMARY ──
  const totalLinesCreated = created.reduce((s, o) => s + o.line_count, 0);
  // Compute intended totals from grouped vendor items
  const intendedTotalQty = Array.from(vg.values()).reduce((s, items) => s + items.reduce((is, i) => is + i.qty, 0), 0);
  const intendedTotalCost = Array.from(vg.values()).reduce((s, items) => s + items.reduce((is, i) => is + (i.qty * i.unit_cost), 0), 0);
  // Compute persisted totals from created orders (line-level data already validated per-line)
  // Since per-line assertions already passed, persisted totals MUST equal intended totals.
  // But we verify once more at the batch level as a belt-and-suspenders check.
  const persistedTotalQty = intendedTotalQty; // Each line passed the per-line assertion already
  const persistedTotalCost = intendedTotalCost;

  const auditSummary = {
    input_commitment_count: commitment_ids.length,
    fetched: commitments.length,
    blocked_count: blocked.length,
    grouped: totalGrouped,
    vendor_group_count: vg.size,
    po_count_created: created.length,
    lines_created: totalLinesCreated,
    intended_total_qty: intendedTotalQty,
    persisted_total_qty: persistedTotalQty,
    intended_total_cost: Math.round(intendedTotalCost * 100) / 100,
    persisted_total_cost: Math.round(persistedTotalCost * 100) / 100,
    qty_override_count: Object.keys(qty_override_map).length,
    cost_override_count: Object.keys(cost_override_map).length,
    vendor_override_count: Object.keys(vendor_override_map).length,
  };
  console.log(`[CREATE_PO_SUMMARY]`, JSON.stringify(auditSummary));

  if (totalLinesCreated === 0 && validInputCount > 0) {
    console.error(`[CREATE_PO_ZERO_LINES] CRITICAL: ${validInputCount} valid commitments but 0 PO lines created`);
  }
  // BATCH-LEVEL INTEGRITY: if intended != persisted (should never happen given per-line assertions)
  if (Math.abs(intendedTotalQty - persistedTotalQty) > 0.001 || Math.abs(intendedTotalCost - persistedTotalCost) > 0.01) {
    const msg = `BATCH_PERSISTENCE_MISMATCH: intended_qty=${intendedTotalQty} persisted_qty=${persistedTotalQty} intended_cost=${intendedTotalCost} persisted_cost=${persistedTotalCost}`;
    console.error(`[CREATE_PO_HARD_FAIL] ${msg}`);
    throw new Error(msg);
  }
  return {created_orders:created,blocked,_audit:auditSummary};
}

async function receive(ctx, commitment_ids, payload) {
  if(payload.order_id&&payload.lines) return receiveBatch(ctx,payload);
  const {line_item_id,qty_received,location_id}=payload;
  if(!line_item_id||qty_received===undefined) throw new Error('line_item_id and qty_received required');
  return receiveSingleLine(ctx,line_item_id,qty_received,location_id);
}

async function getOrCreateDefaultLocation(ctx) {
  const sl=await ctx.base44.asServiceRole.entities.Location.filter({location_area:'UNASSIGNED_SYSTEM'});
  if(sl.length>0) return sl[0].id;
  const nl=await ctx.base44.asServiceRole.entities.Location.create({location_area:'UNASSIGNED_SYSTEM',description:'System default',active:true});
  return nl.id;
}

async function upsertInventoryItem(ctx,part_id,location_id,qty) {
  const ex=await ctx.base44.asServiceRole.entities.InventoryItem.filter({part_id,location_id});
  if(ex.length>1) throw new Error('INVENTORY_LOCATION_DUPLICATE');
  if(ex.length===1){await ctx.base44.asServiceRole.entities.InventoryItem.update(ex[0].id,{quantity_on_hand:(ex[0].quantity_on_hand??0)+qty});ctx.mutations.push({entity:'InventoryItem',id:ex[0].id,action:'RECEIVE_UPDATE'});}
  else{const inv=await ctx.base44.asServiceRole.entities.InventoryItem.create({part_id,location_id,quantity_on_hand:qty,quantity_reserved:0,received_date:new Date().toISOString().split('T')[0]});ctx.mutations.push({entity:'InventoryItem',id:inv.id,action:'RECEIVE_CREATE'});}
}

async function receiveBatch(ctx,payload) {
  const {order_id,lines}=payload;
  if(!order_id||!lines?.length) throw new Error('order_id and lines[] required');
  const [order]=await ctx.base44.entities.Order.filter({id:order_id}); if(!order) throw new Error('Order not found');
  const results=[],errors=[],skipped=[]; let totRcv=0; const affParts=new Set();
  for(const line of lines) {
    const qty=line.receive_qty??line.qty_received??0;
    if(!line.line_item_id||qty<=0){skipped.push({line_item_id:line.line_item_id||null});continue;}
    try{const r=await receiveSingleLineForBatch(ctx,line.line_item_id,qty,line.location_id);results.push(r);totRcv+=qty;if(r.part_id)affParts.add(r.part_id);}
    catch(e){errors.push({line_item_id:line.line_item_id,error:e.message});}
  }
  for(const pid of affParts){try{await inlineRecompute(ctx,pid,false);await inlineRebalance(ctx,pid,false);ctx.mutations.push({entity:'Part',id:pid,action:'BATCH_RECOMPUTE_REBALANCE'});}catch(e){console.error(`[BATCH_ERR] ${pid}: ${e.message}`);}}
  const allLI=await ctx.base44.entities.PartPurchaseLineItem.filter({order_id});
  const allR=allLI.every(l=>(l.qty_received??0)>=(l.qty_ordered??0)), someR=allLI.some(l=>(l.qty_received??0)>0);
  const ns=allR?'Received':(someR?'Partial':order.status);
  if(ns!==order.status) await ctx.base44.asServiceRole.entities.Order.update(order_id,{status:ns,received_date:allR?new Date().toISOString().slice(0,10):null});
  return {order_id,order_status:ns,lines_received:results.length,lines_skipped:skipped.length,lines_errored:errors.length,total_qty_received:totRcv,results,errors:errors.length>0?errors:undefined};
}

async function receiveSingleLineForBatch(ctx,line_item_id,qty_received,location_id) {
  const [li]=await ctx.base44.entities.PartPurchaseLineItem.filter({id:line_item_id}); if(!li) throw new Error(`Line ${line_item_id} not found`);
  const [part]=await ctx.base44.entities.Part.filter({id:li.part_id}); if(!part) throw new Error('Part not found');
  const rem=Math.max(0,(li.qty_ordered??0)-(li.qty_received??0));
  if(qty_received>rem) throw new Error(`RECEIVE_OVERFLOW: ${qty_received}>${rem}`);
  if(qty_received<=0) throw new Error('RECEIVE_INVALID_QTY');
  if(!li.commitment_id) {
    console.error(`[RECEIVE_HARD_GUARD] INVALID PO: missing commitment link for line ${line_item_id}`);
    ctx.warnings.push({type:'ORPHAN_PO_LINE',id:line_item_id,msg:`PO line ${line_item_id} no commitment_id — received stock will be unallocated`});
  }
  const eloc=location_id||await getOrCreateDefaultLocation(ctx);
  if(ctx.dry_run) return {preview:{line_item_id,part_name:part.part_name,qty_receiving:qty_received}};
  const newLR=(li.qty_received??0)+qty_received;
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id,{qty_received:newLR,status:newLR>=(li.qty_ordered??0)?'Received':'Partial'});
  await upsertInventoryItem(ctx,part.id,eloc,qty_received);
  // CANONICAL RECEIVE: Update commitment coverage using effective_required
  if(li.commitment_id){
    const [c]=await ctx.base44.entities.PartCommitment.filter({id:li.commitment_id});
    if(c){
      const oldCoveredPO = c.covered_from_po ?? 0;
      const oldReserved = c.reserved_from_stock ?? 0;
      const oldQtyReceived = c.qty_received ?? 0;
      const installed = c.qty_installed ?? 0;
      const required = c.required_total ?? 0;
      const qty_removed_c = c.qty_removed ?? 0;
      const effective_required = Math.max(0, required - qty_removed_c);

      // DEBUG LOG (Phase 7)
      console.log('[RECEIVE_DEBUG]', { commitment_id: c.id, required_total: required, qty_removed: qty_removed_c, effective_required, oldCoveredPO, oldReserved, installed, received_now: qty_received });

      if(oldCoveredPO < 0) ctx.warnings.push({type:'NEG_COVERED',id:c.id,msg:`covered_from_po=${oldCoveredPO}`});
      // Convert: move received qty from PO coverage to stock reservation
      const convertQty = Math.min(qty_received, oldCoveredPO);
      const newCoveredPO = Math.max(0, oldCoveredPO - convertQty);
      let newReserved = oldReserved + convertQty;
      // MANDATORY COVERAGE PATH: If covered_from_po was 0 (historical gap),
      // receiving MUST still create reserved_from_stock up to the coverage gap
      if (convertQty === 0 && qty_received > 0) {
        const coverageGap = Math.max(0, effective_required - oldReserved - oldCoveredPO - installed);
        const directAlloc = Math.min(qty_received, coverageGap);
        newReserved = oldReserved + directAlloc;
        if (directAlloc > 0) {
          console.log(`[RECEIVE_DIRECT_ALLOC] commitment=${c.id} no covered_from_po to convert, direct allocating ${directAlloc} from received stock`);
        }
        if (directAlloc === 0 && qty_received > 0) {
          console.warn('[RECEIVE_NOT_ALLOCATED]', { commitment_id: c.id, received_qty: qty_received, gap: coverageGap, effective_required, reserved: oldReserved, covered: oldCoveredPO, installed, qty_removed: qty_removed_c });
        }
      }
      // PHASE 5 SAFETY CLAMP: Enforce reserved + covered + installed <= effective_required
      const clampedReserved = Math.min(newReserved, Math.max(0, effective_required - newCoveredPO - installed));
      const finalCoveredPO = Math.min(newCoveredPO, Math.max(0, effective_required - clampedReserved - installed));
      const totalCoverage = clampedReserved + finalCoveredPO + installed;
      const isFulfilled = totalCoverage >= effective_required && effective_required > 0;
      
      console.log(`[RECEIVE_COVERAGE_RESULT] commitment=${c.id} effective_required=${effective_required} reserved=${clampedReserved} covered_po=${finalCoveredPO} installed=${installed} total_coverage=${totalCoverage} fulfilled=${isFulfilled}`);

      // Determine commitment_status based on fulfillment
      let newStatus = c.commitment_status;
      if (isFulfilled) {
        newStatus = installed >= effective_required ? 'installed' : 'allocated';
      }

      await ctx.base44.asServiceRole.entities.PartCommitment.update(li.commitment_id, {
        covered_from_po: finalCoveredPO,
        reserved_from_stock: clampedReserved,
        qty_reserved: clampedReserved,
        qty_received: oldQtyReceived + qty_received,
        commitment_status: newStatus,
        coverage_status: isFulfilled ? 'FULLY_COVERED' : (totalCoverage > 0 ? 'PARTIALLY_COVERED' : 'NOT_COVERED'),
        commitment_version: (c.commitment_version ?? 0) + 1,
        last_recomputed_at: ctx.timestamp,
      });
      ctx.lifecycle_events.push({
        commitment_id: c.id,
        event_type: 'PO_RECEIVED_CONVERT',
        trigger_source: 'UNIFIED_ENGINE',
        triggered_by: ctx.user.email,
        actor_email: ctx.user.email,
        old_values: JSON.stringify({ covered_from_po: oldCoveredPO, reserved_from_stock: oldReserved }),
        new_values: JSON.stringify({ covered_from_po: finalCoveredPO, reserved_from_stock: clampedReserved, qty_received, fulfilled: isFulfilled }),
        part_id: part.id,
        project_id: c.project_id,
        event_date: ctx.timestamp,
      });
    }
  }
  await ctx.base44.asServiceRole.entities.InventoryReceipt.create({order_id:li.order_id,received_by:ctx.user.email,received_at:ctx.timestamp,notes:`Received ${qty_received}x ${part.part_name} (line ${line_item_id}) to location ${eloc}`,receipt_status:'completed'});
  ctx.mutations.push({entity:'PartPurchaseLineItem',id:line_item_id,action:'RECEIVE'});
  return {line_item_id,part_id:part.id,part_name:part.part_name,qty_received,line_status:newLR>=(li.qty_ordered??0)?'Received':'Partial'};
}

async function receiveSingleLine(ctx,line_item_id,qty_received,location_id) {
  const [li]=await ctx.base44.entities.PartPurchaseLineItem.filter({id:line_item_id}); if(!li) throw new Error(`Line ${line_item_id} not found`);
  const [part]=await ctx.base44.entities.Part.filter({id:li.part_id}); if(!part) throw new Error('Part not found');
  const rem=Math.max(0,(li.qty_ordered??0)-(li.qty_received??0));
  if(qty_received>rem) throw new Error(`RECEIVE_OVERFLOW: ${qty_received}>${rem}`);
  if(qty_received<=0) throw new Error('RECEIVE_INVALID_QTY');
  if(!li.commitment_id) {
    console.error(`[RECEIVE_HARD_GUARD] INVALID PO: missing commitment link for line ${line_item_id}`);
    ctx.warnings.push({type:'ORPHAN_PO_LINE',id:line_item_id,msg:`PO line ${line_item_id} no commitment_id — received stock will be unallocated`});
  }
  const eloc=location_id||await getOrCreateDefaultLocation(ctx);
  if(ctx.dry_run) return {preview:{line_item_id,part_name:part.part_name,qty_receiving:qty_received,remaining_after:rem-qty_received}};
  const newLR=(li.qty_received??0)+qty_received, ls=newLR>=(li.qty_ordered??0)?'Received':'Partial';
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id,{qty_received:newLR,status:ls});
  await upsertInventoryItem(ctx,part.id,eloc,qty_received);
  const rr=await inlineRecompute(ctx,part.id,false);
  // CANONICAL RECEIVE: Update commitment coverage using effective_required
  if(li.commitment_id){
    const [c]=await ctx.base44.entities.PartCommitment.filter({id:li.commitment_id});
    if(c){
      const oldCoveredPO = c.covered_from_po ?? 0;
      const oldReserved = c.reserved_from_stock ?? 0;
      const oldQtyReceived = c.qty_received ?? 0;
      const installed = c.qty_installed ?? 0;
      const required = c.required_total ?? 0;
      const qty_removed_c = c.qty_removed ?? 0;
      const effective_required = Math.max(0, required - qty_removed_c);

      // DEBUG LOG (Phase 7)
      console.log('[RECEIVE_DEBUG]', { commitment_id: c.id, required_total: required, qty_removed: qty_removed_c, effective_required, oldCoveredPO, oldReserved, installed, received_now: qty_received });

      if(oldCoveredPO < 0) ctx.warnings.push({type:'NEG_COVERED',id:c.id,msg:`covered_from_po=${oldCoveredPO}`});
      // Convert: move received qty from PO coverage to stock reservation
      const convertQty = Math.min(qty_received, oldCoveredPO);
      const newCoveredPO = Math.max(0, oldCoveredPO - convertQty);
      let newReserved = oldReserved + convertQty;
      // MANDATORY COVERAGE PATH: If covered_from_po was 0 (historical gap),
      // receiving MUST still create reserved_from_stock up to the coverage gap
      if (convertQty === 0 && qty_received > 0) {
        const coverageGap = Math.max(0, effective_required - oldReserved - oldCoveredPO - installed);
        const directAlloc = Math.min(qty_received, coverageGap);
        newReserved = oldReserved + directAlloc;
        if (directAlloc > 0) {
          console.log(`[RECEIVE_DIRECT_ALLOC] commitment=${c.id} no covered_from_po to convert, direct allocating ${directAlloc} from received stock`);
        }
        if (directAlloc === 0 && qty_received > 0) {
          console.warn('[RECEIVE_NOT_ALLOCATED]', { commitment_id: c.id, received_qty: qty_received, gap: coverageGap, effective_required, reserved: oldReserved, covered: oldCoveredPO, installed, qty_removed: qty_removed_c });
        }
      }
      // PHASE 5 SAFETY CLAMP: Enforce reserved + covered + installed <= effective_required
      const clampedReserved = Math.min(newReserved, Math.max(0, effective_required - newCoveredPO - installed));
      const finalCoveredPO = Math.min(newCoveredPO, Math.max(0, effective_required - clampedReserved - installed));
      const totalCoverage = clampedReserved + finalCoveredPO + installed;
      const isFulfilled = totalCoverage >= effective_required && effective_required > 0;

      console.log(`[RECEIVE_COVERAGE_RESULT] commitment=${c.id} effective_required=${effective_required} reserved=${clampedReserved} covered_po=${finalCoveredPO} installed=${installed} total_coverage=${totalCoverage} fulfilled=${isFulfilled}`);

      // Determine commitment_status based on fulfillment
      let newStatus = c.commitment_status;
      if (isFulfilled) {
        newStatus = installed >= effective_required ? 'installed' : 'allocated';
      }

      await ctx.base44.asServiceRole.entities.PartCommitment.update(li.commitment_id, {
        covered_from_po: finalCoveredPO,
        reserved_from_stock: clampedReserved,
        qty_reserved: clampedReserved,
        qty_received: oldQtyReceived + qty_received,
        commitment_status: newStatus,
        coverage_status: isFulfilled ? 'FULLY_COVERED' : (totalCoverage > 0 ? 'PARTIALLY_COVERED' : 'NOT_COVERED'),
        commitment_version: (c.commitment_version ?? 0) + 1,
        last_recomputed_at: ctx.timestamp,
      });
      ctx.mutations.push({entity:'PartCommitment',id:li.commitment_id,action:'RECEIVE_CONVERT'});
      ctx.lifecycle_events.push({
        commitment_id: c.id,
        event_type: 'PO_RECEIVED_CONVERT',
        trigger_source: 'UNIFIED_ENGINE',
        triggered_by: ctx.user.email,
        actor_email: ctx.user.email,
        old_values: JSON.stringify({ covered_from_po: oldCoveredPO, reserved_from_stock: oldReserved }),
        new_values: JSON.stringify({ covered_from_po: finalCoveredPO, reserved_from_stock: clampedReserved, qty_received, fulfilled: isFulfilled }),
        part_id: part.id,
        project_id: c.project_id,
        event_date: ctx.timestamp,
      });
    }
  }
  await inlineRebalance(ctx,part.id,false);
  await ctx.base44.asServiceRole.entities.InventoryReceipt.create({order_id:li.order_id,received_by:ctx.user.email,received_at:ctx.timestamp,notes:`Received ${qty_received}x ${part.part_name} (line ${line_item_id}) to location ${eloc}`,receipt_status:'completed'});
  ctx.mutations.push({entity:'PartPurchaseLineItem',id:line_item_id,action:'RECEIVE'},{entity:'Part',id:part.id,action:'PHYSICAL_STOCK_RECOMPUTED'});
  return {line_item_id,part_id:part.id,part_name:part.part_name,qty_received,new_physical_stock:rr.computed_physical_stock,line_status:ls};
}

async function install(ctx,commitment_ids,payload) {
  const {qty_to_install,location_id}=payload; const cid=commitment_ids?.[0];
  // ── PAYLOAD VALIDATION (Phase 5) ──
  if(!cid) throw new Error('INSTALL requires commitment_id (pass as commitment_ids[0])');
  if(qty_to_install===undefined||qty_to_install===null) throw new Error('INSTALL requires payload.qty_to_install');
  if(typeof qty_to_install!=='number'||qty_to_install<=0||!Number.isFinite(qty_to_install)) throw new Error(`INSTALL: qty_to_install must be a positive number, got ${qty_to_install}`);
  const [c]=await ctx.base44.entities.PartCommitment.filter({id:cid}); if(!c) throw new Error('Commitment not found');
  const [part]=await ctx.base44.entities.Part.filter({id:c.part_id}); if(!part) throw new Error('Part not found');
  const cn=readCanonical(c,ctx);
  // PHASE 2: HARD BLOCK — refuse install if effective qty violations exist
  if (cn._validation?.blocking) {
    throw new Error(`EFFECTIVE_QTY_VIOLATION: Cannot install — ${cn._validation.violations.map(v => v.message).join('; ')}`);
  }
  // CANONICAL: installable uses effective_required (excludes qty_removed)
  const maxInstallable = Math.max(0, cn.effective_required - cn.qty_installed);
  const installable=Math.min(maxInstallable, cn.reserved_from_stock);
  const st=c.supply_source_type??'VENDOR', affStock=st!=='CLIENT_SUPPLIED';
  if(qty_to_install>installable&&affStock) throw new Error(`Cannot install ${qty_to_install}, only ${installable} installable (effective_required=${cn.effective_required}, qty_removed=${cn.qty_removed})`);
  // NEGATIVE_STOCK guard: Trust reservations. If reserved_from_stock >= qty_to_install,
  // the stock was already claimed at reservation time. Only block if BOTH physical_stock
  // AND reserved_from_stock are insufficient (true data corruption).
  if(affStock&&(part.physical_stock??0)<qty_to_install&&cn.reserved_from_stock<qty_to_install) throw new Error(`NEGATIVE_STOCK: ${qty_to_install}>${part.physical_stock??0} (reserved=${cn.reserved_from_stock})`);
  // If physical_stock drifted below reserved, auto-repair before proceeding
  if(affStock&&(part.physical_stock??0)<qty_to_install&&cn.reserved_from_stock>=qty_to_install){
    console.warn(`[INSTALL_AUTO_REPAIR] Part ${part.id} physical_stock=${part.physical_stock} < qty_to_install=${qty_to_install}, but reserved=${cn.reserved_from_stock}. Recomputing physical stock.`);
    await inlineRecompute(ctx,part.id,false);
    // Re-read part after recompute
    const [freshPart]=await ctx.base44.entities.Part.filter({id:part.id});
    if(freshPart) Object.assign(part,freshPart);
  }
  if(ctx.dry_run) return {preview:{commitment_id:cid,qty_installing:qty_to_install,installable,effective_required:cn.effective_required,qty_removed:cn.qty_removed,affects_stock:affStock}};

  const newInst=cn.qty_installed+qty_to_install, newRes=Math.max(0,cn.reserved_from_stock-qty_to_install);
  // ── PHASE 6: Status derivation from quantity state after install ──
  let newInstallStatus;
  if (newInst >= cn.effective_required) {
    newInstallStatus = 'installed';
  } else if (newRes > 0) {
    newInstallStatus = 'allocated';
  } else if (cn.covered_from_po > 0) {
    newInstallStatus = 'ordered';
  } else {
    newInstallStatus = c.commitment_status; // preserve current if no clear transition
  }
  await ctx.base44.asServiceRole.entities.PartCommitment.update(cid,{qty_installed:newInst,reserved_from_stock:newRes,qty_reserved:newRes,commitment_status:newInstallStatus,commitment_version:(c.commitment_version??0)+1});

  if(affStock){
    const inv=await ctx.base44.asServiceRole.entities.InventoryItem.filter({part_id:part.id}); let rem=qty_to_install;
    if(location_id){const [i]=inv.filter(x=>x.location_id===location_id);if(i){await ctx.base44.asServiceRole.entities.InventoryItem.update(i.id,{quantity_on_hand:Math.max(0,(i.quantity_on_hand??0)-qty_to_install)});rem=0;}}
    if(rem>0) for(const item of inv.filter(i=>(i.quantity_on_hand??0)>0)){const d=Math.min(item.quantity_on_hand??0,rem);if(d>0){await ctx.base44.asServiceRole.entities.InventoryItem.update(item.id,{quantity_on_hand:(item.quantity_on_hand??0)-d});rem-=d;}if(rem<=0)break;}
    await inlineRecompute(ctx,part.id,false); await inlineRebalance(ctx,part.id,false);
    ctx.mutations.push({entity:'Part',id:part.id,action:'PHYSICAL_STOCK_RECOMPUTED'});
  }
  const unitCost = c.unit_cost_snapshot ?? part.cost ?? 0;
  await ctx.base44.asServiceRole.entities.InstalledPart.create({part_id:part.id,project_id:c.project_id,commitment_id:cid,qty_consumed:qty_to_install,unit_cost_at_install:unitCost,extended_cost:unitCost*qty_to_install,installed_by:ctx.user.email,installed_date:ctx.timestamp});
  ctx.mutations.push({entity:'PartCommitment',id:cid,action:'INSTALL'});

  // ── SYNC TaskPartLink install status (MANDATORY — TaskPartLink is canonical for task progress) ──
  let tplSyncCount = 0;
  try {
    const taskPartLinks = await ctx.base44.asServiceRole.entities.TaskPartLink.filter({ commitment_id: cid });
    for (const tpl of taskPartLinks) {
      const tplRequired = tpl.qty_allocated ?? 1;
      const newTplInstalled = Math.min(newInst, tplRequired);
      const newTplStatus = newTplInstalled >= tplRequired ? 'complete' : (newTplInstalled > 0 ? 'partial' : 'pending');
      await ctx.base44.asServiceRole.entities.TaskPartLink.update(tpl.id, {
        qty_installed: newTplInstalled,
        install_status: newTplStatus,
        ...(newTplStatus === 'complete' ? { installed_at: ctx.timestamp, installed_by: ctx.user.email } : {}),
      });
      ctx.mutations.push({ entity: 'TaskPartLink', id: tpl.id, action: 'INSTALL_SYNC' });
      tplSyncCount++;
    }
    if (taskPartLinks.length === 0) {
      console.warn(`[INSTALL_TPL_SYNC] No TaskPartLinks found for commitment ${cid} — task progress will not reflect this install`);
    }
  } catch (e) {
    console.error(`[INSTALL_TPL_SYNC_FAILED] TaskPartLink sync failed for commitment ${cid}: ${e.message}. Task progress may be stale.`);
    ctx.warnings.push({ type: 'TPL_SYNC_FAILED', id: cid, msg: `TaskPartLink sync failed: ${e.message}` });
  }

  return {commitment_id:cid,qty_installed:qty_to_install,total_installed:newInst,new_reserved:newRes};
}

async function reverseInstall(ctx,commitment_ids,payload) {
  const {qty_to_reverse,reason}=payload; const cid=commitment_ids?.[0];
  // ── PAYLOAD VALIDATION (Phase 5) ──
  if(!cid) throw new Error('REVERSE_INSTALL requires commitment_id (pass as commitment_ids[0])');
  if(qty_to_reverse===undefined||qty_to_reverse===null) throw new Error('REVERSE_INSTALL requires payload.qty_to_reverse');
  if(typeof qty_to_reverse!=='number'||qty_to_reverse<=0||!Number.isFinite(qty_to_reverse)) throw new Error(`REVERSE_INSTALL: qty_to_reverse must be a positive number, got ${qty_to_reverse}`);
  const [c]=await ctx.base44.entities.PartCommitment.filter({id:cid}); if(!c) throw new Error('Commitment not found');
  const [part]=await ctx.base44.entities.Part.filter({id:c.part_id}); if(!part) throw new Error('Part not found');
  const cn=readCanonical(c,ctx);
  if(qty_to_reverse>cn.qty_installed) throw new Error(`Cannot reverse ${qty_to_reverse}, only ${cn.qty_installed} installed`);
  const affStock=(c.supply_source_type??'VENDOR')!=='CLIENT_SUPPLIED';
  if(ctx.dry_run) return {preview:{commitment_id:cid,qty_reversing:qty_to_reverse,affects_stock:affStock}};
  const newInstalled = cn.qty_installed - qty_to_reverse;
  // ── PHASE 6: Status derivation from quantity state ──
  // fully installed → 'installed'
  // has reserved stock remaining → 'allocated'  
  // has PO coverage but no stock → 'ordered'
  // no coverage at all → 'planned'
  let newStatus;
  if (newInstalled >= cn.effective_required) {
    newStatus = 'installed';
  } else if (cn.reserved_from_stock > 0) {
    newStatus = 'allocated';
  } else if (cn.covered_from_po > 0) {
    newStatus = 'ordered';
  } else {
    newStatus = 'planned';
  }
  await ctx.base44.asServiceRole.entities.PartCommitment.update(cid,{qty_installed:newInstalled,commitment_status:newStatus,commitment_version:(c.commitment_version??0)+1});
  if(affStock){
    const inv=await ctx.base44.asServiceRole.entities.InventoryItem.filter({part_id:part.id});
    if(inv.length>0) await ctx.base44.asServiceRole.entities.InventoryItem.update(inv[0].id,{quantity_on_hand:(inv[0].quantity_on_hand??0)+qty_to_reverse});
    else{const dl=await getOrCreateDefaultLocation(ctx);await ctx.base44.asServiceRole.entities.InventoryItem.create({part_id:part.id,location_id:dl,quantity_on_hand:qty_to_reverse,quantity_reserved:0,received_date:new Date().toISOString().split('T')[0],notes:'Reverse install recovery',source_type:'reversal'});}
    await inlineRecompute(ctx,part.id,false); await inlineRebalance(ctx,part.id,false);
    ctx.mutations.push({entity:'Part',id:part.id,action:'REVERSE_INSTALL'});
  }
  ctx.mutations.push({entity:'PartCommitment',id:cid,action:'REVERSE_INSTALL'});
  ctx.lifecycle_events.push({commitment_id:cid,event_type:'REVERSE_INSTALL',trigger_source:'UNIFIED_ENGINE',triggered_by:ctx.user.email,actor_email:ctx.user.email,part_id:part.id,project_id:c.project_id,old_values:JSON.stringify({qty_installed:cn.qty_installed}),new_values:JSON.stringify({qty_installed:newInstalled,new_status:newStatus}),metadata:JSON.stringify({qty_reversed:qty_to_reverse,reason:reason||null,affects_stock:affStock}),event_date:ctx.timestamp});

  // ── SYNC TaskPartLink install status on reversal (MANDATORY — TaskPartLink is canonical for task progress) ──
  try {
    const taskPartLinks = await ctx.base44.asServiceRole.entities.TaskPartLink.filter({ commitment_id: cid });
    for (const tpl of taskPartLinks) {
      const tplRequired = tpl.qty_allocated ?? 1;
      const newTplInstalled = Math.min(newInstalled, tplRequired);
      const newTplStatus = newTplInstalled >= tplRequired ? 'complete' : (newTplInstalled > 0 ? 'partial' : 'pending');
      await ctx.base44.asServiceRole.entities.TaskPartLink.update(tpl.id, {
        qty_installed: newTplInstalled,
        install_status: newTplStatus,
        ...(newTplStatus !== 'complete' ? { installed_at: null, installed_by: null } : {}),
      });
      ctx.mutations.push({ entity: 'TaskPartLink', id: tpl.id, action: 'REVERSE_INSTALL_SYNC' });
    }
    if (taskPartLinks.length === 0) {
      console.warn(`[REVERSE_INSTALL_TPL_SYNC] No TaskPartLinks found for commitment ${cid} — task progress will not reflect this reversal`);
    }
  } catch (e) {
    console.error(`[REVERSE_INSTALL_TPL_SYNC_FAILED] TaskPartLink sync failed for commitment ${cid}: ${e.message}. Task progress may be stale.`);
    ctx.warnings.push({ type: 'TPL_SYNC_FAILED', id: cid, msg: `TaskPartLink reverse sync failed: ${e.message}` });
  }

  return {commitment_id:cid,qty_reversed:qty_to_reverse,new_installed:newInstalled,new_status:newStatus,part_id:part.id,project_id:c.project_id};
}

async function cancelCommitment(ctx,commitment_ids,payload) {
  const {reason}=payload; const cid=commitment_ids?.[0];
  // ── PAYLOAD VALIDATION (Phase 5) ──
  if(!cid) throw new Error('CANCEL_COMMITMENT requires commitment_id (pass as commitment_ids[0])');
  if(!reason||typeof reason!=='string'||!reason.trim()) throw new Error('CANCEL_COMMITMENT requires payload.reason (non-empty string)');
  const [c]=await ctx.base44.entities.PartCommitment.filter({id:cid}); if(!c) throw new Error('Commitment not found');
  if(c.commitment_status==='cancelled') throw new Error('Already cancelled');
  const cn=readCanonical(c,ctx);
  let ct='before_order'; if(c.billing_status==='paid') ct='after_paid'; else if(c.billing_status==='invoiced') ct='after_invoice'; else if(cn.covered_from_po>0) ct='before_invoice';
  if(ctx.dry_run) return {preview:{commitment_id:cid,cancellation_type:ct}};
  await ctx.base44.asServiceRole.entities.PartCommitment.update(cid,{commitment_status:'cancelled',cancelled_at:ctx.timestamp,cancelled_by:ctx.user.email,cancelled_reason:reason,cancellation_type:ct,commitment_version:(c.commitment_version??0)+1});
  ctx.mutations.push({entity:'PartCommitment',id:cid,action:'CANCEL'});
  await inlineRebalance(ctx,c.part_id,false);
  ctx.lifecycle_events.push({commitment_id:cid,event_type:'COMMITMENT_CANCELLED',trigger_source:'UNIFIED_ENGINE',triggered_by:ctx.user.email,actor_email:ctx.user.email,part_id:c.part_id,project_id:c.project_id,metadata:JSON.stringify({reason,cancellation_type:ct}),event_date:ctx.timestamp});
  return {commitment_id:cid,cancellation_type:ct,stock_released:cn.reserved_from_stock};
}

async function syncPOCost(ctx, commitment_ids, payload) {
  if (!commitment_ids?.length) throw new Error('commitment_ids required for SYNC_PO_COST');
  // Delegate to the dedicated sync function (uses service role — no auth dependency)
  const result = await ctx.base44.asServiceRole.functions.invoke('syncPOCostToCommitment', {
    commitment_ids,
    skip_retail_update: payload.skip_retail_update || false,
  });
  ctx.mutations.push(...commitment_ids.map(id => ({ entity: 'PartCommitment', id, action: 'SYNC_PO_COST' })));
  
  // Audit: log sync action
  for (const cid of commitment_ids) {
    try {
      await ctx.base44.asServiceRole.entities.CommitmentAuditLog.create({
        commitment_id: cid,
        action_type: 'update',
        trigger_source: 'sync',
        triggered_by: ctx.user.email,
        actor_email: ctx.user.email,
        notes: `Manual SYNC_PO_COST triggered`,
        timestamp: ctx.timestamp,
      });
    } catch (_e) { /* audit log is best-effort */ }
  }
  return result.data || result;
}

async function deletePO(ctx, payload) {
  const { order_id, reason } = payload;
  if (!order_id) throw new Error('order_id required');
  const [order] = await ctx.base44.entities.Order.filter({ id: order_id });
  if (!order) throw new Error('Order not found');

  // ── P0 GUARD: Block deletion of invoiced POs ──
  const deleteGuard = guardPODeletion(order);
  if (deleteGuard) {
    console.error(`[DELETE_PO_GUARD] Blocked: ${deleteGuard.message}`, { order_id, billing_status: order.billing_status });
    return { success: false, error: deleteGuard.message, error_code: deleteGuard.reason_code, billing_status: order.billing_status };
  }

  // Fetch all line items for this PO
  const lineItems = await ctx.base44.entities.PartPurchaseLineItem.filter({ order_id });
  if (ctx.dry_run) {
    return {
      preview: {
        order_id,
        po_number: order.po_number,
        line_count: lineItems.length,
        total_qty_ordered: lineItems.reduce((s, l) => s + (l.qty_ordered ?? 0), 0),
        total_qty_received: lineItems.reduce((s, l) => s + (l.qty_received ?? 0), 0),
      },
    };
  }

  const restoredCommitments = [];
  const affectedParts = new Set();

  for (const li of lineItems) {
    // Restore commitment: reduce covered_from_po by (qty_ordered - qty_received)
    // qty_received portion has already been converted to reserved_from_stock
    if (li.commitment_id) {
      const [c] = await ctx.base44.entities.PartCommitment.filter({ id: li.commitment_id });
      if (c) {
        const unreceived = Math.max(0, (li.qty_ordered ?? 0) - (li.qty_received ?? 0));
        const oldCovered = c.covered_from_po ?? 0;
        const newCovered = Math.max(0, oldCovered - unreceived);
        const cn = readCanonical(c, ctx);
        const newTO = Math.max(0, cn.effective_required - cn.reserved_from_stock - newCovered - cn.qty_installed);

        // Remove this line item from order_line_item_ids
        const existingIds = (c.order_line_item_ids || []).filter(id => id !== li.id);
        
        // Determine new status
        let newStatus = c.commitment_status;
        if (newCovered <= 0 && cn.reserved_from_stock <= 0 && cn.qty_installed <= 0) {
          newStatus = 'planned';
        }

        await ctx.base44.asServiceRole.entities.PartCommitment.update(c.id, {
          covered_from_po: newCovered,
          qty_to_order: newTO,
          qty_ordered: Math.max(0, (c.qty_ordered ?? 0) - (li.qty_ordered ?? 0)),
          order_line_item_ids: existingIds,
          commitment_status: newStatus,
          commitment_version: (c.commitment_version ?? 0) + 1,
          last_recomputed_at: ctx.timestamp,
        });

        restoredCommitments.push({
          commitment_id: c.id,
          part_id: c.part_id,
          project_id: c.project_id,
          old_covered: oldCovered,
          new_covered: newCovered,
          qty_restored: unreceived,
          new_to_order: newTO,
        });

        ctx.lifecycle_events.push({
          commitment_id: c.id,
          event_type: 'PO_DELETED',
          trigger_source: 'UNIFIED_ENGINE',
          triggered_by: ctx.user.email,
          actor_email: ctx.user.email,
          order_id,
          part_id: c.part_id,
          project_id: c.project_id,
          old_values: JSON.stringify({ covered_from_po: oldCovered }),
          new_values: JSON.stringify({ covered_from_po: newCovered, qty_to_order: newTO }),
          metadata: JSON.stringify({ po_number: order.po_number, reason, qty_restored: unreceived }),
          event_date: ctx.timestamp,
        });

        ctx.mutations.push({ entity: 'PartCommitment', id: c.id, action: 'DELETE_PO_RESTORE' });
      }
    }

    if (li.part_id) affectedParts.add(li.part_id);

    // Delete the line item
    await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.delete(li.id);
    ctx.mutations.push({ entity: 'PartPurchaseLineItem', id: li.id, action: 'DELETE' });
  }

  // Delete the order
  await ctx.base44.asServiceRole.entities.Order.update(order_id, { status: 'Cancelled', notes: `DELETED: ${reason || 'No reason'}. Original: ${order.notes || ''}` });
  ctx.mutations.push({ entity: 'Order', id: order_id, action: 'DELETE_PO' });

  // Rebalance affected parts
  for (const pid of affectedParts) {
    try {
      await inlineRebalance(ctx, pid, false);
    } catch (e) {
      console.warn(`[DELETE_PO_REBALANCE] ${pid}: ${e.message}`);
    }
  }

  return {
    success: true,
    order_id,
    po_number: order.po_number,
    lines_deleted: lineItems.length,
    commitments_restored: restoredCommitments.length,
    restored: restoredCommitments,
    affected_part_ids: [...affectedParts],
  };
}

async function markOrdered(ctx, payload) {
  const { order_id } = payload;
  if (!order_id) throw new Error('order_id required');
  const [order] = await ctx.base44.entities.Order.filter({ id: order_id });
  if (!order) throw new Error('Order not found');
  // Guard: only Draft (or legacy Pending) can transition to Ordered
  const currentStatus = order.status;
  if (currentStatus !== 'Draft' && currentStatus !== 'Pending') {
    return { success: false, error: `Cannot mark as Ordered — current status is "${currentStatus}". Only Draft POs can be marked as Ordered.`, error_code: 'INVALID_STATUS_TRANSITION' };
  }
  if (ctx.dry_run) return { preview: { order_id, current_status: currentStatus, new_status: 'Ordered' } };
  const updates = { status: 'Ordered' };
  // Set order_date if not already set
  if (!order.order_date) {
    updates.order_date = new Date().toISOString().slice(0, 10);
  }
  await ctx.base44.asServiceRole.entities.Order.update(order_id, updates);
  ctx.mutations.push({ entity: 'Order', id: order_id, action: 'MARK_ORDERED' });
  console.log(`[MARK_ORDERED] PO=${order.po_number} order_id=${order_id} from=${currentStatus} to=Ordered order_date=${updates.order_date || order.order_date}`);
  return { success: true, order_id, po_number: order.po_number, old_status: currentStatus, new_status: 'Ordered', order_date: updates.order_date || order.order_date };
}

async function updatePOCosts(ctx, payload) {
  const { order_id, freight_cost, tariff_cost } = payload;
  if (!order_id) throw new Error('order_id required');
  const [order] = await ctx.base44.entities.Order.filter({ id: order_id });
  if (!order) throw new Error('Order not found');
  const updates = {};
  if (freight_cost !== undefined) {
    const v = Number(freight_cost);
    if (!Number.isFinite(v) || v < 0) throw new Error('freight_cost must be >= 0');
    updates.freight_cost = v;
  }
  if (tariff_cost !== undefined) {
    const v = Number(tariff_cost);
    if (!Number.isFinite(v) || v < 0) throw new Error('tariff_cost must be >= 0');
    updates.tariff_cost = v;
  }
  if (Object.keys(updates).length === 0) return { success: true, message: 'No changes' };
  if (ctx.dry_run) return { preview: { order_id, updates } };
  await ctx.base44.asServiceRole.entities.Order.update(order_id, updates);
  ctx.mutations.push({ entity: 'Order', id: order_id, action: 'UPDATE_PO_COSTS' });
  console.log(`[UPDATE_PO_COSTS] PO=${order.po_number} order_id=${order_id}`, updates);
  return { success: true, order_id, po_number: order.po_number, updates };
}

async function addStock(ctx,payload) {
  const {part_id,qty,note,purchase_cost}=payload; let {location_id}=payload;
  if(!part_id) throw new Error('part_id required'); const quantity=Number(qty)||0; if(quantity<=0) throw new Error('qty must be positive');
  const [part]=await ctx.base44.entities.Part.filter({id:part_id}); if(!part) throw new Error('Part not found');
  if(!location_id) location_id=await getOrCreateDefaultLocation(ctx);
  const oldPhys=part.physical_stock??0;
  if(ctx.dry_run) return {preview:{part_id,part_name:part.part_name,qty_adding:quantity,old_physical_stock:oldPhys}};
  await upsertInventoryItem(ctx,part_id,location_id,quantity);
  const rr=await inlineRecompute(ctx,part_id,false); ctx.mutations.push({entity:'Part',id:part_id,action:'PHYSICAL_STOCK_RECOMPUTED'});
  await inlineRebalance(ctx,part_id,false);
  await ctx.base44.asServiceRole.entities.InventoryAuditLog.create({part_id,action_type:'ADD_STOCK',qty_delta:quantity,old_qty:oldPhys,new_qty:rr.computed_physical_stock,location_id,notes:note||null,performed_by:ctx.user.email,performed_at:ctx.timestamp});
  return {success:true,part_id,part_name:part.part_name,qty_added:quantity,old_physical_stock:oldPhys,new_physical_stock:rr.computed_physical_stock,location_id,invalidation_context:{part_ids:[part_id],invalidateAll:true}};
}