import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Internal administrative review only. Client portal permissions are NOT delegated here.
// Decision events are append-only through this handler; submitted snapshots are never changed.
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
  const api=createClientFromRequest(req);
  const actor=await api.auth.me().catch(()=>null);
  if(!actor)return Response.json({error:'Authentication required'},{status:401});
  if(actor.role!=='admin')return Response.json({error:'Administrator required'},{status:403});
  const body=await req.json().catch(()=>null);
  if(!body||!['APPROVED','CHANGES_REQUESTED'].includes(body.decision))return Response.json({error:'Invalid decision'},{status:400});
  const {project_id,project_custom_part_id,revision_id}=body;
  if([project_id,project_custom_part_id,revision_id].some(x=>typeof x!=='string'||!x))return Response.json({error:'Missing identifiers'},{status:400});
  const db=api.asServiceRole.entities;
  const list=async(name,filter)=>{const r=await db[name].filter(filter);return Array.isArray(r)?r:r.items||[]};
  const [project]=await list('Project',{id:project_id});
  if(!project||project.is_system_project)return Response.json({error:'Invalid project'},{status:404});
  const [item]=await list('ProjectCustomPart',{id:project_custom_part_id});
  if(!item||item.project_id!==project_id)return Response.json({error:'Assignment does not belong to project'},{status:404});
  if(item.selection_status!=='SUBMITTED')return Response.json({error:'Only submitted configurations can be reviewed'},{status:409});
  const [revision]=await list('ProjectPartSelectionRevision',{id:revision_id});
  if(!revision||revision.project_id!==project_id||revision.project_custom_part_id!==item.id||revision.custom_part_id!==item.custom_part_id||revision.revision_number!==item.current_revision)return Response.json({error:'Stale or mismatched revision'},{status:409});
  const events=await list('ProjectPartDecisionEvent',{revision_id});
  if(events.length)return Response.json({error:'Revision already decided'},{status:409});
  const note=typeof body.note==='string'?body.note.trim().slice(0,4000):'';
  if(body.decision==='CHANGES_REQUESTED'&&!note)return Response.json({error:'Explain the requested changes'},{status:400});
  const event=await db.ProjectPartDecisionEvent.create({project_id,project_custom_part_id,revision_id,revision_number:revision.revision_number,decision:body.decision,actor_type:'internal_admin',actor_id:actor.id,decided_at:new Date().toISOString(),note});
  await db.ProjectCustomPart.update(item.id,{selection_status:body.decision,...(body.decision==='APPROVED'?{approved_revision:revision.revision_number}:{})});
  return Response.json({success:true,decision:body.decision,event_id:event.id});
 }catch(error){console.error('[reviewCustomPartConfiguration]',error);return Response.json({error:'Review failed'},{status:500})}
});
