import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
  const api=createClientFromRequest(req),actor=await api.auth.me().catch(()=>null);
  if(actor?.role!=='admin')return Response.json({error:'Administrator required'},{status:403});
  const b=await req.json().catch(()=>({})),db=api.asServiceRole.entities;
  const list=async(n,q)=>{const r=await db[n].filter(q);return Array.isArray(r)?r:r.items||[]};
  const [request]=await list('ClientFeedbackRequest',{id:b.requestId});
  if(!request||request.request_type!=='custom_parts_review')return Response.json({error:'Invalid review request'},{status:404});
  const projectId=request.project_id;
  const existing=await list('CustomPartReviewRequestItem',{request_id:request.id});
  if(b.action==='list'){
   const assignments=await list('ProjectCustomPart',{project_id:projectId});
   const defs=await list('CustomPartDefinition',{});
   const rows=await Promise.all(assignments.map(async item=>{
    const revs=await list('ProjectPartSelectionRevision',{project_custom_part_id:item.id});
    const revision=revs.find(r=>Number(r.revision_number)===Number(item.current_revision));
    const linked=existing.find(x=>x.project_custom_part_id===item.id);
    return {id:item.id,name:defs.find(d=>d.id===item.custom_part_id)?.name||'Custom part',status:item.selection_status,revision_id:revision?.id||null,revision_number:revision?.revision_number||null,snapshot:revision?.snapshot||null,linked_revision_id:linked?.revision_id||null};
   }));
   return Response.json({success:true,posted:!!request.posted_at,items:rows});
  }
  if(b.action!=='select'||request.posted_at||request.status!=='draft')return Response.json({error:'Selection is locked or invalid'},{status:409});
  if(!Array.isArray(b.assignmentIds)||b.assignmentIds.length>100||new Set(b.assignmentIds).size!==b.assignmentIds.length)return Response.json({error:'Invalid selection'},{status:400});
  const assignments=await list('ProjectCustomPart',{project_id:projectId});
  const chosen=[];
  for(const id of b.assignmentIds){
   const item=assignments.find(x=>x.id===id);
   if(!item||item.selection_status!=='SUBMITTED')return Response.json({error:'Only submitted configurations may be selected'},{status:409});
   const revs=await list('ProjectPartSelectionRevision',{project_custom_part_id:id});
   const revision=revs.find(r=>Number(r.revision_number)===Number(item.current_revision));
   if(!revision||revision.project_id!==projectId)return Response.json({error:'Submitted revision missing'},{status:409});
   chosen.push({project_id:projectId,request_id:request.id,project_custom_part_id:id,revision_id:revision.id,revision_number:revision.revision_number});
  }
  for(const x of existing)await db.CustomPartReviewRequestItem.delete(x.id);
  for(const x of chosen)await db.CustomPartReviewRequestItem.create(x);
  return Response.json({success:true,selected:chosen.length});
 }catch(e){console.error('[manageCustomPartsReviewRequest]',e);return Response.json({error:'Unable to manage review selection'},{status:500})}
});
