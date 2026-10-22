import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * Label reservation is isolated from physical containers:
 * StorageLabel (admin-readable) exists before a box is used.
 * Activation creates an actual StorageContainer with the same permanent QR payload.
 *
 * Preprinted QR: AK_CTR:{StorageLabel.id}
 * Legacy QR:     AK_CTR:{StorageContainer.id}
 *
 * No InventoryItem/Part/stock mutation in this function.
 * Backend checks staff membership and project/location ownership.
 */
const TYPES = {box:'BOX',tote:'TOTE',bin:'BIN',tray:'TRAY',organizer:'ORG',crate:'CRT',cart:'CART',kit:'KIT',other:'CTR'};
const reply = (obj,status=200)=>Response.json(obj,{status});

Deno.serve(async(req)=>{
  try {
    if(req.method!=='POST') return reply({error:'Method not allowed'},405);
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user) return reply({error:'Unauthorized'},401);
    const db=base44.asServiceRole;
    const isAdmin=user.role==='admin';
    let isStaff=isAdmin;
    if(!isStaff){
      const memberships=await db.entities.TeamMember.filter({user_id:user.id});
      isStaff=memberships.some(m=>m.active!==false&&m.is_achtung_kraft_member===true);
    }
    if(!isStaff) return reply({error:'AK staff access required'},403);
    const input=await req.json();
    const action=input?.action;

    if(action==='generate'){
      if(!isAdmin) return reply({error:'Admin permission required'},403);
      const count=input.count;
      const type=input.container_type||'box';
      const requestKey=input.request_key;
      if(!Number.isInteger(count)||count<1||count>50) return reply({error:'Count must be 1 to 50'},400);
      if(!Object.prototype.hasOwnProperty.call(TYPES,type)) return reply({error:'Invalid container type'},400);
      if(typeof requestKey!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(requestKey)) return reply({error:'Valid request key required'},400);

      let [batch]=await db.entities.StorageLabelBatch.filter({request_key:requestKey});
      if(batch&&(batch.requested_count!==count||batch.container_type!==type)) {
        return reply({error:'Request key already used for a different batch'},409);
      }
      if(!batch) batch=await db.entities.StorageLabelBatch.create({
        request_key:requestKey,requested_count:count,container_type:type,status:'generating',
        generated_at:new Date().toISOString(),generated_by:user.id,label_ids:[],
      });

      const batchTag=batch.id.slice(-10).toUpperCase();
      const batchCode=`${TYPES[type]}-${batchTag}`;
      const existing=await db.entities.StorageLabel.filter({batch_id:batch.id});
      const byCode=new Map(existing.map(l=>[l.short_code,l]));
      const labels=[];
      try {
        for(let seq=1;seq<=count;seq++){
          const shortCode=`${batchCode}-${String(seq).padStart(3,'0')}`;
          let label=byCode.get(shortCode);
          if(!label){
            const conflict=await db.entities.StorageLabel.filter({short_code:shortCode});
            if(conflict.length) throw new Error('Short-code collision: '+shortCode);
            label=await db.entities.StorageLabel.create({
              batch_id:batch.id,short_code:shortCode,container_type:type,
              sequence:seq,status:'reserved',
            });
          }
          const qr=`AK_CTR:${label.id}`;
          if(label.qr_code_value!==qr) label=await db.entities.StorageLabel.update(label.id,{qr_code_value:qr});
          labels.push({id:label.id,short_code:shortCode,qr_code_value:qr,container_type:type,label_state:label.status});
        }
        await db.entities.StorageLabelBatch.update(batch.id,{status:'ready',label_ids:labels.map(l=>l.id),batch_code:batchCode});
      }catch(e){
        await db.entities.StorageLabelBatch.update(batch.id,{status:'partial',label_ids:labels.map(l=>l.id)});
        return reply({error:'Partial batch allocation. Retry Generate with the same request to resume safely.',details:e.message,batch_id:batch.id,reserved_count:labels.length},503);
      }
      return reply({success:true,batch_id:batch.id,batch_code:batchCode,labels});
    }

    if(action==='list_batches'){
      if(!isAdmin) return reply({error:'Admin permission required'},403);
      const batches=await db.entities.StorageLabelBatch.list('-created_date',20);
      return reply({success:true,batches:batches.map(b=>({
        id:b.id,batch_code:b.batch_code,requested_count:b.requested_count,
        status:b.status,container_type:b.container_type,generated_at:b.generated_at,
      }))});
    }

    if(action==='list_clients'){
      // Used only by internal AK staff during label activation; do not expose
      // client contacts, emails or client-portal data through this endpoint.
      const accounts=await db.entities.ClientAccount.list('name',500);
      return reply({success:true,clients:accounts
        .filter(c=>c.status!=='inactive')
        .map(c=>({id:c.id,name:c.name}))});
    }

    if(action==='get_batch'){
      if(!isAdmin) return reply({error:'Admin permission required'},403);
      if(typeof input.batch_id!=='string') return reply({error:'batch_id required'},400);
      const [batch]=await db.entities.StorageLabelBatch.filter({id:input.batch_id});
      if(!batch) return reply({error:'Batch not found'},404);
      const labels=await db.entities.StorageLabel.filter({batch_id:batch.id});
      return reply({success:true,batch_id:batch.id,batch_code:batch.batch_code,
        labels:labels.filter(l=>l.status!=='voided').sort((a,b)=>a.sequence-b.sequence)
          .map(l=>({id:l.id,short_code:l.short_code,qr_code_value:l.qr_code_value,container_type:l.container_type,label_state:l.status}))});
    }

    if(action==='lookup'){
      const qr=input.qr_value;
      const match=typeof qr==='string'?/^AK_CTR:([a-fA-F0-9]{24})$/.exec(qr.trim()):null;
      if(!match) return reply({error:'Not a recognized container label'},400);
      const [label]=await db.entities.StorageLabel.filter({id:match[1]});
      if(label){
        if(label.status==='reserved'||label.status==='activating'){
          return reply({success:true,reserved:true,container:{
            id:label.id,short_code:label.short_code,container_type:label.container_type,
          }});
        }
        if(label.status==='voided') return reply({error:'Label has been voided'},409);
        // Read by physical QR (not merely the stored pointer): two racing activations
        // must be flagged instead of silently hiding duplicate physical boxes.
        const matches=await db.entities.StorageContainer.filter({qr_code_value:qr});
        if(matches.length>1) return reply({error:'Duplicate box identity detected. Stop using this label and request admin reconciliation.'},409);
        const container=matches[0];
        if(label.container_id&&container&&label.container_id!==container.id) return reply({error:'Label/container identity mismatch. Admin review required.'},409);
        if(!container||container.active===false||container.status==='archived') return reply({error:'Activated container unavailable'},409);
        return reply({success:true,reserved:false,container:{
          id:container.id,name:container.name,short_code:container.short_code,
          container_type:container.container_type,location_id:container.location_id,
          project_id:container.project_id,client_account_id:container.client_account_id,
          active:container.active,status:container.status,qr_code_value:container.qr_code_value,
        }});
      }

      // Compatibility for all pre-existing Storage V2 codes.
      const [container]=await db.entities.StorageContainer.filter({id:match[1]});
      if(!container||container.active===false||container.status==='archived') return reply({error:'No active container associated with this QR'},404);
      return reply({success:true,reserved:false,container:{
        id:container.id,name:container.name,short_code:container.short_code,
        container_type:container.container_type,location_id:container.location_id,
        project_id:container.project_id,client_account_id:container.client_account_id,
        active:container.active,status:container.status,qr_code_value:container.qr_code_value,
      }});
    }

    if(action==='activate'){
      const {label_id,project_id,client_account_id,location_id}=input;
      if(typeof label_id!=='string'||typeof location_id!=='string'||!(project_id||client_account_id)){
        return reply({error:'Label, physical location, and project or Client Account are required'},400);
      }
      const [label]=await db.entities.StorageLabel.filter({id:label_id});
      if(!label||label.status==='voided') return reply({error:'Reserved label not found'},404);
      const [project]=project_id?await db.entities.Project.filter({id:project_id}):[null];
      const [location]=await db.entities.Location.filter({id:location_id});
      if(project_id&&!project) return reply({error:'Project not found'},404);
      if(!location||location.active===false) return reply({error:'Location not active'},400);
      if(location.project_id&&location.project_id!==project?.id) return reply({error:'Location belongs to a different project'},409);
      const ownerId=project?.client_account_id||client_account_id||null;
      if(project&&client_account_id&&project.client_account_id&&client_account_id!==project.client_account_id){
        return reply({error:'Client Account does not match the project owner'},409);
      }
      const [client]=ownerId?await db.entities.ClientAccount.filter({id:ownerId}):[null];
      if(ownerId&&(!client||client.status==='inactive')) return reply({error:'Client Account not active or unavailable'},400);
      const name=typeof input.name==='string'?input.name.trim().slice(0,100):'';
      if(label.status==='activated') return reply({error:'Label already activated. Scan to open its existing box.'},409);
      if(!['reserved','activating'].includes(label.status)) return reply({error:'Label is not reservable'},409);

      const qr=`AK_CTR:${label.id}`;
      // Recovery: if a previous activation created the box but failed to record the link,
      // reuse it rather than creating a second box.
      const existing=await db.entities.StorageContainer.filter({qr_code_value:qr});
      if(existing.length>1) return reply({error:'Duplicate container QR detected. Admin reconciliation required.'},409);
      let container=existing[0];
      if(container){
        if((container.project_id||null)!==(project?.id||null)||
           (container.client_account_id||null)!==(client?.id||null)||container.location_id!==location.id) {
          return reply({error:'An earlier activation already assigned this label differently. Admin review required.'},409);
        }
      }else{
        container=await db.entities.StorageContainer.create({
          name:name||label.short_code,short_code:label.short_code,
          qr_code_value:qr,container_type:label.container_type,
          label_batch_id:label.batch_id,label_state:'activated',
          ...(project?{project_id:project.id}:{}),
          ...(client?{client_account_id:client.id}:{}),
          location_id:location.id,status:'active',active:true,
          label_activated_by:user.id,label_activated_at:new Date().toISOString(),
        });
      }

      // Base44 does not expose an atomic compare-and-swap constraint on this entity.
      // Detect a concurrent double-activation and fail closed rather than declaring
      // success with two matching QR containers. This is detection, not a DB lock.
      const postCreate=await db.entities.StorageContainer.filter({qr_code_value:qr});
      if(postCreate.length!==1||postCreate[0].id!==container.id){
        return reply({error:'Duplicate or conflicting box activation detected. Admin reconciliation required.',code:'DUPLICATE_BOX_IDENTITY'},409);
      }
      const now=new Date().toISOString();
      await db.entities.StorageLabel.update(label.id,{status:'activated',container_id:container.id,activated_at:now,activated_by:user.id});
      const [verifiedLabel]=await db.entities.StorageLabel.filter({id:label.id});
      if(verifiedLabel?.container_id!==container.id){
        return reply({error:'Concurrent label activation conflict. Admin review required.',code:'ACTIVATION_CONFLICT'},409);
      }
      let auditRecorded=true;
      try{
        const existingEvents=await db.entities.StorageCustodyEvent.filter({action_key:`activate_label_${label.id}`});
        if(!existingEvents.length) await db.entities.StorageCustodyEvent.create({
          event_type:'activate_label',container_id:container.id,
          ...(client?{client_account_id:client.id}:{}),
          ...(project?{project_id:project.id}:{}),
          to_location_id:location.id,performed_by:user.id,performed_at:now,
          action_key:`activate_label_${label.id}`,notes:'Activated preprinted box label',
        });
      }catch(_){auditRecorded=false}
      return reply({success:true,container,audit_recorded:auditRecorded});
    }

    return reply({error:'Unknown action'},400);
  }catch(e){
    return reply({error:e?.message||'Storage label failure'},500);
  }
});