import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * PHASE 1 CANONICAL ALIGNMENT — Commitment Quantity Mutation Engine
 * All logic reads canonical: required_total, reserved_from_stock, covered_from_po, qty_installed
 * Deprecated fields written for compat only.
 */

const ACTIONS = { INCREASE_QTY:'INCREASE_QTY', DECREASE_QTY:'DECREASE_QTY', REALLOCATE_TO_PROJECT:'REALLOCATE_TO_PROJECT', CANCEL_UNORDERED_QTY:'CANCEL_UNORDERED_QTY', SPLIT_COMMITMENT:'SPLIT_COMMITMENT', MERGE_COMMITMENTS:'MERGE_COMMITMENTS' };

function checkSupplyInvariant(cid, required, reserved, covered, source) {
  const total = reserved + covered;
  if (total > required + 0.001) {
    const msg = `SUPPLY_INVARIANT_VIOLATION [${source}]: commitment=${cid} reserved(${reserved})+covered_po(${covered})=${total} > required(${required})`;
    console.error(msg);
    return { violated: true, overallocation: total - required, corrected_reserved: Math.max(0, required - covered) };
  }
  return { violated: false };
}

function readCn(c) {
  const r={required_total:c.required_total??0,reserved_from_stock:c.reserved_from_stock??0,covered_from_po:c.covered_from_po??0,qty_installed:c.qty_installed??0};
  // Check invariant on read
  checkSupplyInvariant(c.id, r.required_total, r.reserved_from_stock, r.covered_from_po, 'readCn');
  r.gap=Math.max(0,r.required_total-r.reserved_from_stock-r.covered_from_po);
  return r;
}
function detectMM(c) { const cn=readCn(c),mm=[]; if(c.qty_committed!==undefined&&c.qty_committed!==cn.required_total) mm.push(`qty_committed(${c.qty_committed})!=required_total(${cn.required_total})`); if(c.qty_reserved!==undefined&&c.qty_reserved!==cn.reserved_from_stock) mm.push(`qty_reserved(${c.qty_reserved})!=reserved_from_stock(${cn.reserved_from_stock})`); if(mm.length) console.warn(`[PHASE1_MM] ${c.id}: ${mm.join(', ')}`); }
function covSt(req,res,cov) { const t=res+cov; if(t>=req&&req>0) return 'FULLY_COVERED'; if(t>0) return 'PARTIALLY_COVERED'; return 'NOT_COVERED'; }

async function relReservations(base44,cid,qty,uid,reason) {
  const rs=await base44.asServiceRole.entities.InventoryReservation.filter({commitment_id:cid,status:'active'});
  let rem=qty; const out=[]; rs.sort((a,b)=>new Date(b.created_date)-new Date(a.created_date));
  for(const r of rs){if(rem<=0)break;const d=Math.min(rem,r.qty_reserved||0);if(d<=0)continue;if(d>=r.qty_reserved)await base44.asServiceRole.entities.InventoryReservation.update(r.id,{status:'released',released_at:new Date().toISOString(),released_by:uid,release_reason:reason});else await base44.asServiceRole.entities.InventoryReservation.update(r.id,{qty_reserved:r.qty_reserved-d});out.push({reservation_id:r.id,qty_released:d});rem-=d;}
  return {released:out,totalReleased:qty-rem};
}

async function mkEvent(base44,c,type,old,nw,uid,reason) {
  try{await base44.asServiceRole.entities.LifecycleEvent.create({commitment_id:c.id,project_id:c.project_id,part_id:c.part_id,event_type:type,old_values:JSON.stringify(old),new_values:JSON.stringify(nw),triggered_by:uid,trigger_source:'QTY_MUTATION',reason:reason||'',event_date:new Date().toISOString()});}catch(e){console.error('LifecycleEvent fail:',e);}
}

// ── ACTIONS ──

