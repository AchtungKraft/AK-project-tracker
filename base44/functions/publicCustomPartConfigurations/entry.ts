import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';

// Client-facing, read-only configuration review. Explicit project share token required.
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
  const {projectId,token}=await req.json().catch(()=>({}));
  if(typeof projectId!=='string'||!projectId||typeof token!=='string'||token.length<12)return Response.json({error:'Project access token required'},{status:403});
  const api=createClientFromRequest(req),db=api.asServiceRole.entities;
  const list=async(name,q)=>{const r=await db[name].filter(q);return Array.isArray(r)?r:r.items||[]};
  const accesses=await list('ProjectClientAccess',{project_id:projectId,share_token:token,access_status:'active'});
  if(accesses.length!==1)return Response.json({error:'Access denied'},{status:403});
  const [project]=await list('Project',{id:projectId});
  if(!project||project.is_system_project)return Response.json({error:'Project not found'},{status:404});
  const assigned=await list('ProjectCustomPart',{project_id:projectId});
  const submitted=assigned.filter(x=>['SUBMITTED','APPROVED','CHANGES_REQUESTED'].includes(x.selection_status));
  const result=[];
  for(const item of submitted){
   const revisions=await list('ProjectPartSelectionRevision',{project_custom_part_id:item.id});
   const latest=revisions.find(r=>Number(r.revision_number)===Number(item.current_revision));
   if(!latest||latest.project_id!==projectId)continue;
   const events=await list('ProjectPartDecisionEvent',{revision_id:latest.id});
   const decision=events[0]||null;
   result.push({id:item.id,status:item.selection_status,revision_id:latest.id,revision_number:latest.revision_number,snapshot:latest.snapshot,submitted_at:latest.submitted_at,decision:decision?{decision:decision.decision,note:decision.note||'',decided_at:decision.decided_at}:null});
  }
  return Response.json({success:true,can_approve:accesses[0].access_role==='approver',items:result},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[publicCustomPartConfigurations]',e);return Response.json({error:'Unable to load configurations'},{status:500})}
});
