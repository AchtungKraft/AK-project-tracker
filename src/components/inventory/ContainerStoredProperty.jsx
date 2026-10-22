import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, ChevronDown, ChevronRight, Image as ImageIcon, Link2, Loader2, Package, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import PropertyIntakeModal from "./PropertyIntakeModal";

const unwrap = r=>r?.data||r;
export async function fetchStoredPropertyForContainer(containerId) {
  const result=unwrap(await base44.functions.invoke('storageProperty',{action:'list_container',container_id:containerId}));
  if(result.error||!result.success)throw new Error(result.error||'Unable to load property');
  return result.items||[];
}

function StoredPropertyRow({item,container,parts,onChanged,autoPreview=false}){
  const queryClient=useQueryClient();
  const [showPhotos,setShowPhotos]=useState(autoPreview && item.photo_count>0);
  const [linking,setLinking]=useState(false);
  const [search,setSearch]=useState('');
  const [linkBusy,setLinkBusy]=useState(false);
  const [editingContents,setEditingContents]=useState(false);
  const catalog=parts.find(p=>p.id===item.catalog_part_id);
  const candidates=useMemo(()=>{
    const needle=search.trim().toLowerCase();
    if(needle.length<2)return [];
    return parts.filter(p=>(p.part_name||'').toLowerCase().includes(needle)||(p.vendor_part_number||'').toLowerCase().includes(needle)).slice(0,12);
  },[parts,search]);
  const {data:photos=[],isLoading:loadingPhotos,error:photoError}=useQuery({
    queryKey:['storedPropertyPhotos',item.id],
    enabled:showPhotos,
    queryFn:async()=>{
      const result=unwrap(await base44.functions.invoke('storageProperty',{action:'get_photos',property_id:item.id}));
      if(result.error||!result.success)throw new Error(result.error||'Unable to load private photos');
      return result.photos||[];
    },
    staleTime:90_000,refetchOnWindowFocus:false,
  });
  const updateLink=async partId=>{
    setLinkBusy(true);
    try{
      const result=unwrap(await base44.functions.invoke('storageProperty',{
        action:'update_group',container_id:container.id,property_id:item.id,catalog_part_id:partId,
      }));
      if(result.error||!result.success)throw new Error(result.error||'Link failed');
      toast.success(partId?'Part linked for identification only':'Catalog reference removed');
      setLinking(false);
      setSearch('');
      onChanged?.();
    }catch(err){toast.error(err.message)}
    finally{setLinkBusy(false)}
  };
  return <div className="rounded-lg border border-gray-800 bg-gray-900/35 p-3 space-y-2 min-w-0">
    <div className="flex items-start gap-2">
      <Package className="w-4 h-4 mt-0.5 text-indigo-400 shrink-0"/>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-100 font-semibold break-words">{item.name}</div>
        <div className="text-xs text-gray-500">
          {item.property_type?.replace(/_/g,' ')} · {item.quantity_known ? `Qty ${item.quantity}`:'Qty uncounted'}
          {item.condition&&item.condition!=='unknown'?` · ${item.condition}`:''}
        </div>
        {item.description&&<p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{item.description}</p>}
        {item.notes&&<p className="text-xs text-amber-300/80 mt-1 whitespace-pre-wrap">{item.notes}</p>}
        {catalog&&<p className="text-xs text-blue-300 mt-1">
          Catalog ID: {catalog.part_name||catalog.vendor_part_number} <span className="text-gray-500">· not inventory</span>
        </p>}
        {item.catalog_part_id&&!catalog&&<p className="text-xs text-blue-300 mt-1">Catalog Part linked · not inventory</p>}
      </div>
    </div>
    <div className="flex items-center flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={()=>setEditingContents(true)} className="h-9 gap-1.5 text-xs border-indigo-800 text-indigo-200">
        <Pencil className="w-3.5 h-3.5"/> Edit Contents &amp; Photos
      </Button>
      {(item.photo_count||0)>0&&<Button size="sm" variant="outline" onClick={()=>setShowPhotos(v=>!v)} className="h-9 gap-1 text-xs border-gray-700">
        {showPhotos?<ChevronDown className="w-3 h-3"/>:<ChevronRight className="w-3 h-3"/>}
        <ImageIcon className="w-3 h-3"/> {item.photo_count} {item.photo_count===1?"photo":"photos"}
      </Button>}
      <Button size="sm" variant="ghost" onClick={()=>setLinking(v=>!v)} className="h-8 gap-1 text-xs text-gray-400">
        <Link2 className="w-3 h-3"/> {catalog?'Change catalog match':'Identify as Part'}
      </Button>
    </div>
    {showPhotos&&<div className="space-y-2">
      {loadingPhotos&&<p className="text-xs text-gray-500">Loading private photos…</p>}
      {photoError&&<p className="text-xs text-red-400">Cannot load photographs. {photoError.message}</p>}
      {!loadingPhotos&&!photoError&&photos.length===0&&<p className="text-xs text-gray-500">No photographs saved yet.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {photos.map(p=><div key={p.id} className="space-y-1">
          {p.signed_url?
            <a href={p.signed_url} target="_blank" rel="noreferrer" title="Open private photo">
              <img src={p.signed_url} alt={p.caption||item.name} loading="lazy" className="w-full aspect-square object-cover rounded border border-gray-700"/>
            </a>
            :<div className="aspect-square bg-gray-800 border border-gray-700 flex items-center justify-center text-xs text-gray-500">Unavailable</div>}
          {p.caption&&<p className="text-[11px] text-gray-400 truncate">{p.caption}</p>}
        </div>)}
      </div>
      <p className="text-[10px] text-gray-600">Photo links expire automatically and can be refreshed by reopening this section.</p>
    </div>}
    {editingContents&&<PropertyIntakeModal container={container} existingGroup={item}
      onClose={()=>setEditingContents(false)} onSaved={()=>{
        onChanged?.();
        queryClient.invalidateQueries({queryKey:['storedPropertyPhotos',item.id]});
      }}/>
    }
    {linking&&<div className="rounded border border-gray-800 p-2 space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"/>
        <Input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search catalog Part by name or number" className="h-9 pl-8 text-xs"/>
      </div>
      <p className="text-[11px] text-yellow-200/80">Identification reference only. Does not create stock or purchasing demand.</p>
      {candidates.length>0&&<div className="max-h-40 overflow-y-auto space-y-1">
        {candidates.map(p=><button key={p.id} disabled={linkBusy} onClick={()=>updateLink(p.id)} className="block w-full text-left text-xs p-2 rounded hover:bg-gray-800 border border-gray-800">
          {p.part_name}<span className="text-gray-500 ml-1">{p.vendor_part_number}</span>
        </button>)}
      </div>}
      <div className="flex gap-2">
        {item.catalog_part_id&&<Button size="sm" variant="outline" disabled={linkBusy} onClick={()=>updateLink(null)} className="text-xs h-8">Unlink</Button>}
        <Button size="sm" variant="ghost" disabled={linkBusy} onClick={()=>setLinking(false)} className="text-xs h-8">Cancel</Button>
      </div>
      {linkBusy&&<Loader2 className="w-4 h-4 animate-spin"/>}
    </div>}
  </div>;
}

/** Lazy load solely one selected box; inventory queries and counts remain untouched. */
export default function ContainerStoredProperty({container,parts=[],wide=false}){
  const client=useQueryClient();
  const [intakeOpen,setIntakeOpen]=useState(false);
  const {data:items=[],isLoading,error}=useQuery({
    queryKey:['storedPropertyContainer',container.id],
    queryFn:()=>fetchStoredPropertyForContainer(container.id),
    staleTime:20_000,refetchOnWindowFocus:false,retry:1,
  });
  const refresh=()=>{
    client.invalidateQueries({queryKey:['storedPropertyContainer',container.id]});
  };
  const active=items.filter(i=>i.status==='in_storage');
  return <section className="space-y-3 mb-5 pb-4 border-b border-gray-800">
    <div className="flex items-center gap-2 justify-between">
      <div>
        <h3 className="text-base font-semibold text-indigo-200">Stored Property {(!isLoading&&!error)&&<span className="text-sm font-normal text-gray-400">({active.length} {active.length===1?'group':'groups'})</span>}</h3>
        <p className="text-[11px] text-gray-500">Client parts and take-offs · separate from inventory</p>
      </div>
      <Button onClick={()=>setIntakeOpen(true)} size="sm" variant="outline" className="h-9 gap-1.5 text-xs border-indigo-800 text-indigo-200">
        <Camera className="w-4 h-4"/> Add Contents
      </Button>
    </div>
    {isLoading?<p className="text-xs text-gray-500">Loading property…</p>:
      error?<p className="text-xs text-red-400">Stored Property unavailable: {error.message}</p>:
        !active.length?<p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-800 p-4">No stored property documented yet. Select Add Contents to photograph or list client items, take-offs, or miscellaneous parts.</p>:
          <div className={wide?"grid grid-cols-1 lg:grid-cols-2 gap-3 items-start":"space-y-2"}>{active.map((i,index)=>
            <StoredPropertyRow key={i.id} item={i} container={container} parts={parts} onChanged={refresh} autoPreview={wide&&index<4}/>)}</div>}
    {intakeOpen&&<PropertyIntakeModal container={container} onClose={()=>setIntakeOpen(false)} onSaved={refresh}/>}
  </section>;
}
