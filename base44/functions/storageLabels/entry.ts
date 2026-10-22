import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * Storage V2 batch label reservation and activation.
 * This function NEVER creates InventoryItem, Part, PartCommitment or stock mutations.
 * Existing AK_CTR:{container.id} identity is preserved.
 *
 * Nontransactional Base44 writes: retries resume incomplete batches by request_key.
 * Short codes include the generated batch identity, not a racy local counter.
 */
const TYPES = {box:'BOX',tote:'TOTE',bin:'BIN',tray:'TRAY',organizer:'ORG',crate:'CRT',cart:'CART',kit:'KIT',other:'CTR'};
const json = (payload, status=200) => Response.json(payload, {status});

Deno.serve(async (req) => {
  let db;
  try {
    if (req.method !== 'POST') return json({error:'Method not allowed'},405);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({error:'Unauthorized'},401);

    db = base44.asServiceRole;
    const isAdmin = user.role === 'admin';
    let isStaff = isAdmin;
    if (!isStaff) {
      const membership = await db.entities.TeamMember.filter({user_id:user.id});
      isStaff = membership.some(m => m.active !== false && m.is_achtung_kraft_member === true);
    }
    if (!isStaff) return json({error:'AK staff access required'},403);

    const input = await req.json();
    const action = input?.action;
    if (action === 'generate') {
      if (!isAdmin) return json({error:'Admin permission required to print new labels'},403);
      const count = input.count;
      const type = input.container_type || 'box';
      const requestKey = input.request_key;
      if (!Number.isInteger(count) || count < 1 || count > 50) return json({error:'Count must be an integer from 1 to 50'},400);
      if (!Object.prototype.hasOwnProperty.call(TYPES,type)) return json({error:'Invalid container type'},400);
      if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestKey)) return json({error:'Valid request key required'},400);

      // On a network retry, finish the same batch rather than reserving new IDs.
      let [batch] = await db.entities.StorageLabelBatch.filter({request_key:requestKey});
      if (batch && (batch.requested_count !== count || batch.container_type !== type)) {
        return json({error:'Request key already used for another batch'},409);
      }
      if (!batch) {
        batch = await db.entities.StorageLabelBatch.create({
          request_key:requestKey, container_type:type, requested_count:count,
          status:'generating', generated_by:user.id, generated_at:new Date().toISOString(),
          container_ids:[],
        });
      }

      const batchTag = batch.id.slice(-10).toUpperCase();
      const prefix = TYPES[type];
      const existing = await db.entities.StorageContainer.filter({label_batch_id:batch.id});
      const byCode = new Map(existing.map(c => [c.short_code,c]));
      const labels = [];

      try {
        for (let index = 1; index <= count; index++) {
          const shortCode = `${prefix}-${batchTag}-${String(index).padStart(3,'0')}`;
          let c = byCode.get(shortCode);
          if (!c) {
            // Fail safely if a surprising short-code conflict exists.
            const collisions = await db.entities.StorageContainer.filter({short_code:shortCode});
            if (collisions.length) throw new Error('Label number collision: ' + shortCode);
            c = await db.entities.StorageContainer.create({
              name:shortCode, container_type:type, short_code:shortCode,
              label_batch_id:batch.id, label_state:'reserved',
              status:'reserved', active:false,
            });
          }
          const qr = `AK_CTR:${c.id}`;
          if (c.qr_code_value !== qr) {
            c = await db.entities.StorageContainer.update(c.id, {qr_code_value:qr});
          }
          labels.push({id:c.id,short_code:shortCode,qr_code_value:qr,container_type:type});
        }
        await db.entities.StorageLabelBatch.update(batch.id,{
          container_ids:labels.map(c=>c.id), status:'ready', batch_code:`${prefix}-${batchTag}`,
        });
      } catch (e) {
        await db.entities.StorageLabelBatch.update(batch.id,{
          status:'partial',container_ids:labels.map(c=>c.id),
        });
        return json({error:'Batch partially reserved. Retry Generate to complete without reusing labels.',details:e.message,batch_id:batch.id,reserved_count:labels.length},503);
      }
      return json({success:true,batch_id:batch.id,batch_code:`${prefix}-${batchTag}`,labels});
    }

    if (action === 'list_batches') {
      if (!isAdmin) return json({error:'Admin permission required'},403);
      const batches = await db.entities.StorageLabelBatch.list('-created_date',20);
      return json({success:true,batches:batches.map(b=>({
        id:b.id,batch_code:b.batch_code,requested_count:b.requested_count,
        status:b.status,container_type:b.container_type,generated_at:b.generated_at,
      }))});
    }

    if (action === 'get_batch') {
      if (!isAdmin) return json({error:'Admin permission required'},403);
      if (typeof input.batch_id !== 'string') return json({error:'batch_id required'},400);
      const [batch] = await db.entities.StorageLabelBatch.filter({id:input.batch_id});
      if (!batch) return json({error:'Batch not found'},404);
      const containers = await db.entities.StorageContainer.filter({label_batch_id:batch.id});
      return json({success:true,batch_id:batch.id,batch_code:batch.batch_code,
        labels:containers
          .filter(c=>c.label_state !== 'voided')
          .sort((a,b)=>(a.short_code||'').localeCompare(b.short_code||''))
          .map(c=>({id:c.id,short_code:c.short_code,qr_code_value:c.qr_code_value,container_type:c.container_type,label_state:c.label_state}))});
    }

    if (action === 'lookup') {
      const qr = input.qr_value;
      const match = typeof qr === 'string' ? /^AK_CTR:([a-fA-F0-9]{24})$/.exec(qr.trim()) : null;
      if (!match) return json({error:'Not a recognized container QR'},400);
      const [c] = await db.entities.StorageContainer.filter({id:match[1]});
      if (!c) return json({error:'No container associated with this QR'},404);
      if (c.label_state === 'reserved' && c.status === 'reserved' && c.active === false) {
        return json({success:true,reserved:true,container:{id:c.id,short_code:c.short_code,container_type:c.container_type}});
      }
      if (c.status === 'archived' || c.label_state === 'voided' || c.active === false) {
        return json({error:'Container is not active'},409);
      }
      return json({success:true,reserved:false,container:{
        id:c.id,name:c.name,short_code:c.short_code,container_type:c.container_type,
        location_id:c.location_id,project_id:c.project_id,client_account_id:c.client_account_id,
        active:c.active,status:c.status,qr_code_value:c.qr_code_value,
      }});
    }

    if (action === 'activate') {
      const {container_id, project_id, location_id} = input;
      if (![container_id,project_id,location_id].every(x=>typeof x==='string'&&x.length>0)) {
        return json({error:'Container, project and location are required'},400);
      }
      const [container] = await db.entities.StorageContainer.filter({id:container_id});
      if (!container) return json({error:'Container not found'},404);
      if (container.label_state !== 'reserved' || container.status !== 'reserved' || container.active !== false) {
        return json({error:'Label already activated or unavailable. Refresh scan before changing its assignment.'},409);
      }
      const [project] = await db.entities.Project.filter({id:project_id});
      const [location] = await db.entities.Location.filter({id:location_id});
      if (!project) return json({error:'Project not found'},404);
      if (!location || location.active === false) return json({error:'Location not active'},400);
      if (location.project_id && location.project_id !== project.id) {
        return json({error:'This location is assigned to a different project'},409);
      }
      const name = typeof input.name==='string' ? input.name.trim().slice(0,100) : '';
      const now = new Date().toISOString();

      // Check again immediately before writing (DB-level CAS is not available).
      const [fresh] = await db.entities.StorageContainer.filter({id:container_id});
      if (fresh.label_state !== 'reserved' || fresh.active !== false) return json({error:'Label has already been activated'},409);

      const updated = await db.entities.StorageContainer.update(container_id,{
        name:name || container.short_code || 'Storage Box',
        project_id:project.id,client_account_id:project.client_account_id || null,
        location_id:location.id,status:'active',active:true,label_state:'activated',
        label_activated_at:now,label_activated_by:user.id,
      });
      let auditRecorded = true;
      try {
        await db.entities.StorageCustodyEvent.create({
          event_type:'activate_label',container_id,client_account_id:project.client_account_id || null,
          project_id:project.id,to_location_id:location.id,performed_by:user.id,performed_at:now,
          action_key:`activate_label_${container_id}`,
          notes:'Activated preprinted container identity',
        });
      } catch (_auditError) { auditRecorded = false; }
      return json({success:true,container:updated,audit_recorded:auditRecorded});
    }
    return json({error:'Unknown action'},400);
  } catch (err) {
    return json({error:err?.message || 'Unexpected storage label failure'},500);
  }
});