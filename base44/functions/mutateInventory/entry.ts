import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * CENTRALIZED INVENTORY MUTATION SERVICE
 * PHASE 1 CANONICAL ALIGNMENT:
 * - Removed calculateCommitmentState (resolver handles lifecycle)
 * - Commitment writes limited to qty_installed + commitment_version
 * - No commitment_status writes (resolver's responsibility)
 * - Part lookup uses scoped filter, not .list()
 */

const PART_TYPE_DEFAULTS = {
  PURCHASED_VENDOR:{affects_inventory:true},AK_MANUFACTURED:{affects_inventory:true},
  CLIENT_SUPPLIED:{affects_inventory:false},TAKE_OFF:{affects_inventory:true},
  STOCK_AK:{affects_inventory:true},WARRANTY_REPLACEMENT:{affects_inventory:true},
};

function getPartBehavior(pt) { return PART_TYPE_DEFAULTS[pt] || PART_TYPE_DEFAULTS.PURCHASED_VENDOR; }

function canMutatePart(part, mutation_type, opts={}) {
  if (part.is_archived) return { allowed:false, reason:'Part archived', code:'PART_ARCHIVED' };
  if (part.is_active===false) return { allowed:false, reason:'Part inactive', code:'PART_INACTIVE' };
  if (mutation_type==='receive' && part.part_type==='CLIENT_SUPPLIED' && opts.source_type==='vendor_order')
    return { allowed:false, reason:'Client-supplied cannot receive from vendor', code:'INVALID_SOURCE_FOR_PART_TYPE' };
  return { allowed:true, behavior:getPartBehavior(part.part_type) };
}

async function processMutation(base44, user, payload, startTime) {
  const { mutation_type, part_id, qty, from_location_id, to_location_id, task_part_link_id, project_id, commitment_id, inventory_item_id, order_id, line_item_id, reason, notes, unit_cost, lot_number, source_type, requires_inspection, idempotency_key, reversed_mutation_id } = payload;
  const now = new Date().toISOString();
  const mLog = { idempotency_key:idempotency_key||null, mutation_type, part_id, from_location_id:from_location_id||null, to_location_id:to_location_id||null, qty, project_id:project_id||null, commitment_id:commitment_id||null, task_part_link_id:task_part_link_id||null, user_id:user.id, result_status:'success', payload_snapshot:JSON.stringify(payload) };

  try {
    if (idempotency_key) {
      const [ex]=await base44.asServiceRole.entities.InventoryMutationLog.filter({idempotency_key});
      if (ex?.result_status==='success') return {success:true,idempotent_hit:true,original_mutation_id:ex.id,mutation_type:ex.mutation_type,part_id:ex.part_id,qty:ex.qty};
    }

    if (!mutation_type) throw {status:400,error:'mutation_type required',code:'MISSING_FIELD'};
    if (mutation_type!=='reversal'&&!part_id) throw {status:400,error:'part_id required',code:'MISSING_FIELD'};
    if (mutation_type!=='reversal'&&(qty===undefined||qty===null||qty<=0)) throw {status:400,error:'qty must be positive',code:'INVALID_QTY'};

    let part=null,partBehavior=null;
    if (mutation_type!=='reversal') {
      // PHASE 1: Scoped query
      const [p]=await base44.asServiceRole.entities.Part.filter({id:part_id});
      part=p; if(!part) throw {status:404,error:'Part not found',code:'PART_NOT_FOUND'};
      const pc=canMutatePart(part,mutation_type,{source_type});
      if(!pc.allowed) throw {status:400,error:pc.reason,code:pc.code};
      partBehavior=pc.behavior||getPartBehavior(part.part_type);
    }

    const result={mutation_type,part_id:part_id||null,qty:qty||null,audit_log_id:null,mutation_record_id:null,updated_inventory_balance:null};

    if (mutation_type==='receive') {
      if(!to_location_id) throw {status:400,error:'to_location_id required',code:'LOCATION_REQUIRED'};
      const inv=await base44.asServiceRole.entities.InventoryItem.create({part_id,location_id:to_location_id,quantity_on_hand:qty,quantity_reserved:0,purchase_cost:unit_cost||part.default_cost||0,purchase_order_id:order_id||null,received_date:now.split('T')[0],lot_number:lot_number||null,notes:notes||null,source_type:source_type||'manual_entry',requires_inspection:requires_inspection||false});
      result.mutation_record_id=inv.id;result.updated_inventory_balance=qty;mLog.inventory_item_id=inv.id;mLog.qty_before=0;mLog.qty_after=qty;
      if(line_item_id){const [li]=await base44.asServiceRole.entities.PartPurchaseLineItem.filter({id:line_item_id});if(li){const nr=(li.qty_received||0)+qty;await base44.asServiceRole.entities.PartPurchaseLineItem.update(line_item_id,{qty_received:nr,status:nr>=(li.qty_ordered||0)?'Received':'Partial'});}}
      const al=await base44.asServiceRole.entities.InventoryAuditLog.create({part_id,project_id:project_id||null,inventory_item_id:inv.id,action_type:'receive',qty_before:0,qty_after:qty,qty_changed:qty,to_location_id,notes:notes||`Received ${qty}`,performed_by:user.id,performed_at:now,related_entity_type:order_id?'Order':null,related_entity_id:order_id||null});
      result.audit_log_id=al.id;mLog.audit_log_id=al.id;
    }
    else if (mutation_type==='move') {
      if(!from_location_id) throw {status:400,error:'from_location_id required',code:'LOCATION_REQUIRED'};
      if(!to_location_id) throw {status:400,error:'to_location_id required',code:'LOCATION_REQUIRED'};
      if(from_location_id===to_location_id) throw {status:400,error:'Same location',code:'SAME_LOCATION'};
      let [si]=await base44.asServiceRole.entities.InventoryItem.filter({part_id,location_id:from_location_id});
      if(!si&&inventory_item_id){const [s]=await base44.asServiceRole.entities.InventoryItem.filter({id:inventory_item_id});si=s;}
      if(!si) throw {status:400,error:'No inventory at source',code:'NO_INVENTORY'};
      const [cur]=await base44.asServiceRole.entities.InventoryItem.filter({id:si.id});if(!cur) throw {status:400,error:'Source gone',code:'CONCURRENCY_ERROR'};
      const avail=(cur.quantity_on_hand||0)-(cur.quantity_reserved||0); if(qty>avail) throw {status:400,error:`Insufficient: ${avail}`,code:'INSUFFICIENT_QUANTITY'};
      mLog.qty_before=cur.quantity_on_hand; const nSrc=(cur.quantity_on_hand||0)-qty;
      await base44.asServiceRole.entities.InventoryItem.update(si.id,{quantity_on_hand:nSrc});mLog.qty_after=nSrc;mLog.inventory_item_id=si.id;
      const [di]=await base44.asServiceRole.entities.InventoryItem.filter({part_id,location_id:to_location_id});
      if(di){const nd=(di.quantity_on_hand||0)+qty;await base44.asServiceRole.entities.InventoryItem.update(di.id,{quantity_on_hand:nd});result.updated_inventory_balance=nd;}
      else{await base44.asServiceRole.entities.InventoryItem.create({part_id,location_id:to_location_id,quantity_on_hand:qty,quantity_reserved:0,purchase_cost:cur.purchase_cost||part.default_cost||0,received_date:cur.received_date,notes:'Transferred',source_type:'internal_transfer'});result.updated_inventory_balance=qty;}
      const tf=await base44.asServiceRole.entities.InventoryTransfer.create({part_id,inventory_item_id:si.id,from_location_id,to_location_id,qty_moved:qty,transfer_reason:reason||'other',notes:notes||null,transfer_status:'completed'});result.mutation_record_id=tf.id;
      const al=await base44.asServiceRole.entities.InventoryAuditLog.create({part_id,inventory_item_id:si.id,action_type:'move',qty_before:cur.quantity_on_hand,qty_after:nSrc,qty_changed:qty,from_location_id,to_location_id,notes:notes||`Moved ${qty}`,performed_by:user.id,performed_at:now});result.audit_log_id=al.id;mLog.audit_log_id=al.id;
    }
    else if (mutation_type==='install') {
      if(!project_id) throw {status:400,error:'project_id required',code:'PROJECT_REQUIRED'};
      let tpl=null,task=null;
      if(task_part_link_id){const [l]=await base44.asServiceRole.entities.TaskPartLink.filter({id:task_part_link_id});tpl=l;if(tpl){if(tpl.part_id!==part_id) throw {status:400,error:'Part mismatch',code:'TASK_LINK_MISMATCH'};if(tpl.project_id&&tpl.project_id!==project_id) throw {status:400,error:'Project mismatch',code:'TASK_LINK_PROJECT_MISMATCH'};const [t]=await base44.asServiceRole.entities.Task.filter({id:tpl.task_id});task=t;}}
      let invItem=null,ucInst=unit_cost||part.default_cost||0;
      if(partBehavior.affects_inventory){
        if(from_location_id){const [i]=await base44.asServiceRole.entities.InventoryItem.filter({part_id,location_id:from_location_id});invItem=i;}
        else if(inventory_item_id){const [i]=await base44.asServiceRole.entities.InventoryItem.filter({id:inventory_item_id});invItem=i;}
        else{const all=await base44.asServiceRole.entities.InventoryItem.filter({part_id});invItem=all.find(i=>(i.quantity_on_hand||0)-(i.quantity_reserved||0)>=qty);}
        if(!invItem) throw {status:400,error:'No inventory',code:'NO_INVENTORY'};
        const [cur]=await base44.asServiceRole.entities.InventoryItem.filter({id:invItem.id});if(!cur) throw {status:400,error:'Inventory gone',code:'CONCURRENCY_ERROR'};
        const avail=(cur.quantity_on_hand||0)-(cur.quantity_reserved||0);if(qty>avail) throw {status:400,error:`Insufficient: ${avail}`,code:'INSUFFICIENT_QUANTITY'};
        ucInst=cur.purchase_cost||ucInst;mLog.qty_before=cur.quantity_on_hand;const nq=(cur.quantity_on_hand||0)-qty;
        await base44.asServiceRole.entities.InventoryItem.update(invItem.id,{quantity_on_hand:nq});result.updated_inventory_balance=nq;mLog.qty_after=nq;mLog.inventory_item_id=invItem.id;
      }
      const ip=await base44.asServiceRole.entities.InstalledPart.create({part_id,project_id,task_id:tpl?.task_id||null,task_part_link_id:task_part_link_id||null,commitment_id:commitment_id||null,inventory_item_id:invItem?.id||null,qty_consumed:qty,unit_cost_at_install:ucInst,extended_cost:ucInst*qty,installed_date:now,installed_by:user.id,location_id:invItem?.location_id||from_location_id||null,notes:notes||null});result.mutation_record_id=ip.id;
      if(tpl){const ni=(tpl.qty_installed||0)+qty;await base44.asServiceRole.entities.TaskPartLink.update(task_part_link_id,{qty_installed:ni,install_status:ni>=(tpl.qty_allocated||0)?'complete':'partial',installed_at:now,installed_by:user.id});}
      // PHASE 1: Only qty_installed, no commitment_status
      if(commitment_id){const [cm]=await base44.asServiceRole.entities.PartCommitment.filter({id:commitment_id});if(cm){const ni=(cm.qty_installed||0)+qty;await base44.asServiceRole.entities.PartCommitment.update(commitment_id,{qty_installed:ni,commitment_version:(cm.commitment_version||1)+1});await base44.asServiceRole.entities.CommitmentAuditLog.create({commitment_id,action_type:'qty_change',previous_values:{qty_installed:cm.qty_installed},new_values:{qty_installed:ni,delta:qty},trigger_source:'install',validation_passed:true});}}
      const al=await base44.asServiceRole.entities.InventoryAuditLog.create({part_id,project_id,commitment_id:commitment_id||null,inventory_item_id:invItem?.id||null,action_type:'install',qty_before:invItem?mLog.qty_before:null,qty_after:result.updated_inventory_balance,qty_changed:qty,location_id:invItem?.location_id||from_location_id||null,notes:notes||`Installed ${qty}`,performed_by:user.id,performed_at:now,related_entity_type:task_part_link_id?'TaskPartLink':null,related_entity_id:task_part_link_id||null});result.audit_log_id=al.id;mLog.audit_log_id=al.id;
    }
    else if (mutation_type==='reversal') {
      if(!reversed_mutation_id) throw {status:400,error:'reversed_mutation_id required',code:'MISSING_FIELD'};
      const [orig]=await base44.asServiceRole.entities.InventoryMutationLog.filter({id:reversed_mutation_id});if(!orig) throw {status:404,error:'Original not found',code:'MUTATION_NOT_FOUND'};if(orig.is_reversed) throw {status:400,error:'Already reversed',code:'ALREADY_REVERSED'};
      mLog.reversed_mutation_id=reversed_mutation_id;mLog.part_id=orig.part_id;mLog.qty=orig.qty;const oq=orig.qty;
      if(orig.mutation_type==='receive'&&orig.inventory_item_id){const [it]=await base44.asServiceRole.entities.InventoryItem.filter({id:orig.inventory_item_id});if(it){const nq=Math.max(0,(it.quantity_on_hand||0)-oq);await base44.asServiceRole.entities.InventoryItem.update(it.id,{quantity_on_hand:nq});result.updated_inventory_balance=nq;mLog.qty_before=it.quantity_on_hand;mLog.qty_after=nq;mLog.inventory_item_id=it.id;}}
      else if(orig.mutation_type==='install'){
        if(orig.inventory_item_id){const [it]=await base44.asServiceRole.entities.InventoryItem.filter({id:orig.inventory_item_id});if(it){const nq=(it.quantity_on_hand||0)+oq;await base44.asServiceRole.entities.InventoryItem.update(it.id,{quantity_on_hand:nq});result.updated_inventory_balance=nq;}}
        if(orig.task_part_link_id){const [l]=await base44.asServiceRole.entities.TaskPartLink.filter({id:orig.task_part_link_id});if(l){const ni=Math.max(0,(l.qty_installed||0)-oq);await base44.asServiceRole.entities.TaskPartLink.update(l.id,{qty_installed:ni,install_status:ni===0?'pending':ni>=(l.qty_allocated||0)?'complete':'partial'});}}
        // PHASE 1: Only qty_installed
        if(orig.commitment_id){const [cm]=await base44.asServiceRole.entities.PartCommitment.filter({id:orig.commitment_id});if(cm){const ni=Math.max(0,(cm.qty_installed||0)-oq);await base44.asServiceRole.entities.PartCommitment.update(cm.id,{qty_installed:ni,commitment_version:(cm.commitment_version||1)+1});await base44.asServiceRole.entities.CommitmentAuditLog.create({commitment_id:cm.id,action_type:'qty_change',previous_values:{qty_installed:cm.qty_installed},new_values:{qty_installed:ni,delta:-oq},trigger_source:'reversal',validation_passed:true});}}
      }
      else if(orig.mutation_type==='move'&&orig.from_location_id&&orig.to_location_id){
        const [src]=await base44.asServiceRole.entities.InventoryItem.filter({part_id:orig.part_id,location_id:orig.from_location_id});if(src) await base44.asServiceRole.entities.InventoryItem.update(src.id,{quantity_on_hand:(src.quantity_on_hand||0)+oq});
        const [dst]=await base44.asServiceRole.entities.InventoryItem.filter({part_id:orig.part_id,location_id:orig.to_location_id});if(dst){const nq=Math.max(0,(dst.quantity_on_hand||0)-oq);await base44.asServiceRole.entities.InventoryItem.update(dst.id,{quantity_on_hand:nq});result.updated_inventory_balance=nq;}
      }
      await base44.asServiceRole.entities.InventoryMutationLog.update(reversed_mutation_id,{is_reversed:true});
      result.mutation_type='reversal';result.part_id=orig.part_id;result.qty=oq;result.reversed_mutation_id=reversed_mutation_id;result.original_mutation_type=orig.mutation_type;
      const al=await base44.asServiceRole.entities.InventoryAuditLog.create({part_id:orig.part_id,project_id:orig.project_id||null,commitment_id:orig.commitment_id||null,inventory_item_id:orig.inventory_item_id||null,action_type:'quantity_adjust',qty_changed:-oq,notes:`Reversal of ${orig.mutation_type} (${reversed_mutation_id})`,performed_by:user.id,performed_at:now,related_entity_type:'InventoryMutationLog',related_entity_id:reversed_mutation_id});result.audit_log_id=al.id;mLog.audit_log_id=al.id;
    }
    else throw {status:400,error:`Unsupported: ${mutation_type}`,code:'INVALID_MUTATION_TYPE'};

    mLog.result_status='success';mLog.mutation_record_id=result.mutation_record_id;mLog.execution_time_ms=Date.now()-startTime;
    const saved=await base44.asServiceRole.entities.InventoryMutationLog.create(mLog);result.mutation_log_id=saved.id;
    if(mutation_type==='reversal'&&reversed_mutation_id) await base44.asServiceRole.entities.InventoryMutationLog.update(reversed_mutation_id,{reversed_by_mutation_id:saved.id});
    return {success:true,...result};
  } catch(error) {
    mLog.result_status='failed';mLog.error_message=error.error||error.message;mLog.error_code=error.code||'UNKNOWN';mLog.execution_time_ms=Date.now()-startTime;
    try{await base44.asServiceRole.entities.InventoryMutationLog.create(mLog);}catch(e){console.error('Log fail:',e);}
    throw error;
  }
}

Deno.serve(async (req) => {
  const startTime=Date.now();
  try {
    const base44=createClientFromRequest(req);const user=await base44.auth.me();if(!user) return Response.json({error:'Unauthorized'},{status:401});
    const payload=await req.json();
    if(Array.isArray(payload.mutations)){const results=[],errors=[];for(let i=0;i<payload.mutations.length;i++){try{results.push({index:i,...await processMutation(base44,user,payload.mutations[i],startTime)});}catch(e){errors.push({index:i,error:e.error||e.message,code:e.code||'UNKNOWN'});if(payload.stop_on_error)break;}}return Response.json({batch:true,total:payload.mutations.length,successful:results.length,failed:errors.length,results,errors});}
    return Response.json(await processMutation(base44,user,payload,startTime));
  } catch(error) {
    console.error('Inventory mutation error:',error);
    return Response.json({error:error.error||error.message,code:error.code||'UNKNOWN'},{status:error.status||500});
  }
});