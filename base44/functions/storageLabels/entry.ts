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

/**
 * V2.4 global container numbering: YY_TYPE_NNNNNN.
 * One counter (StorageIdentifierCounter key 'global') for every type and year. YY is the
 * allocation year, informational only. The counter only increases (compare-and-set), so a
 * number is never issued twice; a lost race may leave a harmless gap, never a duplicate.
 */
const COUNTER_KEY='global';
const NEW_ID=/^(\d{2})_([A-Z]+)_(\d{6})$/;
const fail=(message,status,code)=>Object.assign(new Error(message),{status,code});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const yearCode=()=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'2-digit'}).format(new Date());
const formatId=(yy,type,seq)=>`${yy}_${TYPES[type]}_${String(seq).padStart(6,'0')}`;

async function allocate(db,count){
  for(let attempt=0;attempt<12;attempt++){
    const rows=await db.entities.StorageIdentifierCounter.filter({key:COUNTER_KEY});
    if(rows.length!==1) throw rows.length
      ? fail('More than one numbering counter exists. Admin review required.',409,'NUMBERING_COUNTER_CONFLICT')
      : fail('Container numbering is not initialized yet. An admin must review the identifier audit and approve initialization.',409,'NUMBERING_NOT_INITIALIZED');
    const cur=rows[0].last_sequence||0;
    if(cur+count>999999) throw fail('Global container number range exhausted',409,'NUMBERING_EXHAUSTED');
    const won=(await db.entities.StorageIdentifierCounter.updateMany({key:COUNTER_KEY,last_sequence:cur},{$set:{last_sequence:cur+count}})).updated===1;
    if(won) return cur+1;
    await sleep(40+Math.random()*120*(attempt+1));
  }
  throw fail('Numbering is busy. Please retry.',503,'NUMBERING_BUSY');
}

