import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog,DialogContent,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Camera,Images,Loader2,X,ShieldCheck,CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { uploadAndRegisterPropertyPhoto, uploadErrorDetail } from "@/lib/storagePhotoUpload";

const TYPES=[
  ['unidentified','Unidentified contents'],['miscellaneous','Miscellaneous group'],
  ['take_off','Take-off parts'],['client_supplied','Client supplied'],
  ['spare','Spare property'],['other','Other'],
];
const unwrap=(r)=>r?.data||r;

export default function PropertyIntakeModal({ container, existingGroup = null, onClose, onSaved }) {
  const [name,setName]=useState(existingGroup?.name || '');
  const [type,setType]=useState(existingGroup?.property_type || 'unidentified');
  const [notes,setNotes]=useState(existingGroup?.description || '');
  const [quantity,setQuantity]=useState(existingGroup?.quantity_known ? String(existingGroup.quantity) : '');
  const [files,setFiles]=useState([]);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState('');
  const [group,setGroup]=useState(existingGroup);
  const [doneCount,setDoneCount]=useState(0);
  const intakeKey=useRef(crypto.randomUUID().replace(/-/g,''));
  const cameraRef=useRef(null);
  const galleryRef=useRef(null);
  const filesRef=useRef([]);
  useEffect(()=>{
    filesRef.current=files;
  },[files]);
  useEffect(()=>()=>{filesRef.current.forEach(x=>URL.revokeObjectURL(x.preview));},[]);

  const addFiles=useCallback((incoming)=>{
    const candidates=Array.from(incoming||[]);
    const accepted=candidates.filter(f=>f.type.startsWith('image/')&&f.size<=20*1024*1024);
    if(accepted.length<candidates.length)toast.error('Only images up to 20 MB are supported');
    setFiles(old=>{
      const slots=Math.max(0,25-old.length);
      if(accepted.length>slots)toast.error('Limit 25 images per intake session');
      return [...old,...accepted.slice(0,slots).map(f=>({
        file:f,preview:URL.createObjectURL(f),uri:null,saved:false,error:null,stage:'ready',
      }))];
    });
  },[]);
  const remove=(idx)=>{
    if(busy)return;
    setFiles(old=>{
      const copy=[...old];
      URL.revokeObjectURL(copy[idx].preview);
      copy.splice(idx,1);
      return copy;
    });
  };
  const save=async ()=>{
    if(busy||(!files.length&&(!name.trim()||!!group)))return;
    setBusy(true);
    try{
      let created=group;
      if(!created){
        const result=unwrap(await base44.functions.invoke('storageProperty',{
          action:'create_group',container_id:container.id,intake_key:intakeKey.current,
          name:name.trim()||'Unidentified contents',property_type:type,
          description:notes.trim(),quantity_known:quantity.trim()!=='',
          quantity:quantity.trim()===''?null:Number(quantity),
        }));
        if(result.error||!result.success)throw new Error(result.error||'Property intake failed');
        created=result.item;
      }
      if(!created?.id)throw new Error('Property group could not be created');
      setGroup(created);
      let successful=files.filter(f=>f.saved).length;
      let failed=0;
      // Serial uploads avoid the mobile memory spikes observed in earlier Storage workflows.
      for(let i=0;i<files.length;i++){
        let current=files[i];
        if(current.saved)continue;
        setProgress(`Photograph ${i+1} of ${files.length}`);
        try{
          const uploaded=await uploadAndRegisterPropertyPhoto({
            file:current.file,
            existingUri:current.uri,
            containerId:container.id,
            propertyId:created.id,
            captureBatchId:intakeKey.current,
            uploadPrivate:(payload)=>base44.integrations.Core.UploadPrivateFile(payload),
            invokeProperty:(payload)=>base44.functions.invoke('storageProperty',payload),
            onUploaded:(uri)=>setFiles(prev=>prev.map((f,n)=>n===i?{...f,uri,error:null,stage:'register'}:f)),
            onStage:(stage)=>setFiles(prev=>prev.map((f,n)=>n===i?{...f,stage,error:null}:f)),
          });
          successful++;
          setFiles(prev=>prev.map((f,n)=>n===i?{...f,uri:uploaded.uri,saved:true,error:null,stage:'done'}:f));
        }catch(err){
          failed++;
          const info=uploadErrorDetail(err,err.stage||'upload');
          setFiles(prev=>prev.map((f,n)=>n===i?{...f,error:info,stage:'failed'}:f));
        }
      }
      setDoneCount(successful);
      onSaved?.();
      if(!failed){
        toast.success(`Saved ${successful} photo${successful===1?'':'s'} in ${container.short_code||container.name}`);
        onClose();
      }else{
        toast.error(`${failed} photo${failed===1?'':'s'} failed. The property group is safe. Check the error below and retry.`,{duration:9000});
      }
    }catch(error){toast.error(error.message||'Could not save intake group');}
    finally{setBusy(false);setProgress('');}
  };

  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}>
    <DialogContent className="bg-gray-900 text-white border-gray-700 w-[calc(100vw-16px)] max-w-xl max-h-[90dvh] flex flex-col overflow-hidden p-4 sm:p-6">
      <DialogHeader><DialogTitle>{existingGroup ? 'Add Photos to Property' : 'Document Box'}: {container.short_code||container.name}</DialogTitle></DialogHeader>
      <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
        <p className="text-xs text-gray-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-green-400"/>Private photos and stored property only. This does not alter Parts Tracker stock, purchases or reservations.
        </p>
        <div><Label>Contents (optional)</Label><Input value={name} disabled={!!group} onChange={e=>setName(e.target.value)}
          className="mt-1" placeholder="Unidentified contents / bag of hardware"/></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Type</Label><Select value={type} onValueChange={setType} disabled={!!group}>
            <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>
              {TYPES.map(([id,label])=><SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent></Select></div>
          <div><Label>Quantity (optional)</Label><Input inputMode="numeric" type="number" min="1" max="99999"
            disabled={!!group} value={quantity} onChange={e=>setQuantity(e.target.value)} className="mt-1" placeholder="Unknown"/></div>
        </div>
        <div><Label>Notes (optional)</Label><Textarea rows={2} disabled={!!group} value={notes} onChange={e=>setNotes(e.target.value)}
          placeholder="Condition, observations or contents" className="mt-1"/></div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={busy||files.length>=25}
            onClick={()=>cameraRef.current?.click()} className="flex-1 h-11 gap-1"><Camera className="w-4 h-4"/> Take Photo</Button>
          <Button type="button" variant="outline" disabled={busy||files.length>=25}
            onClick={()=>galleryRef.current?.click()} className="flex-1 h-11 gap-1"><Images className="w-4 h-4"/> Choose Photos</Button>
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment"
            onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>
          <input ref={galleryRef} hidden type="file" accept="image/*" multiple
            onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>
        </div>
        {files.length>0&&<div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {files.map((f,i)=><div key={f.preview} className="relative aspect-square rounded border border-gray-700 overflow-hidden">
            <img src={f.preview} className="w-full h-full object-cover" alt={`Capture ${i+1}`}/>
            {f.saved&&<CheckCircle2 className="absolute bottom-1 right-1 w-5 h-5 text-green-400 drop-shadow"/>}
            {f.error&&<div className="absolute inset-x-0 bottom-0 bg-red-900/90 text-[9px] p-1">{f.error.stage==='register'?'Save failed':'Upload failed'}</div>}
            {busy&&!f.saved&&f.stage!=='failed'&&<div className="absolute inset-x-0 top-0 bg-black/70 text-[9px] p-1">{f.stage==='register'?'Registering…':'Uploading…'}</div>}
            {!f.saved&&!busy&&<button type="button" onClick={()=>remove(i)}
              className="absolute top-1 right-1 rounded-full bg-black/70 p-1" aria-label="Remove photo">
              <X className="w-4 h-4"/></button>}
          </div>)}
        </div>}
        {files.some(f=>f.error)&&<div role="alert" className="rounded-md border border-red-800/70 bg-red-950/25 p-3 space-y-2">
          <p className="text-xs text-red-200 font-semibold">Photo save failed — existing property group is preserved.</p>
          {files.map((f,i)=>f.error&&<p key={f.preview} className="text-xs text-red-200 break-words">
            Photo {i+1} · {f.error.stage==='register'?'Registration':'Private upload'}{f.error.status?' (HTTP '+f.error.status+')':''}: {f.error.message}
          </p>)}
          <p className="text-xs text-gray-400">Retry below. Already-uploaded files are reused when registration fails, so new copies are not created unnecessarily.</p>
        </div>}
        {group&&<p className="text-xs text-gray-400">{existingGroup ? 'Adding to existing group.' : 'Group saved.'} {doneCount} photos uploaded in this session. Failed photos can be retried. Closing does not remove saved property.</p>
      </div>
      <div className="border-t border-gray-700 pt-3 shrink-0 space-y-2" style={{paddingBottom:'env(safe-area-inset-bottom, 0px)'}}>
        {busy&&<p className="text-xs text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>{progress||'Saving group…'}</p>}
        <Button disabled={busy||(!files.length&&(!name.trim()||!!group))} onClick={save} className="w-full h-12">
          {busy?'Saving…':group?`Save / Retry Photos (${files.filter(f=>!f.saved).length} remaining)`:`Save Intake (${files.length} photo${files.length===1?'':'s'})`}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onClose} className="w-full h-9">Close</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