async function doIncrease(base44,c,part,delta,reason,uid,dry) {
  detectMM(c);
  if(dry) return {dry_run:true,success:true,commitment_id:c.id,delta,action:'WILL_CREATE_SCOPE_ADDITION',model:'DELTA_COMMITMENT'};
  const [p]=await base44.asServiceRole.entities.Part.filter({id:c.part_id}); if(!p) throw new Error('Part not found');
  const ucs=p.cost||0, pm=p.pricing_mode||'matrix', urs=pm==='manual'?(p.retail_override||0):(p.retail_matrix_price||0);
  const nc=await base44.asServiceRole.entities.PartCommitment.create({
    project_id:c.project_id,part_id:c.part_id,required_total:delta,reserved_from_stock:0,covered_from_po:0,qty_installed:0,
    invoiced_qty:0,invoiced_amount:0,billing_status:'unbilled',commitment_status:'planned',coverage_status:'NOT_COVERED',
    source_type:'scope_addition',parent_commitment_id:c.id,allocation_source:'manual_commitment',
    unit_cost_snapshot:ucs,unit_retail_snapshot:urs,planned_cost_total:ucs*delta,planned_retail_total:urs*delta,
    qty_committed:delta,qty_to_order:delta,qty_ordered:0,qty_received:0,qty_reserved:0,qty_allocated:0,qty_cancelled:0,
    supply_source_type:'VENDOR',order_line_item_ids:[],commitment_version:1,state_version:0,last_recomputed_at:new Date().toISOString(),
    pricing_integrity_status:ucs>0&&urs>0?'ok':'estimated_cost',requires_prepay:false
  });
  await mkEvent(base44,c,'SCOPE_ADDITION_CREATED',{required_total:readCn(c).required_total},{new_commitment_id:nc.id,delta_qty:delta},uid,reason||`Scope +${delta}`);
  return {success:true,action:'SCOPE_ADDITION_CREATED',parent_commitment_id:c.id,new_commitment_id:nc.id,delta_qty:delta,new_commitment:nc,model:'DELTA_COMMITMENT',warnings:[]};
}

async function doDecrease(base44,c,part,delta,reason,uid,dry) {
  detectMM(c); const cn=readCn(c), tgt=cn.required_total-delta;
  if((c.invoiced_qty||0)>0) return {success:false,error:`Cannot reduce: ${c.invoiced_qty} invoiced`,code:'LIFECYCLE_PROGRESS_INVOICED'};
  if(cn.qty_installed>0) return {success:false,error:`Cannot reduce: ${cn.qty_installed} installed`,code:'LIFECYCLE_PROGRESS_INSTALLED'};
  if(cn.covered_from_po>0) return {success:false,error:`Cannot reduce: ${cn.covered_from_po} covered by PO`,code:'LIFECYCLE_PROGRESS_PO'};
  if(cn.reserved_from_stock>0) return {success:false,error:`Cannot reduce: ${cn.reserved_from_stock} reserved`,code:'LIFECYCLE_PROGRESS_RESERVED'};
  if(tgt<0) return {success:false,error:'Cannot reduce below zero'};
  if(dry) return {dry_run:true,success:true,commitment_id:c.id,current_qty:cn.required_total,target_qty:tgt,delta};
  const newGap=Math.max(0,tgt-cn.reserved_from_stock-cn.covered_from_po);
  const uc=c.unit_cost_snapshot||part?.cost||0, ur=c.unit_retail_snapshot||part?.retail_override||part?.retail_matrix_price||0;
  await base44.asServiceRole.entities.PartCommitment.update(c.id,{required_total:tgt,qty_committed:tgt,qty_to_order:newGap,planned_cost_total:tgt*uc,planned_retail_total:tgt*ur,coverage_status:covSt(tgt,cn.reserved_from_stock,cn.covered_from_po)});
  await mkEvent(base44,c,'QTY_DECREASED',{required_total:cn.required_total},{required_total:tgt,delta:-delta},uid,reason);
  return {success:true,commitment_id:c.id,qty_needed_new:tgt,warnings:[]};
}

async function doReallocate(base44,c,part,qty,tgtProjId,reason,uid,dry) {
  const [tp]=await base44.asServiceRole.entities.Project.filter({id:tgtProjId}); if(!tp) return {success:false,error:'Target project not found'};
  detectMM(c); const cn=readCn(c), maxMov=Math.max(0,cn.required_total-cn.qty_installed);
  if(qty>maxMov) return {success:false,error:`Cannot move >${maxMov}`};
  if(dry) return {dry_run:true,success:true,commitment_id:c.id,qty_to_move:qty,target_project_id:tgtProjId,target_project_name:tp.name,remaining_qty:cn.required_total-qty};
  const remQty=cn.required_total-qty, uc=c.unit_cost_snapshot||0, ur=c.unit_retail_snapshot||0;
  const nc=await base44.asServiceRole.entities.PartCommitment.create({project_id:tgtProjId,part_id:c.part_id,required_total:qty,reserved_from_stock:0,covered_from_po:0,qty_installed:0,qty_committed:qty,qty_reserved:0,qty_to_order:qty,qty_ordered:0,qty_received:0,qty_cancelled:0,commitment_status:'planned',source_type:'split_commitment',parent_commitment_id:c.id,unit_cost_snapshot:uc,unit_retail_snapshot:ur,planned_cost_total:qty*uc,planned_retail_total:qty*ur,coverage_status:'NOT_COVERED',notes:`Reallocated from ${c.id}`});
  const relRes=Math.min(cn.reserved_from_stock,qty); if(relRes>0) await relReservations(base44,c.id,relRes,uid,`Reallocated to ${tgtProjId}`);
  const newRes=Math.max(0,cn.reserved_from_stock-relRes), newGap=Math.max(0,remQty-newRes-cn.covered_from_po);
  await base44.asServiceRole.entities.PartCommitment.update(c.id,{required_total:remQty,reserved_from_stock:newRes,qty_committed:remQty,qty_reserved:newRes,qty_to_order:newGap,planned_cost_total:remQty*uc,planned_retail_total:remQty*ur,coverage_status:covSt(remQty,newRes,cn.covered_from_po)});
  await mkEvent(base44,c,'REALLOCATED',{required_total:cn.required_total},{required_total:remQty,moved_qty:qty,target_project_id:tgtProjId,new_commitment_id:nc.id},uid,reason);
  return {success:true,message:`Moved ${qty} units`,commitment_id:c.id,new_commitment_id:nc.id,qty_needed_new:remQty,warnings:[]};
}

