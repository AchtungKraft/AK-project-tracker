import React,{useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {toast} from 'sonner';

export default function SharedOptionPresets({partId=null,admin=false}){
 const qc=useQueryClient();
 const [name,setName]=useState(''),[lines,setLines]=useState(''),[chosen,setChosen]=useState(''),[enabled,setEnabled]=useState([]),[required,setRequired]=useState(false),[busy,setBusy]=useState(false);
 const {data:presets=[]}=useQuery({queryKey:['custom-option-presets'],queryFn:()=>base44.entities.CustomPartOptionPreset.list(),enabled:admin});
 const preset=presets.find(p=>p.id===chosen);
 const active=(preset?.choices||[]).filter(c=>c.active!==false);
 const selectPreset=id=>{setChosen(id);const p=presets.find(x=>x.id===id);setEnabled((p?.choices||[]).filter(c=>c.active!==false).map(c=>c.id))};
 const run=async fn=>{setBusy(true);try{await fn();await Promise.all([qc.invalidateQueries({queryKey:['custom-option-presets']}),qc.invalidateQueries({queryKey:['config-options']})]);toast.success('Shared options saved')}catch(e){toast.error(e?.message||'Unable to save options')}finally{setBusy(false)}};
 if(!admin)return null;
 return <section className="rounded-lg border border-gray-700 p-3 space-y-3"><h3 className="font-semibold">{partId?'Add options from shared library':'Shared option libraries'}</h3><p className="text-xs text-gray-400">Maintain reusable choices such as surface finish, color, and material. Each part receives its own selected subset; editing a shared library never silently changes submitted configurations.</p>
 {!partId&&<div className="space-y-2"><Input placeholder="Shared option name (e.g. Surface Finish)" value={name} onChange={e=>setName(e.target.value)}/><Textarea placeholder="Available choices, one per line" value={lines} onChange={e=>setLines(e.target.value)}/><Button disabled={busy||!name.trim()||!lines.trim()} onClick={()=>run(async()=>{const labels=[...new Set(lines.split('\n').map(x=>x.trim()).filter(Boolean))];await base44.entities.CustomPartOptionPreset.create({name:name.trim(),status:'ACTIVE',choices:labels.map((label,i)=>({id:'preset_'+Date.now()+'_'+i,label,active:true}))});setName('');setLines('')})}>Create shared option library</Button></div>}
 <select className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm" value={chosen} onChange={e=>selectPreset(e.target.value)}><option value="">Choose a shared option library</option>{presets.filter(p=>p.status!=='ARCHIVED').map(p=><option key={p.id} value={p.id}>{p.name} ({(p.choices||[]).filter(c=>c.active!==false).length} choices)</option>)}</select>
 {preset&&<div className="space-y-2">{partId?<><p className="text-xs text-gray-400">Select only the choices available for this part:</p>{active.map(c=><label key={c.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={enabled.includes(c.id)} onChange={e=>setEnabled(old=>e.target.checked?[...old,c.id]:old.filter(x=>x!==c.id))}/>{c.label}</label>)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={required} onChange={e=>setRequired(e.target.checked)}/>Required selection</label><Button disabled={busy||!enabled.length} onClick={()=>run(async()=>{const selected=active.filter(c=>enabled.includes(c.id)).map(c=>({...c,id:'choice_'+crypto.randomUUID()}));await base44.entities.CustomPartOptionGroup.create({custom_part_id:partId,name:preset.name,required,selection_mode:'single',choices:selected});setChosen('');setEnabled([])})}>Add selected options to this part</Button></>:<><div className="text-sm text-gray-300">{active.map(c=>c.label).join(' · ')||'No active choices'}</div><Textarea aria-label="Edit shared option choices" value={lines} onChange={e=>setLines(e.target.value)} placeholder="Replace choices, one per line"/><Button disabled={busy||!lines.trim()} variant="outline" onClick={()=>run(async()=>{const labels=[...new Set(lines.split('\n').map(x=>x.trim()).filter(Boolean))];const old=preset.choices||[];const next=labels.map((label,i)=>old.find(c=>c.label===label)||{id:'preset_'+Date.now()+'_'+i,label,active:true});await base44.entities.CustomPartOptionPreset.update(preset.id,{choices:[...next,...old.filter(c=>!labels.includes(c.label)).map(c=>({...c,active:false}))]});setChosen('');setLines('')})}>Update shared library for future use</Button></>}</div>}
 </section>;
}
