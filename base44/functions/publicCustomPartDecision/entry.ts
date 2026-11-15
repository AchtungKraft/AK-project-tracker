import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';

// Dedicated client configuration decision. Project token and approver role are checked upstream.
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
  const b=await req.json().catch(()=>null);
  if(!b||!['APPROVED','CHANGES_REQUESTED'].includes(b.decision))return Response.json({error:'Invalid decision'},{status:400});
  const {projectId,token,assignmentId,revisionId,requestId}=b;
  if([projectId,assignmentId,revisionId].some(x=>typeof x!=='string'||!x)||typeof token!=='string'||token.length<12)return Response.json({error:'Valid project access token required'},{status:403});
  const api=createClientFromRequest(req),db=api.asServiceRole.entities;
  const list=async(name,q)=>{const r=await db[name].filter(q);return Array.isArray(r)?r:r.items||[]};
  const access=await list('ProjectClientAccess',{project_id:projectId,share_token:token,access_status:'active'});
  if(access.length!==1||access[0].access_role!=='approver')return Response.json({error:'Approval access denied'},{status:403});
  const [project]=await list('Project',{id:projectId});
  if(!project||project.is_system_project)return Response.json({error:'Project unavailable'},{status:404});
  const [item]=await list('ProjectCustomPart',{id:assignmentId});
  if(!item||item.project_id!==projectId||item.selection_status!=='SUBMITTED')return Response.json({error:'Configuration is not awaiting review'},{status:409});
  const [revision]=await list('ProjectPartSelectionRevision',{id:revisionId});
  if(!revision||revision.project_id!==projectId||revision.project_custom_part_id!==item.id||revision.custom_part_id!==item.custom_part_id||Number(revision.revision_number)!==Number(item.current_revision))return Response.json({error:'Revision changed; reload before deciding'},{status:409});
  if(requestId){
   const [request]=await list('ClientFeedbackRequest',{id:requestId});
   if(!request||request.project_id!==projectId||request.request_type!=='custom_parts_review'||!request.posted_at)return Response.json({error:'Review request unavailable'},{status:403});
   const links=await list('CustomPartReviewRequestItem',{request_id:requestId,project_custom_part_id:assignmentId,revision_id:revisionId});
   if(links.length!==1)return Response.json({error:'Configuration not included in this request'},{status:403});
  }
  const decisions=await list('ProjectPartDecisionEvent',{revision_id:revisionId});
  if(decisions.length)return Response.json({error:'Revision already decided'},{status:409});
  const note=typeof b.note==='string'?b.note.trim().slice(0,4000):'';
  if(b.decision==='CHANGES_REQUESTED'&&!note)return Response.json({error:'Describe the changes requested'},{status:400});
  const event=await db.ProjectPartDecisionEvent.create({project_id:projectId,project_custom_part_id:item.id,revision_id:revisionId,revision_number:revision.revision_number,decision:b.decision,actor_type:'client_contact',actor_id:access[0].client_contact_id,decided_at:new Date().toISOString(),note});
  await db.ProjectCustomPart.update(item.id,{selection_status:b.decision,...(b.decision==='APPROVED'?{approved_revision:revision.revision_number}:{})});
  return Response.json({success:true,decision:b.decision,event_id:event.id},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[publicCustomPartDecision]',e);return Response.json({error:'Decision could not be recorded'},{status:500})}
});
