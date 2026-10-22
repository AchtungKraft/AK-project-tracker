import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronDown,ChevronRight,MapPin,Package,LockKeyhole } from "lucide-react";
const unwrap=r=>r?.data||r;

/** Read-only identification cross-reference, intentionally excluded from all stock math. */
export default function PartStoredPropertySection({partId,isOpen}){
  const [expanded,setExpanded]=useState(false);
  const {data=[],isLoading,error}=useQuery({
    queryKey:['storedPropertyByPart',partId],
    enabled:!!(isOpen&&partId&&expanded),
    staleTime:30_000,refetchOnWindowFocus:false,retry:1,
    queryFn:async()=>{
      const res=unwrap(await base44.functions.invoke('storageProperty',{action:'find_by_part',part_id:partId}));
      if(res.error||!res.success)throw new Error(res.error||'Failed to load stored-property matches');
      return res.items||[];
    },
  });
  return <div className="p-3 rounded-lg border border-indigo-900/50 bg-indigo-950/10 space-y-2">
    <button type="button" className="w-full flex items-center gap-2 text-sm text-indigo-200 text-left" onClick={()=>setExpanded(x=>!x)}>
      {expanded?<ChevronDown className="w-4 h-4"/>:<ChevronRight className="w-4 h-4"/>}
      <Package className="w-4 h-4"/>
      <span className="flex-1 font-medium">Client / Project Stored Property</span>
      <span className="text-[10px] text-gray-500">Not available stock</span>
    </button>
    {expanded&&<div className="space-y-2">
      <p className="text-xs text-gray-400">Physical client-held or project property identified as this Part. These records do not affect quantities, reservations, costs or purchasing.</p>
      {isLoading&&<p className="text-xs text-gray-500">Locating stored examples…</p>}
      {error&&<div className="flex items-center gap-2 text-xs text-yellow-300"><LockKeyhole className="w-3.5 h-3.5"/>Stored-property lookup unavailable: {error.message}</div>}
      {!isLoading&&!error&&!data.length&&<p className="text-xs text-gray-500">No stored examples linked to this Part.</p>}
      {data.map(item=><div key={item.id} className="p-2 border border-indigo-900/30 rounded text-xs space-y-1">
        <div className="font-semibold text-gray-200">{item.name}</div>
        <div className="text-gray-400">
          {item.quantity_known?`Qty ${item.quantity}`:'Quantity unknown'} · {item.property_type?.replace(/_/g,' ')} · {item.ownership_type}
        </div>
        <div className="flex gap-1 items-start text-gray-400">
          <MapPin className="w-3 h-3 shrink-0 mt-0.5"/>
          <span>Box {item.container_code||item.container_name||'Unboxed'} · Location ID: {item.location_id||'Unassigned'}</span>
        </div>
      </div>)}
      {data.length>=100&&<p className="text-xs text-yellow-300">Showing first 100 records.</p>}
      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={()=>setExpanded(false)}>Collapse</Button>
    </div>}
  </div>;
}
