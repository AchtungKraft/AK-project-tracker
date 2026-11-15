import React,{useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {toast} from 'sonner';

export default function ConfigurationReview({projectId,assignment,admin}){
 const qc=useQueryClient();const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
 const {data:revisions=[],isLoading}=useQuery({queryKey:['config-revisions',assignment.id],enabled:!!admin,queryFn:()=>base44.entities.ProjectPartSelectionRevision.filter({project_custom_part_id:assignment.id})});
 const {data:events=[]}=useQuery({queryKey:['config-decisions',assignment.id],enabled:!!admin,queryFn:()=>base44.entities.ProjectPartDecisionEvent.filter({project_custom_part_id:assignment.id})});
 const current=revisions.find(r=>Number(r.revision_number)===Number(assignment.current_revision));
 const decided=events.some(e=>e.revision_id===current?.id);
 const decide=async decision=>{
  if(busy||!current||decided)return;
  setBusy(true);
  try{
   const raw=await base44.functions.invoke('reviewCustomPartConfiguration',{project_id:projectId,project_custom_part_id:assignment.id,revision_id:current.id,decision,note});
   const data=raw?.data||raw;
   if(data?.success!==true)throw new Error(data?.error||'Review failed');
   await Promise.all([qc.invalidateQueries({queryKey:['config-assigned']}),qc.invalidateQueries({queryKey:['config-decisions',assignment.id]})]);
   setNote('');toast.success('Review decision recorded');
  }catch(e){toast.error(e?.message||'Review failed')}finally{setBusy(false)}
 };
 if(!admin)return null;
 return <section className="border-t border-gray-700 pt-3 space-y-3"><h3 className="font-semibold">Internal revision history</h3>{isLoading?<p className="text-sm text-gray-400">Loading history…</p>:revisions.length===0?<p className="text-sm text-gray-400">No submitted revisions yet.</p>:revisions.slice().sort((a,b)=>Number(b.revision_number)-Number(a.revision_number)).map(r=>{const decision=events.find(e=>e.revision_id===r.id);return <div key={r.id} className="rounded border border-gray-700 p-3 space-y-1 text-sm"><div className="font-medium">Revision {r.revision_number} · {decision?.decision||'SUBMITTED'}</div><div className="text-xs text-gray-400">Submitted {r.submitted_at?new Date(r.submitted_at).toLocaleString():'—'}</div><div className="text-xs">{r.snapshot?.part?.name}</div>{(r.snapshot?.options||[]).map((o,i)=><div key={o.group_id||i} className="text-xs text-gray-300">{o.name}: {o.choice?.label||'—'}</div>)}{decision?.note&&<p className="text-xs text-amber-300">Review note: {decision.note}</p>}</div>})}
 {assignment.selection_status==='SUBMITTED'&&current&&!decided&&<div className="rounded border border-gray-600 p-3 space-y-2"><h4 className="font-medium text-sm">Review current submission</h4><Textarea placeholder="Review note (required when requesting changes)" value={note} onChange={e=>setNote(e.target.value)}/><div className="flex gap-2 flex-wrap"><Button size="sm" disabled={busy} onClick={()=>decide('APPROVED')}>Approve configuration</Button><Button size="sm" variant="outline" disabled={busy||!note.trim()} onClick={()=>decide('CHANGES_REQUESTED')}>Request changes</Button></div><p className="text-xs text-gray-400">Internal review only. This does not grant client approval or create purchasing demand.</p></div>}</section>;
}
