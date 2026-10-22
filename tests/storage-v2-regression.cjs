/* Storage V2 / property tests against a deterministic mock of the Base44 entity API.
   No network calls, no production entities, and no changes to canonical stock data. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ALPHA = 'a'.repeat(24), BETA='b'.repeat(24), GAMMA='c'.repeat(24), DELTA='d'.repeat(24), EPS='e'.repeat(24);
const clone = a => structuredClone(a);
function harness(file, { role='admin', storage={}, delay=0, failCustody=false, failSigning=false }={}) {
  const rows={TeamMember:[],StorageContainer:[],StoredProperty:[],StoredPropertyPhoto:[],StorageCustodyEvent:[],StorageLabel:[],StorageLabelBatch:[],Project:[],Location:[],Part:[],InventoryItem:[],InventoryTransfer:[],InventoryAuditLog:[],InventoryMutationLog:[], ...clone(storage)};
  const calls=[];
  let next=1;
  const makeId=()=>(next++).toString(16).padStart(24,'0');
  const cmp=(record,query)=>Object.entries(query||{}).every(([k,v])=>v&&typeof v==='object'&&('$in' in v) ? v.$in.includes(record[k]):record[k]===v);
  const entities=new Proxy({}, {get(_target,n){return {
    async filter(q,_sort,limit){calls.push(`${String(n)}.filter`);return (rows[n]||[]).filter(r=>cmp(r,q)).slice(0,limit||500);},
    async list(){calls.push(`${String(n)}.list`);return clone(rows[n]||[]);},
    async create(p){calls.push(`${String(n)}.create`);if(n==='StorageCustodyEvent'&&failCustody)throw Error('intentional log outage');
      if(delay)await new Promise(r=>setTimeout(r,delay));let v={id:makeId(),...p};(rows[n]||=[]).push(v);return v;},
    async update(id,p){calls.push(`${String(n)}.update`);let v=(rows[n]||[]).find(r=>r.id===id);if(!v)throw Error(`Missing ${String(n)} ${id}`);Object.assign(v,p);return clone(v);}
  }}});
  const service={entities, integrations:{Core:{CreateFileSignedUrl:async({file_uri})=>{
    calls.push('CreateFileSignedUrl');
    if(failSigning)throw Error('private signer denied URI');
    return {signed_url:'https://signed.test/'+encodeURIComponent(file_uri)};
  }}}};
  const source=fs.readFileSync(file,'utf8').replace(/^import[^\n]+\n/,'');
  let fn;
  vm.runInNewContext(source,{
    Deno:{serve:h=>{fn=h;}},createClientFromRequest:()=>({auth:{me:async()=>role ?{role,id:'staff'}:null},asServiceRole:service}),
    Response:{json:(data,opt={})=>({status:opt.status||200,data})},
    console,Date,Promise,JSON,Map,Set,RegExp,Number,Error,Math,Array,Object,String,
  });
  return {rows,calls,invoke:async p=>fn({method:'POST',json:async()=>p})};
}
async function storedPropertyTests(){
  const h=harness('base44/functions/storageProperty/entry.ts',{storage:{
    StorageContainer:[{id:ALPHA,active:true,status:'active',name:'Box',location_id:BETA,client_account_id:GAMMA,project_id:DELTA}],
    Part:[{id:EPS,part_name:'Window regulator'}],
    Project:[{id:DELTA,name:'911 build'}],ClientAccount:[{id:GAMMA,name:'Client Alpha'}],
  }});
  const intakeKey='session_'+ 'x'.repeat(26);
  const one=await h.invoke({action:'create_group',container_id:ALPHA,intake_key:intakeKey,name:'Unidentified pieces',property_type:'take_off'});
  assert.equal(one.status,200);assert.equal(one.data.item.client_account_id,GAMMA);assert.equal(one.data.item.ownership_type,'client');
  const again=await h.invoke({action:'create_group',container_id:ALPHA,intake_key:intakeKey,name:'duplicate'});
  assert.equal(again.data.idempotent_hit,true);assert.equal(h.rows.StoredProperty.length,1);
  const pid=one.data.item.id;
  const add=await h.invoke({action:'add_photo',container_id:ALPHA,property_id:pid,file_uri:'private/client/photos/01.jpg'});
  assert.equal(add.data.success,true);
  const duplicate=await h.invoke({action:'add_photo',container_id:ALPHA,property_id:pid,file_uri:'private/client/photos/01.jpg'});
  assert.equal(duplicate.data.idempotent_hit,true);assert.equal(h.rows.StoredPropertyPhoto.length,1);
  const gsUri='gs://base44-private-bucket/photos/02.jpg';
  const cloud=await h.invoke({action:'add_photo',container_id:ALPHA,property_id:pid,file_uri:gsUri});
  assert.equal(cloud.data.success,true);
  const cloudAgain=await h.invoke({action:'add_photo',container_id:ALPHA,property_id:pid,file_uri:gsUri});
  assert.equal(cloudAgain.data.idempotent_hit,true);
  assert.equal(h.rows.StoredPropertyPhoto.length,2);
  const relativeUri='files/storage-private/ak/client%20part-seat.jpg';
  const rel=await h.invoke({action:'add_photo',container_id:ALPHA,property_id:pid,file_uri:relativeUri});
  assert.equal(rel.data.success,true);
  assert.equal(h.rows.StoredPropertyPhoto.length,3);
  const denied=harness('base44/functions/storageProperty/entry.ts',{failSigning:true,storage:{
    StorageContainer:[{id:ALPHA,active:true,status:'active'}],
    StoredProperty:[{id:pid,container_id:ALPHA,status:'in_storage'}],
  }});
  const reject=await denied.invoke({action:'add_photo',container_id:ALPHA,property_id:pid,file_uri:'files/private/unknown.jpg'});
  assert.equal(reject.status,422);
  assert.equal(reject.data.code,'PRIVATE_URI_NOT_VERIFIED');
  assert.equal(denied.rows.StoredPropertyPhoto.length,0);
  for(const unsafe of ['https://example.com/photo.jpg','ftp://someone/file.jpg','javascript:alert(1)','private/../secret.jpg']){
    assert.equal((await h.invoke({action:'add_photo',container_id:ALPHA,property_id:pid,file_uri:unsafe})).status,400);
  }
  const list=await h.invoke({action:'list_container',container_id:ALPHA});assert.equal(list.data.items[0].photo_count,3);
  assert.ok(!JSON.stringify(list.data).includes('private/client/photos'));
  const photos=await h.invoke({action:'get_photos',property_id:pid});assert.ok(photos.data.photos[0].signed_url);
  assert.equal(photos.data.photos.length,3);
  assert.ok(photos.data.photos.every(p=>p.signed_url));
  assert.ok(!JSON.stringify(photos.data).includes('file_uri'));
  const details=await h.invoke({action:'update_group',container_id:ALPHA,property_id:pid,
    name:'Identified trim and clips',property_type:'miscellaneous',condition:'used',
    description:'Dashboard clips and fasteners',notes:'Client box only',
    quantity_known:true,quantity:12});
  assert.equal(details.data.success,true);assert.equal(details.data.item.name,'Identified trim and clips');
  assert.equal(details.data.item.quantity,12);assert.equal(details.data.item.quantity_known,true);
  assert.equal(details.data.item.condition,'used');
  const invalidQty=await h.invoke({action:'update_group',container_id:ALPHA,property_id:pid,quantity_known:true,quantity:0});
  assert.equal(invalidQty.status,400);
  const uncounted=await h.invoke({action:'update_group',container_id:ALPHA,property_id:pid,quantity_known:false});
  assert.equal(uncounted.data.item.quantity_known,false);assert.equal(uncounted.data.item.quantity,null);
  const link=await h.invoke({action:'update_group',container_id:ALPHA,property_id:pid,catalog_part_id:EPS});assert.equal(link.data.success,true);
  const lookup=await h.invoke({action:'find_by_part',part_id:EPS});assert.equal(lookup.data.items[0].location_id,BETA);
  assert.ok(!h.calls.some(x=>/^(InventoryItem|PartCommitment|Part|Order|InventoryMutationLog)\.(create|update)$/.test(x)));
  const external=harness('base44/functions/storageProperty/entry.ts',{role:'user'});
  assert.equal((await external.invoke({action:'get_photos',property_id:pid})).status,403);
  console.log('PASS property: idempotent intake/photo, private photos, later identification and quantity edit, catalog-only link, staff access, no inventory writes');
}
async function labelTests(){
  const h=harness('base44/functions/storageLabels/entry.ts',{storage:{
    Project:[{id:DELTA,name:'Build',client_account_id:GAMMA}],Location:[{id:BETA,location_area:'Rack'}],ClientAccount:[{id:GAMMA,name:'Client Alpha',status:'active'}],
  }});
  const key='batch_'+ 'z'.repeat(20);
  const first=await h.invoke({action:'generate',request_key:key,count:2,container_type:'box'});
  assert.equal(first.data.labels.length,2);assert.notEqual(first.data.labels[0].qr_code_value,first.data.labels[1].qr_code_value);
  assert.equal(h.rows.StorageContainer.length,0);
  const retry=await h.invoke({action:'generate',request_key:key,count:2,container_type:'box'});
  assert.equal(retry.data.labels[0].id,first.data.labels[0].id);assert.equal(h.rows.StorageLabel.length,2);
  const label=first.data.labels[0];
  const before=await h.invoke({action:'lookup',qr_value:label.qr_code_value});assert.equal(before.data.reserved,true);
  const activated=await h.invoke({action:'activate',label_id:label.id,project_id:DELTA,location_id:BETA});
  assert.equal(activated.data.success,true);assert.equal(h.rows.StorageContainer.length,1);
  assert.equal(h.rows.StorageContainer[0].client_account_id,GAMMA);
  assert.equal((await h.invoke({action:'activate',label_id:label.id,project_id:DELTA,location_id:BETA})).status,409);
  const after=await h.invoke({action:'lookup',qr_value:label.qr_code_value});assert.equal(after.data.reserved,false);
  const clientOnly=await h.invoke({action:'activate',label_id:first.data.labels[1].id,client_account_id:GAMMA,location_id:BETA});
  assert.equal(clientOnly.data.success,true);assert.equal(clientOnly.data.container.project_id,undefined);
  assert.equal(clientOnly.data.container.client_account_id,GAMMA);
  const names=await h.invoke({action:'list_clients'});assert.deepEqual(names.data.clients.map(c=>c.name),['Client Alpha']);
  h.rows.StorageContainer.push({id:EPS,active:true,qr_code_value:label.qr_code_value,status:'active'});
  assert.equal((await h.invoke({action:'lookup',qr_value:label.qr_code_value})).status,409);
  assert.ok(!h.calls.some(x=>/^(InventoryItem|Part|Order|PartCommitment)\.(create|update)$/.test(x)));
  console.log('PASS labels: reserved before box, replay safe, project/client-only activation, QR compatibility, duplicate detection');
}
async function moveTests(){
  const h=harness('base44/functions/transferInventoryBatch/entry.ts',{storage:{
    StorageContainer:[{id:ALPHA,name:'Box',active:true,status:'active',location_id:BETA,client_account_id:GAMMA,project_id:DELTA}],
    Location:[{id:EPS,location_area:'New rack',active:true}],
    StoredProperty:[{id:'f'.repeat(24),name:'Takeoff',status:'in_storage',container_id:ALPHA}],
  }});
  const result=await h.invoke({transfer_type:'container_move',container_id:ALPHA,destination_location_id:EPS,idempotency_key:'move_test_session_1'});
  assert.equal(result.data.success,true);assert.equal(result.data.stored_property_count,1);assert.equal(result.data.custody_recorded,true);
  assert.equal(h.rows.StorageCustodyEvent.length,1);assert.equal(h.rows.StorageCustodyEvent[0].to_location_id,EPS);
  assert.equal(h.rows.StoredProperty[0].container_id,ALPHA);assert.equal(h.rows.StoredProperty[0].location_id,undefined);
  assert.equal(h.rows.StorageContainer[0].location_id,EPS);
  assert.ok(!h.calls.some(x=>x==='Part.update'||x==='InventoryItem.create'||x==='PartCommitment.create'));
  const replay=await h.invoke({transfer_type:'container_move',container_id:ALPHA,destination_location_id:EPS,idempotency_key:'move_test_session_1'});
  assert.equal(replay.data.idempotent_hit,true);assert.equal(h.rows.StorageCustodyEvent.length,1);
  const failedLog=harness('base44/functions/transferInventoryBatch/entry.ts',{failCustody:true,storage:{
    StorageContainer:[{id:ALPHA,active:true,status:'active',location_id:BETA}],Location:[{id:EPS,active:true}],
    StoredProperty:[{id:GAMMA,container_id:ALPHA,status:'in_storage'}],
  }});
  const withError=await failedLog.invoke({transfer_type:'container_move',container_id:ALPHA,destination_location_id:EPS});
  assert.equal(withError.data.success,true);assert.equal(withError.data.custody_recorded,false);
  console.log('PASS move: inherited location, separate custody event, replay, failure does not flip moved box to false failure');
}
async function shopAssignmentTests(){
  const LEGACY='9'.repeat(24), SHELF='8'.repeat(24);
  const unassignedItem={id:ALPHA,part_id:EPS,quantity_on_hand:4,quantity_reserved:1,location_id:null,container_id:null};
  const legacyItem={id:BETA,part_id:EPS,quantity_on_hand:5,quantity_reserved:1,location_id:LEGACY,container_id:null};
  const h=harness('base44/functions/transferInventoryBatch/entry.ts',{storage:{
    InventoryItem:[unassignedItem,legacyItem], Location:[{id:LEGACY,location_area:'UNASSIGNED_SYSTEM'},{id:SHELF,location_area:'Shop Rack A'}],
  }});
  const bad=await h.invoke({transfer_type:'inventory_move',source_unassigned_only:true,destination_location_id:SHELF,
    batch_id:'quick_assignment_bad',lines:[{inventory_item_id:BETA,part_id:EPS,qty:1}]});
  assert.equal(bad.data.executed,0);assert.equal(bad.data.errors[0].code,'SOURCE_MISMATCH');
  assert.equal(h.rows.InventoryItem.find(i=>i.id===BETA).quantity_on_hand,5);
  const noLocation=await h.invoke({transfer_type:'inventory_move',source_unassigned_only:true,destination_location_id:SHELF,
    batch_id:'quick_assignment_from_none',lines:[{inventory_item_id:ALPHA,part_id:EPS,qty:3}]});
  assert.equal(noLocation.data.success,true);assert.equal(noLocation.data.executed,1);
  assert.equal(h.rows.InventoryItem.find(i=>i.id===ALPHA).quantity_on_hand,1);
  assert.equal(h.rows.InventoryItem.find(i=>i.id===ALPHA).quantity_reserved,1);
  assert.equal(h.rows.InventoryItem.find(i=>i.location_id===SHELF).quantity_on_hand,3);
  const legacyMove=await h.invoke({transfer_type:'inventory_move',source_location_id:LEGACY,destination_location_id:SHELF,
    batch_id:'quick_assignment_legacy',lines:[{inventory_item_id:BETA,part_id:EPS,qty:4}]});
  assert.equal(legacyMove.data.success,true);assert.equal(h.rows.InventoryItem.find(i=>i.id===BETA).quantity_on_hand,1);
  const total=h.rows.InventoryItem.reduce((acc,i)=>acc+(i.quantity_on_hand||0),0);
  assert.equal(total,9);assert.equal(h.rows.InventoryItem.find(i=>i.location_id===SHELF).quantity_on_hand,7);
  console.log('PASS shop assignment: no-location source guard, legacy location, partial available quantity, reserved units, stock conservation');
}
async function unifiedContentsRegression(){
  const id='7'.repeat(24);
  const h=harness('base44/functions/storageProperty/entry.ts',{storage:{
    StorageContainer:[{id:ALPHA,name:'Test Box',status:'active',active:true,location_id:BETA}],
    StoredProperty:[{id,container_id:ALPHA,name:'Seats',property_type:'miscellaneous',
      condition:'unknown',description:'',notes:'',quantity_known:true,quantity:2,status:'in_storage'}],
    InventoryItem:[{id:GAMMA,part_id:EPS,quantity_on_hand:3,quantity_reserved:1}],
  }});
  const edited=await h.invoke({action:'update_group',container_id:ALPHA,property_id:id,
    name:'Seats and headrests',property_type:'take_off',condition:'used',
    description:'Pair of seat assemblies',notes:'Keep all hardware together',quantity_known:true,quantity:2});
  assert.equal(edited.data.success,true);
  for(const uri of ['files/private/seat-front.jpg','files/private/seat-rear.jpg']){
    const photo=await h.invoke({action:'add_photo',container_id:ALPHA,property_id:id,file_uri:uri});
    assert.equal(photo.data.success,true);
    const retry=await h.invoke({action:'add_photo',container_id:ALPHA,property_id:id,file_uri:uri});
    assert.equal(retry.data.idempotent_hit,true);
  }
  assert.equal(h.rows.StoredProperty.length,1, 'Edit never creates a second property group');
  assert.equal(h.rows.StoredPropertyPhoto.length,2);
  assert.equal(h.rows.StoredProperty[0].description,'Pair of seat assemblies');
  assert.equal(h.rows.StoredProperty[0].name,'Seats and headrests');
  assert.equal(h.rows.InventoryItem[0].quantity_on_hand,3);
  assert.equal(h.rows.InventoryItem[0].quantity_reserved,1);
  assert(!h.calls.some(c=>/^StoredProperty.create|^InventoryItem.(create|update)|^Part.(create|update)/.test(c)));
  const existing=await h.invoke({action:'get_photos',property_id:id});
  assert.equal(existing.data.photos.length,2);
  assert(existing.data.photos.every(p=>p.signed_url));
  console.log('PASS unified contents: update details and add private photos to same group without duplicates or stock writes');
}
(async()=>{await storedPropertyTests();await labelTests();await moveTests();await shopAssignmentTests();await unifiedContentsRegression()})().catch(err=>{console.error(err);process.exitCode=1});
