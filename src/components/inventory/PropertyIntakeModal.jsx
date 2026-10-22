import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Images, Loader2, X, ShieldCheck, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { uploadAndRegisterPropertyPhoto, uploadErrorDetail } from "@/lib/storagePhotoUpload";
import { prepareStoragePhotoFile } from "@/lib/storagePhotoPrepare";

const TYPES=[
  ['unidentified','Unidentified contents'],['miscellaneous','Miscellaneous / grouped parts'],
  ['take_off','Take-off parts'],['client_supplied','Client supplied'],
  ['spare','Spare property'],['other','Other'],
];
const CONDITIONS=[['unknown','Not assessed'],['new','New'],['used','Used'],['damaged','Damaged'],['mixed','Mixed']];
const unwrap=r=>r?.data||r;

/**
 * Canonical create/edit workflow for physical property groups.
 * One record owns details + photographs. Editing never creates a second
 * StoredProperty and photographs are never added as InventoryItem/Part stock.
 */
export default function PropertyIntakeModal({container,existingGroup=null,onClose,onSaved}) {
  const editing=Boolean(existingGroup?.id);
  const [name,setName]=useState(existingGroup?.name||'');
  const [type,setType]=useState(existingGroup?.property_type||'unidentified');
  const [condition,setCondition]=useState(existingGroup?.condition||'unknown');
  const [description,setDescription]=useState(existingGroup?.description||'');
  const [notes,setNotes]=useState(existingGroup?.notes||'');
  const [quantity,setQuantity]=useState(existingGroup?.quantity_known?String(existingGroup.quantity):'');
  const [files,setFiles]=useState([]);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState('');
  const [group,setGroup]=useState(existingGroup);
  const [doneCount,setDoneCount]=useState(0);
  const intakeKey=useRef(crypto.randomUUID().replace(/-/g,''));
  const cameraRef=useRef(null);
  const galleryRef=useRef(null);
  const filesRef=useRef([]);
  const queryClient=useQueryClient();
  useEffect(()=>{filesRef.current=files;},[files]);
  useEffect(()=>()=>{filesRef.current.forEach(x=>URL.revokeObjectURL(x.preview));},[]);

  // Fetch existing private photos only for the selected group, not for all boxes.
  const {data:existingPhotos=[],isLoading:photosLoading,error:photosError}=useQuery({
    queryKey:['storedPropertyPhotos',existingGroup?.id],
    enabled:editing,
    staleTime:90_000,refetchOnWindowFocus:false,retry:1,
    queryFn:async()=>{
      const data=unwrap(await base44.functions.invoke('storageProperty',{
        action:'get_photos',property_id:existingGroup.id,
      }));
      if(data.error||!data.success)throw new Error(data.error||'Unable to load existing photos');
      return data.photos||[];
    },
  });

  const quantityKnown=quantity.trim()!=='';
  const numericQuantity=Number(quantity);
  const quantityValid=!quantityKnown||(Number.isFinite(numericQuantity)&&numericQuantity>0&&numericQuantity<=99999);
  const valuesChanged=editing&&(
    name.trim()!==(existingGroup.name||'')||
    type!==(existingGroup.property_type||'unidentified')||
    condition!==(existingGroup.condition||'unknown')||
    description.trim()!==(existingGroup.description||'')||
    notes.trim()!==(existingGroup.notes||'')||
    quantityKnown!==Boolean(existingGroup.quantity_known)||
    (quantityKnown&&numericQuantity!==Number(existingGroup.quantity))
  );
  const pendingCount=files.filter(f=>!f.saved).length;
  const canSave=editing?(valuesChanged||pendingCount>0):Boolean(group||name.trim()||pendingCount>0);

  const addFiles=useCallback(incoming=>{
    const candidates=Array.from(incoming||[]);
    const accepted=candidates.filter(f=>f.type.startsWith('image/')&&f.size<=20*1024*1024);
    if(accepted.length<candidates.length)toast.error('Only image files up to 20 MB are supported');
    setFiles(old=>{
      const slots=Math.max(0,25-old.length);
      if(accepted.length>slots)toast.error('Up to 25 photos per edit session');
      return [...old,...accepted.slice(0,slots).map(f=>({
        file:f,preview:URL.createObjectURL(f),uri:null,saved:false,error:null,stage:'ready',
      }))];
    });
  },[]);

  const remove=index=>{
    if(busy)return;
    setFiles(old=>{
      const next=[...old];
      if(!next[index]||next[index].saved)return old;
      URL.revokeObjectURL(next[index].preview);
      next.splice(index,1);
      return next;
    });
  };

  const save=async()=>{
    if(busy||!canSave||!quantityValid)return;
    if(editing&&!name.trim()){toast.error('Give the stored item a name');return;}
    setBusy(true);
    try{
      let savedGroup=group;
      if(!savedGroup){
        setProgress('Saving stored-property group…');
        const response=unwrap(await base44.functions.invoke('storageProperty',{
          action:'create_group',container_id:container.id,intake_key:intakeKey.current,
          name:name.trim()||'Unidentified contents',property_type:type,condition,
          description:description.trim(),notes:notes.trim(),
          quantity_known:quantityKnown,quantity:quantityKnown?numericQuantity:null,
        }));
        if(response.error||!response.success)throw new Error(response.error||'Property intake failed');
        savedGroup=response.item;
        if(!savedGroup?.id)throw new Error('Property group could not be created');
        setGroup(savedGroup);
        onSaved?.();
      }else if(editing&&valuesChanged){
        setProgress('Updating stored-property details…');
        const response=unwrap(await base44.functions.invoke('storageProperty',{
          action:'update_group',container_id:container.id,property_id:savedGroup.id,
          name:name.trim(),property_type:type,condition,
          description:description.trim(),notes:notes.trim(),
          quantity_known:quantityKnown,quantity:quantityKnown?numericQuantity:null,
        }));
        if(response.error||!response.success)throw new Error(response.error||'Could not update contents');
        savedGroup=response.item||savedGroup;
        setGroup(savedGroup);
        onSaved?.();
      }

      let successful=files.filter(f=>f.saved).length,failed=0;
      // Serial operations limit peak memory, preserve individual retries,
      // and make every saved photograph refer to the existing property ID.
      for(let i=0;i<files.length;i++){
        const current=files[i];
        if(current.saved)continue;
        setProgress(`Saving photo ${i+1} of ${files.length}…`);
        try{
          let uploadFile=current.file;
          if(!current.uri&&uploadFile.size>6*1024*1024){
            setProgress(`Optimizing photo ${i+1}…`);
            uploadFile=await prepareStoragePhotoFile(uploadFile);
          }
          const result=await uploadAndRegisterPropertyPhoto({
            file:uploadFile,existingUri:current.uri,
            containerId:container.id,propertyId:savedGroup.id,
            captureBatchId:intakeKey.current,
            uploadPrivate:payload=>base44.integrations.Core.UploadPrivateFile(payload),
            invokeProperty:payload=>base44.functions.invoke('storageProperty',payload),
            onUploaded:uri=>setFiles(prev=>prev.map((f,n)=>n===i?{...f,uri,error:null,stage:'register'}:f)),
            onStage:stage=>setFiles(prev=>prev.map((f,n)=>n===i?{...f,stage,error:null}:f)),
          });
          successful++;
          setFiles(prev=>prev.map((f,n)=>n===i?{...f,uri:result.uri,saved:true,error:null,stage:'done'}:f));
        }catch(error){
          failed++;
          const info=uploadErrorDetail(error,error.stage||'upload');
          setFiles(prev=>prev.map((f,n)=>n===i?{...f,error:info,stage:'failed'}:f));
        }
      }
      setDoneCount(successful);
      if(successful>0){
        queryClient.invalidateQueries({queryKey:['storedPropertyPhotos',savedGroup.id]});
        onSaved?.();
      }
      if(failed){
        toast.error(`${failed} photo${failed===1?'':'s'} failed. Details and successful photos remain saved; retry the remaining images.`,{duration:9000});
      }else{
        toast.success(editing?'Contents saved':'Contents documented');
        onClose?.();
      }
    }catch(error){
      toast.error(error.message||'Could not save stored property');
    }finally{setBusy(false);setProgress('');}
  };

  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose?.()}}>
    <DialogContent className="bg-gray-900 text-white border-gray-700 w-[calc(100vw-16px)] max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden p-4 sm:p-6 gap-3">
      <DialogHeader>
        <DialogTitle>{editing?'Edit Contents':'Add New Contents'}</DialogTitle>
        <p className="text-xs text-gray-400">{container.short_code||container.name} · One property group with details and private photographs.</p>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 pr-1">
        <p className="text-xs text-gray-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-green-400"/>
          Physical client / project property only. These records do not affect Parts Tracker stock, purchasing, or reservations.
        </p>
        <section className="space-y-3" aria-label="Contents details">
          <div><Label htmlFor="property-name">Name / contents</Label>
            <Input id="property-name" value={name} disabled={busy} maxLength={150}
              onChange={e=>setName(e.target.value)} className="mt-1"
              placeholder="Seats, dashboard take-offs, bag of hardware…"/></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Type</Label><Select value={type} onValueChange={setType} disabled={busy}>
              <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent>{TYPES.map(([id,label])=><SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
            </Select></div>
            <div><Label>Condition</Label><Select value={condition} onValueChange={setCondition} disabled={busy}>
              <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent>{CONDITIONS.map(([id,label])=><SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
            </Select></div>
          </div>
          <div><Label htmlFor="property-qty">Known quantity (optional)</Label>
            <Input id="property-qty" inputMode="decimal" type="number" min="0.01" max="99999" disabled={busy}
              value={quantity} onChange={e=>setQuantity(e.target.value)} className="mt-1"
              placeholder="Leave blank if uncounted"/>
            {!quantityValid&&<p className="text-xs text-red-300 mt-1">Enter a positive quantity, or leave it empty.</p>}</div>
          <div><Label htmlFor="property-description">Contents / description</Label>
            <Textarea id="property-description" value={description} disabled={busy} rows={2} maxLength={1200}
              onChange={e=>setDescription(e.target.value)} className="mt-1"
              placeholder="What is packed together?"/></div>
          <div><Label htmlFor="property-notes">Additional notes (optional)</Label>
            <Textarea id="property-notes" value={notes} disabled={busy} rows={2} maxLength={1200}
              onChange={e=>setNotes(e.target.value)} className="mt-1"
              placeholder="Condition, observations, missing pieces…"/></div>
        </section>
        <section className="space-y-3 border-t border-gray-700 pt-3" aria-label="Contents photos">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-300"/> Photos {editing?`(${existingPhotos.length} saved)`:''}
            </h3>
            <span className="text-xs text-gray-500">Private · saved to this group</span>
          </div>
          {editing&&photosLoading&&<p className="text-xs text-gray-500">Loading existing photographs…</p>}
          {editing&&photosError&&<p className="text-xs text-amber-300">Existing photos unavailable: {photosError.message}</p>}
          {existingPhotos.length>0&&<div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {existingPhotos.map(p=><a key={p.id} href={p.signed_url||undefined}
              onClick={e=>{if(!p.signed_url)e.preventDefault()}}
              target="_blank" rel="noreferrer" className="block aspect-square rounded border border-gray-700 overflow-hidden bg-gray-800">
              {p.signed_url?<img src={p.signed_url} alt={p.caption||name||'Stored property photo'}
                className="w-full h-full object-cover" loading="lazy"/>:
                <span className="text-xs text-gray-400 p-2 block">Photo unavailable</span>}
            </a>)}
          </div>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={busy||files.length>=25}
              onClick={()=>cameraRef.current?.click()} className="h-11 gap-1.5">
              <Camera className="w-4 h-4"/> Take Photo
            </Button>
            <Button type="button" variant="outline" disabled={busy||files.length>=25}
              onClick={()=>galleryRef.current?.click()} className="h-11 gap-1.5">
              <Images className="w-4 h-4"/> Choose Photos
            </Button>
            <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment"
              onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>
            <input ref={galleryRef} hidden type="file" accept="image/*" multiple
              onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>
          </div>
          {files.length>0&&<>
            <p className="text-xs text-gray-400">{pendingCount} new photo{pendingCount===1?'':'s'} to save</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {files.map((f,i)=><div key={f.preview} className="relative aspect-square rounded border border-gray-700 overflow-hidden">
                <img src={f.preview} alt={`New photo ${i+1}`} className="w-full h-full object-cover"/>
                {f.saved&&<CheckCircle2 className="absolute bottom-1 right-1 w-5 h-5 text-green-400 drop-shadow"/>}
                {f.error&&<div className="absolute inset-x-0 bottom-0 bg-red-900/90 text-[9px] p-1">
                  {f.error.stage==='register'?'Save failed':'Upload failed'}
                </div>}
                {busy&&!f.saved&&f.stage!=='failed'&&<div className="absolute inset-x-0 top-0 bg-black/70 text-[9px] p-1">
                  {f.stage==='register'?'Registering…':'Uploading…'}
                </div>}
                {!f.saved&&!busy&&<button type="button" onClick={()=>remove(i)}
                  aria-label={`Remove new photo ${i+1}`} className="absolute top-1 right-1 bg-black/70 rounded-full p-1">
                  <X className="w-4 h-4"/>
                </button>}
              </div>)}
            </div>
          </>}
          {files.some(f=>f.error)&&<div role="alert" className="rounded-md border border-red-800 bg-red-950/25 p-3 space-y-1">
            <p className="text-sm text-red-200 font-semibold">Some photos could not be saved. The group is preserved.</p>
            {files.map((f,i)=>f.error&&<p key={f.preview} className="text-xs text-red-200 break-words">
              Photo {i+1} · {f.error.stage==='register'?'Registration':'Private upload'}:
              {f.error.status?` HTTP ${f.error.status} ·`:''} {f.error.message}
            </p>)}
            <p className="text-xs text-gray-400">Retry remaining photos; already-registered photos will be skipped.</p>
          </div>}
          {group&&doneCount>0&&<p className="text-xs text-green-300">{doneCount} newly added photo{doneCount===1?'':'s'} saved in this session.</p>}
        </section>
      </div>
      <div className="border-t border-gray-700 pt-3 shrink-0 flex gap-2" style={{paddingBottom:'env(safe-area-inset-bottom,0px)'}}>
        <Button variant="outline" disabled={busy} onClick={onClose} className="h-11 flex-1">Close</Button>
        <Button disabled={busy||!canSave||!quantityValid||(editing&&!name.trim())} onClick={save} className="h-11 flex-1">
          {busy?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>{progress||'Saving…'}</>:
            pendingCount>0?`Save Contents + ${pendingCount} Photo${pendingCount===1?'':'s'}`:
            editing?'Save Changes':'Save Contents'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
