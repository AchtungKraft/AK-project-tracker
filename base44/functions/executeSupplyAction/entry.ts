import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * executeSupplyAction - Unified Supply Dispatcher
 * PHASE 1 CANONICAL ALIGNMENT:
 * - All logic uses canonical: required_total, reserved_from_stock, covered_from_po, qty_installed
 * - Deprecated fields written for compat ONLY, marked DEPRECATED_COMPAT
 * - Mismatch warnings logged
 */

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

function checkSupplyInvariant(commitmentId, required, reserved, covered, ctx, source) {
  const total = reserved + covered;
  if (total > required + 0.001) {
    const msg = `SUPPLY_INVARIANT_VIOLATION [${source}]: commitment=${commitmentId} reserved(${reserved})+covered_po(${covered})=${total} > required(${required})`;
    console.error(msg);
    if (ctx) ctx.warnings.push({ type: 'INVARIANT_VIOLATION', id: commitmentId, msg, source });
    return { violated: true, overallocation: total - required, corrected_reserved: Math.max(0, required - covered) };
  }
  return { violated: false };
}

function readCanonical(c, ctx) {
  const cn = { required_total: c.required_total ?? 0, reserved_from_stock: c.reserved_from_stock ?? 0, covered_from_po: c.covered_from_po ?? 0, qty_installed: c.qty_installed ?? 0 };
  if (ctx && c.qty_committed !== undefined && c.qty_committed !== cn.required_total)
    ctx.warnings.push({ type: 'MISMATCH', id: c.id, msg: `qty_committed(${c.qty_committed})!=required_total(${cn.required_total})` });
  if (ctx && c.qty_reserved !== undefined && c.qty_reserved !== cn.reserved_from_stock)
    ctx.warnings.push({ type: 'MISMATCH', id: c.id, msg: `qty_reserved(${c.qty_reserved})!=reserved_from_stock(${cn.reserved_from_stock})` });
  // Check invariant on read
  checkSupplyInvariant(c.id, cn.required_total, cn.reserved_from_stock, cn.covered_from_po, ctx, 'readCanonical');
  cn.gap = Math.max(0, cn.required_total - cn.reserved_from_stock - cn.covered_from_po);
  cn.coverage = cn.reserved_from_stock + cn.covered_from_po;
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
    const remReq = Math.max(0, cn.required_total - cn.qty_installed);
    const need = Math.max(0, remReq - cn.covered_from_po);
    let newRes = Math.min(rem, need);
    // INVARIANT ENFORCEMENT: ensure reserved + covered_from_po <= required_total
    const invCheck = checkSupplyInvariant(c.id, cn.required_total, newRes, cn.covered_from_po, ctx, 'inlineRebalance');
    if (invCheck.violated) {
      newRes = invCheck.corrected_reserved;
      console.warn(`[REBALANCE_INVARIANT_CORRECTED] c=${c.id}: reserved corrected from ${Math.min(rem, need)} to ${newRes}`);
    }
    const newTO = Math.max(0, remReq - newRes - cn.covered_from_po);
    rem = Math.max(0, rem - newRes);
    if (newRes !== cn.reserved_from_stock || newTO !== (c.qty_to_order ?? 0))
      ups.push({ commitment_id:c.id, project_id:c.project_id, required_total:cn.required_total, qty_installed:cn.qty_installed, covered_from_po:cn.covered_from_po, old_reserved:cn.reserved_from_stock, new_reserved:newRes, old_to_order:c.qty_to_order??0, new_to_order:newTO, delta_reserved:newRes-cn.reserved_from_stock });
    const sum = newRes + cn.covered_from_po + newTO;
    if (Math.abs(sum - remReq) > 0.001) throw new Error(`REBALANCE_INVARIANT: c=${c.id} sum=${sum} exp=${remReq}`);
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
  const {vendor_id,po_prefix='AK',vendor_order_data={}}=payload;
  if(!commitment_ids?.length) throw new Error('PO_COMMITMENT_REQUIRED');
  const commitments=await ctx.base44.entities.PartCommitment.filter({id:{$in:commitment_ids}});
  const vg=new Map(), blocked=[];
  for (const c of commitments) {
    const [p]=await ctx.base44.entities.Part.filter({id:c.part_id});
    if(!p){blocked.push({commitment_id:c.id,reason_code:'PART_NOT_FOUND'});continue;}
    const ev=vendor_id||p.default_vendor_id;
    if(!ev) throw new Error(`PO_VENDOR_REQUIRED: ${c.id} (${p.part_name})`);
    const cn=readCanonical(c,ctx);
    if(cn.gap<=0){blocked.push({commitment_id:c.id,reason_code:'NO_GAP',gap:0});continue;}
    if(!vg.has(ev)) vg.set(ev,[]);
    // FIX: Use || instead of ?? so that 0 falls through to Part.cost
    const resolvedCost = (c.unit_cost_snapshot && c.unit_cost_snapshot > 0) ? c.unit_cost_snapshot : (p.cost && p.cost > 0) ? p.cost : 0;
    const resolvedCostSource = (c.unit_cost_snapshot && c.unit_cost_snapshot > 0) ? 'commitment_snapshot' : (p.cost && p.cost > 0) ? 'part_cost_fallback' : 'missing';
    if (resolvedCost <= 0) {
      console.warn(`[CREATE_PO] PO line created with zero cost – check part pricing. commitment=${c.id} part=${p.id} (${p.part_name})`);
      // Audit: log zero-cost PO creation
      try {
        await ctx.base44.asServiceRole.entities.CommitmentAuditLog.create({
          commitment_id: c.id,
          action_type: 'create',
          trigger_source: 'manual',
          triggered_by: ctx.user.email,
          actor_email: ctx.user.email,
          notes: `ZERO_COST_PO_LINE: PO line created with $0 cost. Part: ${p.part_name}. Cost source: ${resolvedCostSource}`,
          timestamp: ctx.timestamp,
        });
      } catch (_e) { /* audit is best-effort */ }
    }
    vg.get(ev).push({commitment:c,part:p,qty:cn.gap,unit_cost:resolvedCost,cost_source:resolvedCostSource});
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
      const rq=Number(item.qty); if(!rq||rq<=0||!Number.isFinite(rq)) throw new Error(`CREATE_PO_INVALID_QTY: ${item.qty}`);
      const li=await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.create({order_id:order.id,part_id:item.part.id,commitment_id:item.commitment.id,vendor_id:vid,qty_ordered:rq,qty_received:0,unit_cost:item.unit_cost,unit_retail:item.commitment.unit_retail_snapshot??0,extended_cost:item.unit_cost*rq,cost_source_reference:item.cost_source||null,cost_requires_review:item.cost_source==='missing',status:'Ordered'});
      const curCov=item.commitment.covered_from_po??0, newCov=curCov+item.qty;
      const cn=readCanonical(item.commitment,ctx);
      const newTO=Math.max(0,cn.required_total-cn.reserved_from_stock-newCov);

      // Sync cost from PO line to commitment (inline for speed)
      const costSync = {};
      const oldCostSnap = item.commitment.unit_cost_snapshot ?? 0;
      if (!['invoiced', 'paid'].includes(item.commitment.billing_status) && item.unit_cost > 0 && Math.abs(item.unit_cost - oldCostSnap) > 0.001) {
        costSync.unit_cost_snapshot = item.unit_cost;
        costSync.planned_cost_total = item.unit_cost * cn.required_total;
        const curRetail = item.commitment.unit_retail_snapshot ?? 0;
        if (curRetail > 0 && curRetail >= item.unit_cost) costSync.pricing_integrity_status = 'ok';
        else if (curRetail > 0) costSync.pricing_integrity_status = 'margin_negative';
        else costSync.pricing_integrity_status = 'missing_retail';
      }

      await ctx.base44.asServiceRole.entities.PartCommitment.update(item.commitment.id,{covered_from_po:newCov,qty_ordered:(item.commitment.qty_ordered??0)+item.qty,qty_to_order:newTO,order_line_item_ids:[...(item.commitment.order_line_item_ids||[]),li.id],commitment_status:'ordered',commitment_version:(item.commitment.commitment_version??0)+1,...costSync});
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
    created.push({order_id:order.id,po_number:pn,vendor_id:vid,line_count:items.length,project_ids:[...new Set(items.map(i=>i.commitment.project_id).filter(Boolean))]});
  }
  return {created_orders:created,blocked};
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
  if(!li.commitment_id) ctx.warnings.push({type:'ORPHAN_PO_LINE',id:line_item_id,msg:`PO line ${line_item_id} no commitment_id`});
  const eloc=location_id||await getOrCreateDefaultLocation(ctx);
  if(ctx.dry_run) return {preview:{line_item_id,part_name:part.part_name,qty_receiving:qty_received}};
  const newLR=(li.qty_received??0)+qty_received;
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id,{qty_received:newLR,status:newLR>=(li.qty_ordered??0)?'Received':'Partial'});
  await upsertInventoryItem(ctx,part.id,eloc,qty_received);
  // PHASE 18: Convert covered_from_po → reserved_from_stock on receiving
  if(li.commitment_id){
    const [c]=await ctx.base44.entities.PartCommitment.filter({id:li.commitment_id});
    if(c){
      const oldCoveredPO = c.covered_from_po ?? 0;
      const oldReserved = c.reserved_from_stock ?? 0;
      const oldQtyReceived = c.qty_received ?? 0;
      if(oldCoveredPO < 0) ctx.warnings.push({type:'NEG_COVERED',id:c.id,msg:`covered_from_po=${oldCoveredPO}`});
      // Convert: move received qty from PO coverage to stock reservation
      const convertQty = Math.min(qty_received, oldCoveredPO);
      const newCoveredPO = Math.max(0, oldCoveredPO - convertQty);
      const newReserved = oldReserved + convertQty;
      // Enforce invariant: reserved + covered <= required_total
      const required = c.required_total ?? 0;
      const clampedReserved = Math.min(newReserved, Math.max(0, required - newCoveredPO));
      console.log(`[RECEIVE_CONVERT] commitment=${c.id} qty_received=${qty_received} covered_from_po: ${oldCoveredPO} → ${newCoveredPO}, reserved_from_stock: ${oldReserved} → ${clampedReserved}`);
      await ctx.base44.asServiceRole.entities.PartCommitment.update(li.commitment_id, {
        covered_from_po: newCoveredPO,
        reserved_from_stock: clampedReserved,
        qty_reserved: clampedReserved,
        qty_received: oldQtyReceived + qty_received,
        commitment_status: clampedReserved >= required && required > 0 ? 'allocated' : c.commitment_status,
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
        new_values: JSON.stringify({ covered_from_po: newCoveredPO, reserved_from_stock: clampedReserved, qty_received }),
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
  if(!li.commitment_id) ctx.warnings.push({type:'ORPHAN_PO_LINE',id:line_item_id,msg:`PO line ${line_item_id} no commitment_id`});
  const eloc=location_id||await getOrCreateDefaultLocation(ctx);
  if(ctx.dry_run) return {preview:{line_item_id,part_name:part.part_name,qty_receiving:qty_received,remaining_after:rem-qty_received}};
  const newLR=(li.qty_received??0)+qty_received, ls=newLR>=(li.qty_ordered??0)?'Received':'Partial';
  await ctx.base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id,{qty_received:newLR,status:ls});
  await upsertInventoryItem(ctx,part.id,eloc,qty_received);
  const rr=await inlineRecompute(ctx,part.id,false);
  // PHASE 18: Convert covered_from_po → reserved_from_stock on receiving
  if(li.commitment_id){
    const [c]=await ctx.base44.entities.PartCommitment.filter({id:li.commitment_id});
    if(c){
      const oldCoveredPO = c.covered_from_po ?? 0;
      const oldReserved = c.reserved_from_stock ?? 0;
      const oldQtyReceived = c.qty_received ?? 0;
      if(oldCoveredPO < 0) ctx.warnings.push({type:'NEG_COVERED',id:c.id,msg:`covered_from_po=${oldCoveredPO}`});
      // Convert: move received qty from PO coverage to stock reservation
      const convertQty = Math.min(qty_received, oldCoveredPO);
      const newCoveredPO = Math.max(0, oldCoveredPO - convertQty);
      const newReserved = oldReserved + convertQty;
      // Enforce invariant: reserved + covered <= required_total
      const required = c.required_total ?? 0;
      const clampedReserved = Math.min(newReserved, Math.max(0, required - newCoveredPO));
      console.log(`[RECEIVE_CONVERT] commitment=${c.id} qty_received=${qty_received} covered_from_po: ${oldCoveredPO} → ${newCoveredPO}, reserved_from_stock: ${oldReserved} → ${clampedReserved}`);
      await ctx.base44.asServiceRole.entities.PartCommitment.update(li.commitment_id, {
        covered_from_po: newCoveredPO,
        reserved_from_stock: clampedReserved,
        qty_reserved: clampedReserved,
        qty_received: oldQtyReceived + qty_received,
        commitment_status: clampedReserved >= required && required > 0 ? 'allocated' : c.commitment_status,
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
        new_values: JSON.stringify({ covered_from_po: newCoveredPO, reserved_from_stock: clampedReserved, qty_received }),
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
  if(!cid||qty_to_install===undefined) throw new Error('commitment_id and qty_to_install required');
  const [c]=await ctx.base44.entities.PartCommitment.filter({id:cid}); if(!c) throw new Error('Commitment not found');
  const [part]=await ctx.base44.entities.Part.filter({id:c.part_id}); if(!part) throw new Error('Part not found');
  const cn=readCanonical(c,ctx);
  const installable=Math.max(0,cn.reserved_from_stock-cn.qty_installed);
  const st=c.supply_source_type??'VENDOR', affStock=st!=='CLIENT_SUPPLIED';
  if(qty_to_install>installable&&affStock) throw new Error(`Cannot install ${qty_to_install}, only ${installable} installable`);
  if(affStock&&(part.physical_stock??0)<qty_to_install) throw new Error(`NEGATIVE_STOCK: ${qty_to_install}>${part.physical_stock??0}`);
  if(ctx.dry_run) return {preview:{commitment_id:cid,qty_installing:qty_to_install,installable,affects_stock:affStock}};

  const newInst=cn.qty_installed+qty_to_install, newRes=Math.max(0,cn.reserved_from_stock-qty_to_install);
  await ctx.base44.asServiceRole.entities.PartCommitment.update(cid,{qty_installed:newInst,reserved_from_stock:newRes,qty_reserved:newRes,commitment_status:newInst>=cn.required_total?'installed':c.commitment_status,commitment_version:(c.commitment_version??0)+1});

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
  return {commitment_id:cid,qty_installed:qty_to_install,total_installed:newInst,new_reserved:newRes};
}

async function reverseInstall(ctx,commitment_ids,payload) {
  const {qty_to_reverse,reason}=payload; const cid=commitment_ids?.[0];
  if(!cid||qty_to_reverse===undefined) throw new Error('commitment_id and qty_to_reverse required');
  const [c]=await ctx.base44.entities.PartCommitment.filter({id:cid}); if(!c) throw new Error('Commitment not found');
  const [part]=await ctx.base44.entities.Part.filter({id:c.part_id}); if(!part) throw new Error('Part not found');
  const cn=readCanonical(c,ctx);
  if(qty_to_reverse>cn.qty_installed) throw new Error(`Cannot reverse ${qty_to_reverse}, only ${cn.qty_installed} installed`);
  const affStock=(c.supply_source_type??'VENDOR')!=='CLIENT_SUPPLIED';
  if(ctx.dry_run) return {preview:{commitment_id:cid,qty_reversing:qty_to_reverse,affects_stock:affStock}};
  await ctx.base44.asServiceRole.entities.PartCommitment.update(cid,{qty_installed:cn.qty_installed-qty_to_reverse,commitment_status:'allocated',commitment_version:(c.commitment_version??0)+1});
  if(affStock){
    const inv=await ctx.base44.asServiceRole.entities.InventoryItem.filter({part_id:part.id});
    if(inv.length>0) await ctx.base44.asServiceRole.entities.InventoryItem.update(inv[0].id,{quantity_on_hand:(inv[0].quantity_on_hand??0)+qty_to_reverse});
    else{const dl=await getOrCreateDefaultLocation(ctx);await ctx.base44.asServiceRole.entities.InventoryItem.create({part_id:part.id,location_id:dl,quantity_on_hand:qty_to_reverse,quantity_reserved:0,received_date:new Date().toISOString().split('T')[0],notes:'Reverse install recovery',source_type:'reversal'});}
    await inlineRecompute(ctx,part.id,false); await inlineRebalance(ctx,part.id,false);
    ctx.mutations.push({entity:'Part',id:part.id,action:'REVERSE_INSTALL'});
  }
  ctx.mutations.push({entity:'PartCommitment',id:cid,action:'REVERSE_INSTALL'});
  return {commitment_id:cid,qty_reversed:qty_to_reverse,new_installed:cn.qty_installed-qty_to_reverse};
}

async function cancelCommitment(ctx,commitment_ids,payload) {
  const {reason}=payload; const cid=commitment_ids?.[0]; if(!cid) throw new Error('commitment_id required');
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