async function doCancelUnordered(base44,c,part,qty,reason,uid,dry) {
  detectMM(c); const cn=readCn(c), unord=Math.max(0,cn.required_total-cn.covered_from_po);
  if(qty>unord) return {success:false,error:`Can only cancel unordered (${unord})`};
  if(dry) return {dry_run:true,success:true,commitment_id:c.id,qty_to_cancel:qty,unordered_qty:unord};
  const newQty=cn.required_total-qty, newCanc=(c.qty_cancelled||0)+qty;
  const rfGap=Math.min(qty,cn.gap), rfRes=qty-rfGap;
  if(rfRes>0) await relReservations(base44,c.id,rfRes,uid,`Cancelled: ${reason}`);
  const newRes=Math.max(0,cn.reserved_from_stock-rfRes), newGap=Math.max(0,newQty-newRes-cn.covered_from_po);
  const uc=c.unit_cost_snapshot||0, ur=c.unit_retail_snapshot||0;
  await base44.asServiceRole.entities.PartCommitment.update(c.id,{required_total:newQty,reserved_from_stock:newRes,qty_committed:newQty,qty_cancelled:newCanc,qty_reserved:newRes,qty_to_order:newGap,planned_cost_total:newQty*uc,planned_retail_total:newQty*ur,coverage_status:covSt(newQty,newRes,cn.covered_from_po)});
  await mkEvent(base44,c,'QTY_CANCELLED',{required_total:cn.required_total},{required_total:newQty,qty_cancelled:newCanc},uid,reason);
  return {success:true,commitment_id:c.id,qty_needed_new:newQty,cancelled_qty:newCanc,warnings:[]};
}

async function doSplit(base44,c,part,qty,reason,uid,dry) {
  detectMM(c); const cn=readCn(c);
  if(qty>=cn.required_total) return {success:false,error:'Split must be less than total'};
  if(dry) return {dry_run:true,success:true,commitment_id:c.id,qty_to_split:qty,remaining_qty:cn.required_total-qty};
  const remQty=cn.required_total-qty, uc=c.unit_cost_snapshot||0, ur=c.unit_retail_snapshot||0;
  const nc=await base44.asServiceRole.entities.PartCommitment.create({project_id:c.project_id,part_id:c.part_id,required_total:qty,reserved_from_stock:0,covered_from_po:0,qty_installed:0,qty_committed:qty,qty_reserved:0,qty_to_order:qty,qty_ordered:0,qty_received:0,qty_cancelled:0,commitment_status:'planned',source_type:'split_commitment',parent_commitment_id:c.id,unit_cost_snapshot:uc,unit_retail_snapshot:ur,planned_cost_total:qty*uc,planned_retail_total:qty*ur,coverage_status:'NOT_COVERED',notes:`Split from ${c.id}`});
  const splitRes=cn.required_total>0?Math.min(cn.reserved_from_stock,Math.round(qty*(cn.reserved_from_stock/cn.required_total))):0;
  if(splitRes>0) await relReservations(base44,c.id,splitRes,uid,`Split: ${reason}`);
  const newRes=Math.max(0,cn.reserved_from_stock-splitRes), newGap=Math.max(0,remQty-newRes-cn.covered_from_po);
  await base44.asServiceRole.entities.PartCommitment.update(c.id,{required_total:remQty,reserved_from_stock:newRes,qty_committed:remQty,qty_reserved:newRes,qty_to_order:newGap,planned_cost_total:remQty*uc,planned_retail_total:remQty*ur,coverage_status:covSt(remQty,newRes,cn.covered_from_po)});
  await mkEvent(base44,c,'COMMITMENT_SPLIT',{required_total:cn.required_total},{required_total:remQty,split_qty:qty,new_commitment_id:nc.id},uid,reason);
  return {success:true,message:`Split ${qty} units`,commitment_id:c.id,new_commitment_id:nc.id,qty_needed_new:remQty,warnings:[]};
}