async function auditIdentifiers(db){
  const [ctrs,labels,batches]=await Promise.all([
    db.entities.StorageContainer.filter({},'created_date',5000),
    db.entities.StorageLabel.filter({},'created_date',5000),
    db.entities.StorageLabelBatch.filter({},'created_date',1000),
  ]);
  const seqOf=(r)=>Number.isInteger(r.global_sequence)?r.global_sequence:(NEW_ID.exec(r.short_code||'')?parseInt(NEW_ID.exec(r.short_code)[3],10):0);
  const dupes=(arr)=>{const m=new Map();arr.filter(Boolean).forEach(v=>m.set(v,(m.get(v)||0)+1));return [...m].filter(([,n])=>n>1).map(([v])=>v);};
  const codes=[...ctrs.map(c=>c.short_code),...labels.filter(l=>!l.container_id).map(l=>l.short_code)];
  return {
    containers:ctrs.length,
    active_containers:ctrs.filter(c=>c.active!==false&&c.status!=='archived').length,
    labels:labels.length,
    reserved_labels:labels.filter(l=>l.status==='reserved'||l.status==='activating').length,
    activated_labels:labels.filter(l=>l.status==='activated').length,
    batches:batches.length,
    new_format_ids:[...ctrs,...labels].filter(r=>NEW_ID.test(r.short_code||'')).length,
    max_global_sequence:Math.max(0,...ctrs.map(seqOf),...labels.map(seqOf),...batches.map(b=>b.seq_end||0)),
    duplicate_codes:dupes(codes),
    duplicate_qr:dupes(ctrs.map(c=>c.qr_code_value)),
  };
}

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
      if(![3,6,9].includes(count)) return reply({error:'Count must be 3, 6 or 9 labels'},400);
      if(!Object.prototype.hasOwnProperty.call(TYPES,type)) return reply({error:'Invalid container type'},400);
      if(typeof requestKey!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(requestKey)) return reply({error:'Valid request key required'},400);

      let [batch]=await db.entities.StorageLabelBatch.filter({request_key:requestKey});
      if(batch&&(batch.requested_count!==count||batch.container_type!==type)) {
        return reply({error:'Request key already used for a different batch'},409);
      }
      if(batch?.status==='voided') return reply({error:'This batch has been retired'},409);
      if(batch&&batch.seq_start===undefined) return reply({error:'This is a pre-V2.4 batch. Reprint it from Previous batches.'},409);
      if(!batch&&(await db.entities.StorageIdentifierCounter.filter({key:COUNTER_KEY})).length!==1){
        return reply({error:'Container numbering is not initialized yet. An admin must review the identifier audit and approve initialization.',code:'NUMBERING_NOT_INITIALIZED'},409);
      }
      if(!batch) batch=await db.entities.StorageLabelBatch.create({
        request_key:requestKey,requested_count:count,container_type:type,status:'generating',
        generated_at:new Date().toISOString(),generated_by:user.id,label_ids:[],seq_start:0,seq_end:0,
      });

      // Reserve one contiguous global range per batch, exactly once (retries reuse it).
      if(!batch.seq_start){
        const start=await allocate(db,count);
        const yy=yearCode();
        const code=`${formatId(yy,type,start)}-${String(start+count-1).padStart(6,'0')}`;
        const won=(await db.entities.StorageLabelBatch.updateMany({id:batch.id,seq_start:0},
          {$set:{seq_start:start,seq_end:start+count-1,year_code:yy,batch_code:code}})).updated===1;
        if(!won) console.warn(`Concurrent retry for batch ${batch.id}; range ${start}+${count} left unused`);
        [batch]=await db.entities.StorageLabelBatch.filter({id:batch.id});
      }

      const batchCode=batch.batch_code;
      const existing=await db.entities.StorageLabel.filter({batch_id:batch.id});
      const byCode=new Map(existing.map(l=>[l.short_code,l]));
      const labels=[];
      try {
        for(let seq=1;seq<=count;seq++){
          const globalSeq=batch.seq_start+seq-1;
          const shortCode=formatId(batch.year_code,type,globalSeq);
          let label=byCode.get(shortCode);
          if(!label){
            const conflict=await db.entities.StorageLabel.filter({short_code:shortCode});
            if(conflict.length) throw new Error('Short-code collision: '+shortCode);
            label=await db.entities.StorageLabel.create({
              batch_id:batch.id,short_code:shortCode,container_type:type,
              sequence:seq,global_sequence:globalSeq,status:'reserved',
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

    if(action==='numbering_status'){
      if(!isAdmin) return reply({error:'Admin permission required'},403);
      const counters=await db.entities.StorageIdentifierCounter.filter({key:COUNTER_KEY});
      return reply({success:true,initialized:counters.length===1,
        last_sequence:counters[0]?.last_sequence??null,audit:await auditIdentifiers(db)});
    }

    if(action==='initialize_numbering'){
      // Non-destructive: creates the counter only. Requires explicit approval phrase.
      if(!isAdmin) return reply({error:'Admin permission required'},403);
      if(input.confirm!=='INITIALIZE_GLOBAL_NUMBERING') return reply({error:'Explicit approval required'},400);
      if((await db.entities.StorageIdentifierCounter.filter({key:COUNTER_KEY})).length) return reply({error:'Numbering is already initialized'},409);
      const audit=await auditIdentifiers(db);
      if(audit.duplicate_codes.length||audit.duplicate_qr.length) return reply({error:'Duplicate identifiers found. Resolve before initializing.',audit},409);
      await db.entities.StorageIdentifierCounter.create({key:COUNTER_KEY,last_sequence:audit.max_global_sequence,
        initial_floor:audit.max_global_sequence,initialized_at:new Date().toISOString(),initialized_by:user.email,audit_summary:audit});
      // Two simultaneous initializations: keep the first counter, remove the extra (nothing allocated from it yet).
      const all=await db.entities.StorageIdentifierCounter.filter({key:COUNTER_KEY},'created_date',10);
      for(const extra of all.slice(1)) await db.entities.StorageIdentifierCounter.delete(extra.id);
      return reply({success:true,next_identifier_number:audit.max_global_sequence+1,audit});
    }

    if(action==='create_container'){
      // Single new container (New Container dialog). Number issued here, never by the browser.
      const requestKey=input.request_key;
      const type=input.container_type||'tote';
      const name=typeof input.name==='string'?input.name.trim().slice(0,100):'';
      if(typeof requestKey!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(requestKey)) return reply({error:'Valid request key required'},400);
      if(!Object.prototype.hasOwnProperty.call(TYPES,type)) return reply({error:'Invalid container type'},400);
      if(!name) return reply({error:'Container name is required'},400);
      const [prior]=await db.entities.StorageContainer.filter({create_request_key:requestKey});
      if(prior) return reply({success:true,container:prior});
      const str=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):undefined;
      const ref=async(E,id)=>{ if(!str(id,40)) return undefined; const [r]=await db.entities[E].filter({id}); if(!r) throw fail(E+' not found',404); return r.id; };
      const color=/^#[0-9a-fA-F]{6}$/.test(input.color||'')?input.color:'#6366F1';
      const fields={name,container_type:type,color,status:'active',active:true,
        location_id:await ref('Location',input.location_id),home_location_id:await ref('Location',input.home_location_id),
        project_id:await ref('Project',input.project_id),notes:str(input.notes,200),description:str(input.description,2000)};
      Object.keys(fields).forEach(k=>fields[k]===undefined&&delete fields[k]);

      const seq=await allocate(db,1);
      const shortCode=formatId(yearCode(),type,seq);
      if((await db.entities.StorageContainer.filter({short_code:shortCode})).length) throw fail('Identifier collision: '+shortCode,409);
      let created=await db.entities.StorageContainer.create({...fields,short_code:shortCode,global_sequence:seq,
        create_request_key:requestKey,qr_code_value:`AK_CTR:pending_${requestKey}`});
      created=await db.entities.StorageContainer.update(created.id,{qr_code_value:`AK_CTR:${created.id}`});
      // Same request submitted twice at once: keep the first container; the extra one was never printed.
      const twins=await db.entities.StorageContainer.filter({create_request_key:requestKey},'created_date',10);
      if(twins.length>1&&twins[0].id!==created.id){ await db.entities.StorageContainer.delete(created.id); return reply({success:true,container:twins[0]}); }
      return reply({success:true,container:created});
    }

    if(action==='list_batches'){
      if(!isAdmin) return reply({error:'Admin permission required'},403);
      // Voided batches are retired: hidden from Previous batches and not reprintable.
      const batches=(await db.entities.StorageLabelBatch.list('-created_date',40)).filter(b=>b.status!=='voided').slice(0,20);
      return reply({success:true,batches:batches.map(b=>({
        id:b.id,batch_code:b.batch_code,requested_count:b.requested_count,
        status:b.status,container_type:b.container_type,generated_at:b.generated_at,
      }))});
    }

    if(action==='list_categories'||action==='save_category'){
      // Sticker categories: visual identification only. Admin-managed, never hard-deleted.
      if(!isAdmin) return reply({error:'Admin permission required'},403);
      const DEFAULTS=[['interior','Interior','#2563eb'],['exterior','Exterior','#7c3aed'],['mechanical','Mechanical','#16a34a'],
        ['electrical','Electrical','#dc2626'],['hardware','Hardware','#ea580c'],['general','General Storage','#6b7280']];
      const norm=(s)=>String(s||'').trim().toLowerCase();
      let cats=await db.entities.StorageLabelCategory.list('sort_order',200);
      // Idempotent defaults: skip any default whose key or name (case-insensitive) already exists.
      const missing=DEFAULTS.filter(([k,n])=>!cats.some(c=>c.key===k||norm(c.name)===norm(n)));
      if(missing.length){
        const start=Math.max(0,...cats.map(c=>c.sort_order||0))+1;
        await db.entities.StorageLabelCategory.bulkCreate(missing.map(([k,n,col],i)=>({key:k,name:n,color:col,sort_order:start+i,active:true})));
        cats=await db.entities.StorageLabelCategory.list('sort_order',200);
      }

      if(action==='save_category'){
        const c=input.category||{};
        const name=typeof c.name==='string'?c.name.trim().slice(0,60):'';
        const m=/^#?([0-9a-fA-F]{6})$/.exec(String(c.color||'').trim());
        if(!name) return reply({error:'Category name is required'},400);
        if(!m) return reply({error:'Color must be a 6-digit HEX value like #2563eb'},400);
        const existing=c.id?cats.find(x=>x.id===c.id):null;
        if(c.id&&!existing) return reply({error:'Category not found'},404);
        if(cats.some(x=>x.id!==c.id&&norm(x.name)===norm(name))) return reply({error:`A category named "${name}" already exists`},409);
        const active=c.active!==false;
        if(existing?.key==='general'&&!active) return reply({error:'General Storage is the fallback category and cannot be deactivated'},400);
        const patch={name,color:'#'+m[1].toLowerCase(),active};
        const saved=existing
          ? await db.entities.StorageLabelCategory.update(existing.id,patch)
          : await db.entities.StorageLabelCategory.create({...patch,sort_order:Math.max(0,...cats.map(x=>x.sort_order||0))+1});
        return reply({success:true,category:saved});
      }

      const usage={};
      for(const c of cats){
        const rows=await db.entities.StorageContainer.filter({storage_category_id:c.id},'-created_date',5000);
        usage[c.id]=rows.filter(r=>r.active!==false&&r.status!=='archived').length;
      }
      return reply({success:true,categories:cats.map(c=>({id:c.id,key:c.key||null,name:c.name,color:c.color,
        active:c.active!==false,sort_order:c.sort_order||0,usage:usage[c.id]||0}))});
    }

    if(action==='save_label_settings'){
      // Explicit save from the tote label print dialog: name and storage category only.
      // Never touches contents, inventory, location or QR identity.
      const items=input.items;
      if(!Array.isArray(items)||items.length<1||items.length>50) return reply({error:'1 to 50 containers required'},400);
      // New assignments must target an active category (read by id so a just-deactivated one is seen).
      const wanted=[...new Set(items.map(i=>i?.storage_category_id).filter(v=>typeof v==='string'))];
      const activeCats=new Set();
      for(const id of wanted){
        const [c]=await db.entities.StorageLabelCategory.filter({id});
        if(c&&c.active!==false) activeCats.add(c.id);
      }
      const plan=[];
      for(const it of items){
        if(typeof it?.container_id!=='string') return reply({error:'container_id required'},400);
        const patch={};
        if(it.name!==undefined){
          const n=typeof it.name==='string'?it.name.trim().slice(0,100):'';
          if(!n) return reply({error:'Container name cannot be blank'},400);
          patch.name=n;
        }
        if(it.storage_category_id!==undefined){
          if(it.storage_category_id!==null&&!activeCats.has(it.storage_category_id)) return reply({error:'That sticker category is inactive or no longer exists'},400);
          patch.storage_category_id=it.storage_category_id;
        }
        if(!Object.keys(patch).length) continue;
        const [c]=await db.entities.StorageContainer.filter({id:it.container_id});
        if(!c||c.active===false||c.status==='archived') return reply({error:'Container unavailable: '+it.container_id},404);
        plan.push({id:c.id,patch});
      }
      const saved=[];
      for(const p of plan){
        const u=await db.entities.StorageContainer.update(p.id,p.patch);
        saved.push({id:u.id,name:u.name,storage_category_id:u.storage_category_id||null});
      }
      return reply({success:true,saved});
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
      if(batch.status==='voided') return reply({error:'This batch has been retired and cannot be reprinted'},409);
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
    return reply({error:e?.message||'Storage label failure',...(e?.code?{code:e.code}:{})},e?.status||500);
  }
});