import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * Photo-first physical property: intentionally separate from Part / InventoryItem.
 * Staff-only signed-photo reads; client/public views are NOT supported here.
 * All ownership, container and project values are taken from DB, never caller-controlled.
 */
const respond = (data, status=200) => Response.json(data, {status});
const TYPES = new Set(['unidentified','miscellaneous','take_off','client_supplied','spare','other']);
const CONDITIONS = new Set(['unknown','new','used','damaged','mixed']);
const safeText=(s,n)=>typeof s==='string' ? s.trim().slice(0,n) : '';
const idOk=(s)=>typeof s==='string'&&/^[a-zA-Z0-9_-]{12,120}$/.test(s);
// Base44 UploadPrivateFile can return opaque relative object identifiers in
// addition to gs:// and private/ URIs. A syntax check alone does NOT prove privacy.
// Every new URI is verified using the private CreateFileSignedUrl integration
// below, before saving a StoredPropertyPhoto record.
const photoUri=(s)=>{
  if(typeof s!=='string'||s.length<3||s.length>2048||
     /[?#\\\u0000-\u001f]/.test(s)||s.includes('..')||s.startsWith('//'))return false;
  if(/^gs:\/\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,220}\/[^/].+/.test(s))return true;
  if(/^[a-z][a-z\d+.-]*:/i.test(s))return false;
  return /^\/?[a-zA-Z0-9][a-zA-Z0-9_./% +@=-]*$/.test(s);
};
const trimPhoto=(p)=>({id:p.id,stored_property_id:p.stored_property_id??null,container_id:p.container_id,capture_key:p.capture_key||null,has_thumbnail:!!p.thumbnail_uri,sort_order:p.sort_order,caption:p.caption,captured_at:p.captured_at});

Deno.serve(async (req)=>{
  try {
    if(req.method!=='POST') return respond({error:'Method not allowed'},405);
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user) return respond({error:'Unauthenticated'},401);
    const db=base44.asServiceRole;
    let staff=user.role==='admin';
    if(!staff){
      const members=await db.entities.TeamMember.filter({user_id:user.id});
      staff=members.some(m=>m.is_achtung_kraft_member===true&&m.active!==false);
    }
    if(!staff) return respond({error:'AK staff only'},403);
    const body=await req.json();
    const action=body?.action;
    if(!['list_container','create_group','add_photo','get_photos','update_group','find_by_part','add_unsorted_photo','unsorted_summary'].includes(action)){
      return respond({error:'Unsupported storage property operation'},400);
    }

    if(action==='find_by_part'){
      const id=body.part_id;
      if(!idOk(id)) return respond({error:'Invalid part ID'},400);
      const items=await db.entities.StoredProperty.filter({catalog_part_id:id,status:'in_storage'},'-created_date',100);
      // Location is derived from the CURRENT container location.
      const containerIds=[...new Set(items.map(i=>i.container_id).filter(Boolean))];
      const containers=await Promise.all(containerIds.map(async cid=>(await db.entities.StorageContainer.filter({id:cid}))[0]));
      const byId=new Map(containers.filter(Boolean).map(c=>[c.id,c]));
      const idsFor=(field)=>[...new Set(items.map(i=>i[field]).filter(Boolean))];
      let projects=[],clients=[];
      try{
        const results=await Promise.all([
          idsFor('project_id').length?db.entities.Project.filter({id:{$in:idsFor('project_id')}}):[],
          idsFor('client_account_id').length?db.entities.ClientAccount.filter({id:{$in:idsFor('client_account_id')}}):[],
        ]);
        projects=results[0]||[];
        clients=results[1]||[];
      }catch(_){ /* preserve successful property lookup even if display-name enrichment fails */ }
      const projectNames=new Map(projects.map(p=>[p.id,p.name]));
      const clientNames=new Map(clients.map(c=>[c.id,c.name]));
      return respond({success:true,items:items.map(i=>({
        id:i.id,name:i.name,property_type:i.property_type,condition:i.condition,
        quantity_known:i.quantity_known,quantity:i.quantity,ownership_type:i.ownership_type,
        client_account_id:i.client_account_id,client_name:clientNames.get(i.client_account_id)||null,
        project_id:i.project_id,project_name:projectNames.get(i.project_id)||null,
        container_id:i.container_id,container_name:byId.get(i.container_id)?.name,
        container_code:byId.get(i.container_id)?.short_code,
        location_id:byId.get(i.container_id)?.location_id||i.location_id||null,
      }))});
    }

    const containerId=body.container_id;
    const propertyId=body.property_id;
    if(action==='get_photos'){
      if(!idOk(propertyId)) return respond({error:'Valid property_id required'},400);
      const [item]=await db.entities.StoredProperty.filter({id:propertyId});
      if(!item) return respond({error:'Property not found'},404);
      const all=await db.entities.StoredPropertyPhoto.filter({stored_property_id:propertyId,archived:false},'sort_order',100);
      const results=[];
      for(const p of all){
        try{
          const signed=await db.integrations.Core.CreateFileSignedUrl({file_uri:p.file_uri,expires_in:600});
          results.push({...trimPhoto(p),signed_url:signed.signed_url});
        }catch(_e){results.push({...trimPhoto(p),error:'Image unavailable'})}
      }
      return respond({success:true,photos:results});
    }
    if(!idOk(containerId)) return respond({error:'Valid container_id required'},400);
    const [container]=await db.entities.StorageContainer.filter({id:containerId});
    if(!container||container.active===false||container.status==='archived'||container.status==='reserved'){
      return respond({error:'Active container not found'},404);
    }

    if(action==='unsorted_summary'){
      const rows=await db.entities.StoredPropertyPhoto.filter({container_id:container.id,archived:false},'-created_date',2000);
      return respond({success:true,container_id:container.id,count:rows.filter(r=>!r.stored_property_id).length});
    }

    if(action==='add_unsorted_photo'){
      // Quick capture: one photo saved directly to the box, no content entry, no inventory.
      const key=body.capture_key;
      if(!idOk(key)) return respond({error:'Stable capture_key required'},400);
      const existingKey=await db.entities.StoredPropertyPhoto.filter({container_id:container.id,capture_key:key},'created_date',5);
      if(existingKey.length) return respond({success:true,idempotent_hit:true,photo:trimPhoto(existingKey[0])});
      const uri=body.file_uri;
      if(!photoUri(uri)) return respond({error:'Invalid private file reference format (public URLs are not accepted)'},400);
      const verified=async(u)=>{
        try{
          const s=await db.integrations.Core.CreateFileSignedUrl({file_uri:u,expires_in:60});
          return typeof s?.signed_url==='string'&&s.signed_url.startsWith('https://');
        }catch(_){return false}
      };
      if(!await verified(uri)) return respond({error:'Private storage could not verify this photo reference',code:'PRIVATE_URI_NOT_VERIFIED'},422);
      // Preview is optional: an unverifiable thumbnail is dropped, never blocks the original.
      const thumb=body.thumbnail_uri;
      const thumbnailUri=(photoUri(thumb)&&thumb!==uri&&await verified(thumb))?thumb:null;
      const size=Number(body.original_size_bytes);
      const created=await db.entities.StoredPropertyPhoto.create({
        stored_property_id:null,container_id:container.id,file_uri:uri,thumbnail_uri:thumbnailUri,
        capture_key:key,capture_batch_id:safeText(body.capture_batch_id,100)||key,
        original_file_name:safeText(body.original_file_name,200)||null,
        original_mime_type:safeText(body.original_mime_type,100)||null,
        original_size_bytes:Number.isFinite(size)&&size>0?size:null,
        sort_order:0,captured_by:user.id,captured_at:new Date().toISOString(),archived:false,
      });
      // No unique constraint is available: detect a concurrent retry and keep only the oldest record.
      const same=await db.entities.StoredPropertyPhoto.filter({container_id:container.id,capture_key:key},'created_date',10);
      if(same.length>1&&same[0].id!==created.id){
        await db.entities.StoredPropertyPhoto.delete(created.id);
        return respond({success:true,idempotent_hit:true,photo:trimPhoto(same[0])});
      }
      return respond({success:true,photo:trimPhoto(created)});
    }

    if(action==='list_container'){
      const items=await db.entities.StoredProperty.filter({container_id:container.id},'-created_date',150);
      const photoRows=await db.entities.StoredPropertyPhoto.filter({container_id:container.id,archived:false},'-created_date',500);
      const counts={};
      for(const photo of photoRows) counts[photo.stored_property_id]=(counts[photo.stored_property_id]||0)+1;
      return respond({success:true,container_id:container.id,
        items:items.map(item=>({...item,photo_count:counts[item.id]||0})),
      });
    }

    if(action==='create_group'){
      const name=safeText(body.name,150)||'Unidentified contents';
      const intakeKey=body.intake_key;
      if(!idOk(intakeKey)) return respond({error:'Stable intake_key required'},400);
      const prior=await db.entities.StoredProperty.filter({intake_key:intakeKey,container_id:container.id});
      if(prior.length) return respond({success:true,idempotent_hit:true,item:prior[0]});
      const propertyType=TYPES.has(body.property_type)?body.property_type:'unidentified';
      const condition=CONDITIONS.has(body.condition)?body.condition:'unknown';
      const q=body.quantity;
      const qtyKnown=body.quantity_known===true;
      if(qtyKnown&&(!Number.isFinite(q)||q<=0||q>99999)) return respond({error:'Quantity must be positive'},400);
      const record=await db.entities.StoredProperty.create({
        intake_key:intakeKey,name,property_type:propertyType,
        ownership_type:container.client_account_id?'client':'unknown',
        client_account_id:container.client_account_id||null,
        project_id:container.project_id||null,
        container_id:container.id,location_id:null,
        quantity_known:qtyKnown,quantity:qtyKnown?q:null,condition,
        status:'in_storage',description:safeText(body.description,1200),
        notes:safeText(body.notes,1200),created_by:user.id,last_updated_by:user.id,
      });
      try {
        await db.entities.StorageCustodyEvent.create({
          action_key:'property_intake_'+record.id,event_type:'intake',
          stored_property_id:record.id,container_id:container.id,
          to_location_id:container.location_id||null,
          client_account_id:container.client_account_id||null,project_id:container.project_id||null,
          performed_by:user.id,performed_at:new Date().toISOString(),
          notes:'Recorded client property without an inventory mutation',
        });
      }catch(_err){ /* Item is persisted; a future audit can reconcile missing event */ }
      return respond({success:true,item:record});
    }

    if(action==='add_photo'){
      if(!idOk(propertyId)) return respond({error:'property_id required'},400);
      const [item]=await db.entities.StoredProperty.filter({id:propertyId,container_id:container.id});
      if(!item||item.status!=='in_storage') return respond({error:'Property is not in this box'},409);
      const uri=body.file_uri;
      if(!photoUri(uri)) return respond({error:'Invalid private file reference format (public URLs are not accepted)'},400);
      const existing=await db.entities.StoredPropertyPhoto.filter({stored_property_id:item.id,file_uri:uri});
      if(existing.length) return respond({success:true,idempotent_hit:true,photo:trimPhoto(existing[0])});
      // Critical privacy boundary: never assume a relative URI proves a file
      // is private. Only persist a file that Base44 can sign as private.
      try {
        const signed=await db.integrations.Core.CreateFileSignedUrl({file_uri:uri,expires_in:60});
        if(typeof signed?.signed_url!=='string'||!signed.signed_url.startsWith('https://')){
          return respond({error:'Private storage could not verify this photo reference',code:'PRIVATE_URI_NOT_VERIFIED'},422);
        }
      }catch(_error){
        return respond({error:'Private storage could not verify this photo reference',code:'PRIVATE_URI_NOT_VERIFIED'},422);
      }
      const total=await db.entities.StoredPropertyPhoto.filter({stored_property_id:item.id},'-created_date',100);
      if(total.length>=100) return respond({error:'100 photo limit for a group'},409);
      const photo=await db.entities.StoredPropertyPhoto.create({
        stored_property_id:item.id,container_id:container.id,
        file_uri:uri,capture_batch_id:safeText(body.capture_batch_id,100)||item.intake_key,
        sort_order:total.length,caption:safeText(body.caption,200),
        captured_by:user.id,captured_at:new Date().toISOString(),archived:false,
      });
      return respond({success:true,photo:trimPhoto(photo)});
    }

    if(action==='update_group'){
      if(!idOk(propertyId)) return respond({error:'property_id required'},400);
      const [item]=await db.entities.StoredProperty.filter({id:propertyId,container_id:container.id});
      if(!item||item.status!=='in_storage') return respond({error:'Property is not available in this container'},409);
      const patch={last_updated_by:user.id};
      if(body.name!==undefined){
        const name=safeText(body.name,150);
        if(!name) return respond({error:'Name required'},400);
        patch.name=name;
      }
      if(body.description!==undefined)patch.description=safeText(body.description,1200);
      if(body.notes!==undefined)patch.notes=safeText(body.notes,1200);
      if(body.condition!==undefined){
        if(!CONDITIONS.has(body.condition))return respond({error:'Invalid condition'},400);
        patch.condition=body.condition;
      }
      if(body.quantity_known!==undefined){
        if(typeof body.quantity_known!=='boolean')return respond({error:'Invalid quantity_known'},400);
        if(body.quantity_known){
          if(!Number.isFinite(body.quantity)||body.quantity<=0||body.quantity>99999){
            return respond({error:'Quantity must be a positive number'},400);
          }
          patch.quantity_known=true;patch.quantity=body.quantity;
        }else{
          patch.quantity_known=false;patch.quantity=null;
        }
      }
      if(body.property_type!==undefined){
        if(!TYPES.has(body.property_type))return respond({error:'Invalid type'},400);
        patch.property_type=body.property_type;
      }
      if(body.catalog_part_id!==undefined){
        if(body.catalog_part_id===null||body.catalog_part_id===''){
          patch.catalog_part_id=null;
        }else{
          if(!idOk(body.catalog_part_id))return respond({error:'Invalid Part ID'},400);
          const [part]=await db.entities.Part.filter({id:body.catalog_part_id});
          if(!part) return respond({error:'Catalog Part not found'},404);
          patch.catalog_part_id=part.id;
        }
      }
      const updated=await db.entities.StoredProperty.update(item.id,patch);
      if(body.catalog_part_id!==undefined&&item.catalog_part_id!==updated.catalog_part_id){
        try{
          await db.entities.StorageCustodyEvent.create({
            event_type:updated.catalog_part_id?'link_catalog':'unlink_catalog',
            stored_property_id:item.id,container_id:container.id,
            project_id:container.project_id||null,
            client_account_id:container.client_account_id||null,
            performed_by:user.id,performed_at:new Date().toISOString(),
            action_key:'property_link_'+item.id+'_'+Date.now(),
            details:{before:item.catalog_part_id||null,after:updated.catalog_part_id||null},
          });
        }catch(_){}
      }
      return respond({success:true,item:updated});
    }
    return respond({error:'Unsupported operation'},400);
  }catch(error){
    return respond({error:error?.message||'Property storage service error'},500);
  }
});