// ── MAIN ──

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me(); if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { commitment_id, action_type, qty_delta=0, new_qty_needed, target_project_id, reason, dry_run=false } = await req.json();
    if (!commitment_id) return Response.json({ error: 'commitment_id required' }, { status: 400 });
    if (!action_type || !Object.values(ACTIONS).includes(action_type)) return Response.json({ error: 'Invalid action_type' }, { status: 400 });
    const [c] = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id }); if (!c) return Response.json({ error: 'Not found' }, { status: 404 });
    const [part] = await base44.asServiceRole.entities.Part.filter({ id: c.part_id });
    if (c.commitment_status === 'closed') return Response.json({ error: 'Closed' }, { status: 400 });
    if (c.commitment_status === 'cancelled') return Response.json({ error: 'Cancelled' }, { status: 400 });
    if (part?.is_archived) return Response.json({ error: 'Part archived' }, { status: 400 });

    let delta = qty_delta;
    if (new_qty_needed !== undefined && action_type === 'INCREASE_QTY') { delta = new_qty_needed - (c.required_total ?? 0); if (delta <= 0) return Response.json({ error: 'new_qty_needed must exceed current' }, { status: 400 }); }

    let result;
    switch (action_type) {
      case 'INCREASE_QTY': if(delta<=0) return Response.json({error:'qty_delta must be positive'},{status:400}); result=await doIncrease(base44,c,part,delta,reason,user.email,dry_run); break;
      case 'DECREASE_QTY': if(delta<=0) return Response.json({error:'qty_delta must be positive'},{status:400}); result=await doDecrease(base44,c,part,delta,reason,user.email,dry_run); break;
      case 'REALLOCATE_TO_PROJECT': if(!target_project_id) return Response.json({error:'target_project_id required'},{status:400}); if(delta<=0) return Response.json({error:'qty_delta must be positive'},{status:400}); result=await doReallocate(base44,c,part,delta,target_project_id,reason,user.email,dry_run); break;
      case 'CANCEL_UNORDERED_QTY': if(delta<=0) return Response.json({error:'qty_delta must be positive'},{status:400}); result=await doCancelUnordered(base44,c,part,delta,reason,user.email,dry_run); break;
      case 'SPLIT_COMMITMENT': if(delta<=0) return Response.json({error:'qty_delta must be positive'},{status:400}); result=await doSplit(base44,c,part,delta,reason,user.email,dry_run); break;
      case 'MERGE_COMMITMENTS': return Response.json({ error: 'Not implemented' }, { status: 501 });
    }

    if (result.success && !dry_run) {
      const [uc] = await base44.asServiceRole.entities.PartCommitment.filter({ id: commitment_id });
      if (uc) {
        const cn=readCn(uc);
        // Post-mutation invariant enforcement
        const inv = checkSupplyInvariant(uc.id, cn.required_total, cn.reserved_from_stock, cn.covered_from_po, `mutateQty:${action_type}`);
        if (inv.violated) {
          console.error(`[MUTATE_QTY_INVARIANT] Auto-correcting commitment ${uc.id}: reserved ${cn.reserved_from_stock} -> ${inv.corrected_reserved}`);
          await base44.asServiceRole.entities.PartCommitment.update(uc.id, {
            reserved_from_stock: inv.corrected_reserved,
            qty_reserved: inv.corrected_reserved,
            integrity_warning: true,
            integrity_warning_details: `INVARIANT_CORRECTED after ${action_type}: reserved reduced from ${cn.reserved_from_stock} to ${inv.corrected_reserved}`,
          });
          cn.reserved_from_stock = inv.corrected_reserved;
        }
        return Response.json({ok:true,...result,action_type,invariant_corrected:inv.violated,commitment:{id:uc.id,required_total:cn.required_total,reserved_from_stock:cn.reserved_from_stock,covered_from_po:cn.covered_from_po,qty_installed:cn.qty_installed,qty_committed:uc.qty_committed,qty_to_order:uc.qty_to_order,coverage_status:uc.coverage_status}});
      }
    }
    return Response.json({ ok: result.success, ...result, action_type });
  } catch (error) {
    console.error('mutatePartCommitmentQuantity error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});