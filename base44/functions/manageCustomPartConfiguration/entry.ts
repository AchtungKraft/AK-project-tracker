import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Internal-only configuration mutations. Client-facing access is deliberately NOT enabled.
Deno.serve(async req => {
 try {
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
  const api=createClientFromRequest(req);
  const actor=await api.auth.me().catch(()=>null);
  if(!actor)return Response.json({error:'Authentication required'},{status:401});
  if(actor.role!=='admin')return Response.json({error:'Administrator required'},{status:403});
  const body=await req.json().catch(()=>null);
  if(!body||!['assign','save_draft','submit_internal','start_revision'].includes(body.action))return Response.json({error:'Invalid action'},{status:400});
  const db=api.asServiceRole.entities;
  const projectId=body.project_id;
  if(typeof projectId!=='string'||!projectId)return Response.json({error:'Project required'},{status:400});
  const projects=await db.Project.filter({id:projectId});
  const project=Array.isArray(projects)?projects[0]:projects.items?.[0];
  if(!project||project.is_system_project)return Response.json({error:'Invalid project'},{status:404});
  const list=async(name,query)=>{const result=await db[name].filter(query);return Array.isArray(result)?result:(result.items||[])};
  if(body.action==='assign'){
   if(!Array.isArray(body.custom_part_ids)||body.custom_part_ids.length===0||body.custom_part_ids.length>100)return Response.json({error:'Select 1-100 parts'},{status:400});
   const ids=[...new Set(body.custom_part_ids)];
   if(ids.some(id=>typeof id!=='string'||!id))return Response.json({error:'Invalid part ID'},{status:400});
   const existing=await list('ProjectCustomPart',{project_id:projectId});
   const known=new Set(existing.map(x=>x.custom_part_id));
   const definitions=await list('CustomPartDefinition',{});
   const eligible=new Set(definitions.filter(p=>p.status==='ACTIVE').map(p=>p.id));
   if(ids.some(id=>!eligible.has(id)))return Response.json({error:'Part not active or unavailable'},{status:400});
   let added=0;
   for(const id of ids){if(known.has(id))continue;await db.ProjectCustomPart.create({project_id:projectId,custom_part_id:id,selected_options:{},selection_status:'NOT_SELECTED'});known.add(id);added++}
   return Response.json({success:true,added});
  }
  const itemId=body.project_custom_part_id;
  if(typeof itemId!=='string'||!itemId)return Response.json({error:'Assignment required'},{status:400});
  const items=await list('ProjectCustomPart',{id:itemId});
  const item=items[0];
  if(!item||item.project_id!==projectId)return Response.json({error:'Assignment not found in project'},{status:404});
  if(body.action==='start_revision'){
   if(item.selection_status!=='CHANGES_REQUESTED')return Response.json({error:'Only changes-requested configurations can start a revision.'},{status:409});
   const previous=await list('ProjectPartSelectionRevision',{project_custom_part_id:itemId});
   const latest=previous.find(r=>r.revision_number===item.current_revision);
   if(!latest)return Response.json({error:'Current revision not found'},{status:409});
   const decisions=await list('ProjectPartDecisionEvent',{revision_id:latest.id});
   if(decisions.length!==1||decisions[0].decision!=='CHANGES_REQUESTED')return Response.json({error:'A verified change request is required'},{status:409});
   await db.ProjectCustomPart.update(itemId,{selection_status:'DRAFT'});
   return Response.json({success:true,status:'DRAFT',previous_revision:item.current_revision});
  }
  if(['APPROVED','SUBMITTED','CHANGES_REQUESTED'].includes(item.selection_status))return Response.json({error:'Submitted or decided configurations are locked.'},{status:409});
  const definitions=await list('CustomPartDefinition',{id:item.custom_part_id});
  const part=definitions[0];
  if(!part)return Response.json({error:'Part definition unavailable'},{status:404});
  const groups=await list('CustomPartOptionGroup',{custom_part_id:item.custom_part_id});
  const incoming=body.selected_options;
  if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))return Response.json({error:'Invalid selections'},{status:400});
  const known=new Map(groups.map(g=>[g.id,g]));
  const selections={};
  for(const [groupId,value] of Object.entries(incoming)){
   const group=known.get(groupId);
   if(!group)return Response.json({error:'Unknown option group'},{status:400});
   if(value===null||value==='')continue;
   if(typeof value!=='string')return Response.json({error:'Invalid option value'},{status:400});
   const choice=(group.choices||[]).find(c=>c.id===value);
   if(!choice)return Response.json({error:'Option not found'},{status:400});
   if(choice.active===false&&item.selected_options?.[groupId]!==value)return Response.json({error:'Retired option cannot be newly selected'},{status:400});
   selections[groupId]=value;
  }
  if(body.action==='save_draft'){
   await db.ProjectCustomPart.update(itemId,{selected_options:selections,selection_status:'DRAFT'});
   return Response.json({success:true,status:'DRAFT'});
  }
  const missing=groups.filter(g=>g.required&&!selections[g.id]).map(g=>g.name);
  if(missing.length)return Response.json({error:'Required selections missing',missing},{status:400});
  if(item.selection_status==='SUBMITTED')return Response.json({error:'Already submitted'},{status:409});
  const revisions=await list('ProjectPartSelectionRevision',{project_custom_part_id:itemId});
  const latestNumber=Math.max(0,...revisions.map(r=>Number(r.revision_number)||0));
  if(latestNumber){
   const latest=revisions.find(r=>r.revision_number===latestNumber);
   const decisions=await list('ProjectPartDecisionEvent',{revision_id:latest.id});
   if(decisions.length!==1||decisions[0].decision!=='CHANGES_REQUESTED')return Response.json({error:'Previous revision must have a recorded change request'},{status:409});
  }
  const snapshot={part:{id:part.id,name:part.name,category:part.category,description:part.description,reference_images:part.reference_images||[]},options:groups.map(g=>({group_id:g.id,name:g.name,required:!!g.required,choice_id:selections[g.id]||null,choice:(g.choices||[]).find(c=>c.id===selections[g.id])||null}))};
  const now=new Date().toISOString();
  const revision=await db.ProjectPartSelectionRevision.create({project_id:projectId,project_custom_part_id:itemId,custom_part_id:item.custom_part_id,revision_number:latestNumber+1,snapshot,state:'SUBMITTED',submitted_at:now,submitted_by:actor.id});
  await db.ProjectCustomPart.update(itemId,{selected_options:selections,selection_status:'SUBMITTED',current_revision:latestNumber+1});
  return Response.json({success:true,status:'SUBMITTED',revision_id:revision.id});
 }catch(error){console.error('[manageCustomPartConfiguration]',error);return Response.json({error:'Configuration operation failed'},{status:500})}
});
