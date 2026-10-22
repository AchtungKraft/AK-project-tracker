import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, MapPin, Package, Search, ScanLine, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import QRScanner from "./QRScanner";
import { resolveStorageScan } from "@/lib/resolveStorageScan";
import { buildLocationPathString } from "./locationTypeConfig";
import useLocationFavorites from "./useLocationFavorites";

/**
 * Shop shortcut for loose inventory that has no real physical shelf.
 * Only invokes the canonical transferInventoryBatch backend.
 * No direct InventoryItem quantity/entity writes in the browser.
 */
export default function ShopAssignLocation({ locations=[], inventoryItems=[], parts=[], containers=[], initialPartId=null, initialSourceId=null, onClose, onNavigate }) {
  const qc=useQueryClient();
  const {favorites,recents,addRecent}=useLocationFavorites();
  const legacy=useMemo(()=>locations.find(l=>l.location_area==='UNASSIGNED_SYSTEM'&&l.active!==false),[locations]);
  const [source,setSource]=useState(initialSourceId === 'unassigned' ? 'none' :
    initialSourceId && legacy?.id===initialSourceId ? 'legacy' : (legacy ? 'legacy' : 'none'));
  const [step,setStep]=useState('items');
  const preselectedRef=useRef(false);
  const [itemSearch,setItemSearch]=useState('');
  const [destinationSearch,setDestinationSearch]=useState('');
  const [selectedAreaId,setSelectedAreaId]=useState(null);
  const [showAllDestinations,setShowAllDestinations]=useState(false);
  const [destination,setDestination]=useState(null);
  const [selected,setSelected]=useState(new Map());
  const [scanOpen,setScanOpen]=useState(false);
  const [scanError,setScanError]=useState('');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);
  const batchKey=useRef(null);

  const partsById=useMemo(()=>new Map(parts.map(p=>[p.id,p])),[parts]);
  const countBySource=useMemo(()=>{
    const tally={legacy:0,none:0};
    for(const i of inventoryItems){
      if(i.container_id || !((i.quantity_on_hand||0)>(i.quantity_reserved||0)))continue;
      if(legacy && i.location_id===legacy.id)tally.legacy++;
      else if(!i.location_id)tally.none++;
    }
    return tally;
  },[inventoryItems,legacy]);
  const itemRows=useMemo(()=>inventoryItems
    .filter(i=>!i.container_id && (i.quantity_on_hand||0)>(i.quantity_reserved||0) &&
      (source==='none'?!i.location_id:i.location_id===legacy?.id))
    .map(i=>({i,part:partsById.get(i.part_id)}))
    .sort((a,b)=>(a.part?.part_name||'').localeCompare(b.part?.part_name||'')),[inventoryItems,source,legacy,partsById]);
  useEffect(()=>{
    if(!initialPartId || preselectedRef.current || itemRows.length===0)return;
    const matching=itemRows.filter(({i})=>i.part_id===initialPartId);
    if(!matching.length)return;
    preselectedRef.current=true;
    setSelected(new Map(matching.map(({i})=>[i.id,(i.quantity_on_hand||0)-(i.quantity_reserved||0)])));
  },[initialPartId,itemRows]);
  const filteredItems=useMemo(()=>{
    const q=itemSearch.trim().toLowerCase();
    return itemRows.filter(({i,part})=>!q||[part?.part_name,part?.vendor_part_number,i.part_id].some(s=>String(s||'').toLowerCase().includes(q)));
  },[itemRows,itemSearch]);
  const lineRows=useMemo(()=>itemRows.filter(({i})=>selected.has(i.id))
    .map(({i,part})=>({i,part,qty:selected.get(i.id)||0}))
    .filter(x=>x.qty>0),[itemRows,selected]);
  const totalQty=lineRows.reduce((sum,x)=>sum+x.qty,0);
  const availableLocs=useMemo(()=>locations.filter(l=>l.active!==false && l.id!==legacy?.id && l.location_area!=='UNASSIGNED_SYSTEM' &&
    l.location_type!=='receiving'),[locations,legacy]);
  const locationById=useMemo(()=>new Map(locations.map(l=>[l.id,l])),[locations]);
  const getRoot=(id)=>{
    let cursor=id;const visited=new Set();
    while(cursor && !visited.has(cursor)){
      visited.add(cursor);
      const loc=locationById.get(cursor);
      if(!loc?.parent_id || !locationById.has(loc.parent_id))return cursor;
      cursor=loc.parent_id;
    }
    return cursor;
  };
  const areaOptions=useMemo(()=>availableLocs.filter(l=>getRoot(l.id)===l.id)
    .sort((a,b)=>a.location_area.localeCompare(b.location_area)),[availableLocs,locationById]);
  const quickDestinations=useMemo(()=>{
    const byId=new Map(availableLocs.map(l=>[l.id,l]));
    return [...new Set([...favorites,...recents])].map(id=>byId.get(id)).filter(Boolean).slice(0,8);
  },[availableLocs,favorites,recents]);
  const destinations=useMemo(()=>{
    const q=destinationSearch.trim().toLowerCase();
    if(q)return availableLocs.filter(l=>[l.location_area,l.short_code,buildLocationPathString(l.id,locations)].some(s=>String(s||'').toLowerCase().includes(q)))
      .sort((a,b)=>buildLocationPathString(a.id,locations).localeCompare(buildLocationPathString(b.id,locations))).slice(0,80);
    if(selectedAreaId)return availableLocs.filter(l=>getRoot(l.id)===selectedAreaId)
      .sort((a,b)=>buildLocationPathString(a.id,locations).localeCompare(buildLocationPathString(b.id,locations))).slice(0,80);
    return showAllDestinations?availableLocs.slice().sort((a,b)=>buildLocationPathString(a.id,locations).localeCompare(buildLocationPathString(b.id,locations))).slice(0,80):[];
  },[destinationSearch,availableLocs,locations,locationById,selectedAreaId,showAllDestinations]);

  const toggle=(i)=>{
    if(step!=='items')return;
    const avail=(i.quantity_on_hand||0)-(i.quantity_reserved||0);
    setSelected(old=>{
      const next=new Map(old);
      if(next.has(i.id))next.delete(i.id);
      else if(avail>0)next.set(i.id,avail);
      return next;
    });
  };
  const setQuantity=(i,raw)=>{
    const max=(i.quantity_on_hand||0)-(i.quantity_reserved||0);
    const qty=Math.max(0,Math.min(max,Math.floor(Number(raw)||0)));
    setSelected(old=>{const n=new Map(old);if(qty>0)n.set(i.id,qty);else n.delete(i.id);return n;});
  };
  const chooseSource=(next)=>{
    if(busy||next===source)return;
    setSource(next);setSelected(new Map());setDestination(null);setResult(null);batchKey.current=null;setStep('items');
  };
  const chooseDestination=(loc)=>{
    if(!loc||loc.active===false||loc.id===legacy?.id||loc.location_type==='receiving'){
      setScanError('Choose a physical shelf or storage location, not Receiving or Unassigned.');
      return;
    }
    setScanError('');setDestination(loc);batchKey.current=null;setStep('review');setScanOpen(false);
  };
  const handleScan=(code)=>{
    const found=resolveStorageScan(code,{locations,containers,inventoryItems:[]});
    if(!found.valid){setScanError(found.error||'Unrecognized location QR');setScanOpen(false);return;}
    if(found.entity_type!=='LOCATION'){setScanError('This action assigns loose stock to a location. Scan a shelf or rack label, not a box.');setScanOpen(false);return;}
    chooseDestination(found.entity);
  };
  const submit=async()=>{
    if(busy||!destination||lineRows.length===0)return;
    if(!batchKey.current)batchKey.current='shop_assign_'+crypto.randomUUID().replace(/-/g,'');
    setBusy(true);
    try{
      const payload={
        transfer_type:'inventory_move',
        batch_id:batchKey.current,
        ...(source==='legacy'?{source_location_id:legacy.id}:{source_unassigned_only:true}),
        destination_location_id:destination.id,
        destination_container_id:null,
        notes:'Shop assign-location workflow',
        lines:lineRows.map(({i,qty})=>({inventory_item_id:i.id,part_id:i.part_id,qty})),
      };
      const raw=await base44.functions.invoke('transferInventoryBatch',payload);
      const res=raw?.data||raw;
      if(!res || (res.error && res.executed==null))throw new Error(res?.error||'Move could not be confirmed');
      setResult(res);setStep('result');
      if(res.executed>0 || res.idempotent_hit){
        qc.invalidateQueries({queryKey:['inventoryItems']});
        qc.invalidateQueries({queryKey:['inventoryTransfers']});
      }
      if(res.success)toast.success('Stock assigned to '+(destination.location_area||'destination'));
      else toast.error('Location assignment incomplete. Review the result before retrying.');
    }catch(err){
      // Network ambiguity: never silently retry with a different batch key.
      setResult({success:false,uncertain:true,error:err.message,executed:0,failed:lineRows.length});
      setStep('result');
      toast.error('Could not verify the move. Check stock history before repeating.');
    }finally{setBusy(false);}
  };
  const close=()=>{if(!busy)onClose?.();};
  const sourceLabel=source==='legacy'?'Unassigned Stock':'No Location Set';

  return <div className="fixed inset-0 z-[85] bg-[#0d1421] text-white flex flex-col" role="dialog" aria-modal="true" aria-label="Assign stock to a location">
    <div className="shrink-0 border-b border-gray-700 bg-gray-900/95 px-3 sm:px-6 py-3">
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={step==='items'||step==='result'?close:()=>setStep(step==='review'?'destination':'items')} disabled={busy} className="h-9 w-9">
          {step==='items'||step==='result'?<X className="w-5 h-5"/>:<ArrowLeft className="w-5 h-5"/>}
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold truncate">Assign Stock Location</h2>
          <p className="text-xs text-gray-400">Select parts → Choose shelf → Confirm · uses existing stock-transfer rules</p>
        </div>
        <div className="shrink-0 rounded bg-amber-950/40 text-amber-300 text-xs px-2 py-1">{step==='items'?'1 / 3':step==='destination'?'2 / 3':step==='review'?'3 / 3':'Complete'}</div>
      </div>
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {step==='items'&&<>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>chooseSource('legacy')} disabled={!legacy||busy}
              className={`rounded-lg p-3 border text-left ${source==='legacy'?'border-amber-500 bg-amber-950/20':'border-gray-700 bg-gray-900/50'}`}>
              <span className="text-sm font-medium block">Unassigned Stock</span>
              <span className="text-xs text-gray-400">{countBySource.legacy} movable lines</span>
            </button>
            <button onClick={()=>chooseSource('none')} disabled={busy}
              className={`rounded-lg p-3 border text-left ${source==='none'?'border-amber-500 bg-amber-950/20':'border-gray-700 bg-gray-900/50'}`}>
              <span className="text-sm font-medium block">No Location Set</span>
              <span className="text-xs text-gray-400">{countBySource.none} movable lines</span>
            </button>
          </div>
          <p className="text-xs text-gray-400">Only unreserved, loose stock can move here. For client parts or take-offs that are not inventory, scan a labeled box and use Document Contents.</p>
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 -translate-y-1/2 w-4 h-4 text-gray-500"/>
              <Input value={itemSearch} onChange={e=>setItemSearch(e.target.value)} placeholder="Find a part or number…" className="pl-9 h-11 bg-gray-900 border-gray-700"/>
            </div>
            {selected.size>0&&<Button size="sm" variant="ghost" className="h-11 shrink-0 text-gray-400" onClick={()=>setSelected(new Map())}>Clear</Button>}
            <Button size="sm" variant="outline" className="h-11 shrink-0" onClick={()=>{
              const next=new Map(selected);
              for(const {i} of filteredItems){next.set(i.id,(i.quantity_on_hand||0)-(i.quantity_reserved||0));}
              setSelected(next);
            }}>Select shown</Button>
          </div>
          <div className="space-y-2">
            {filteredItems.length===0&&<div className="rounded-lg border border-gray-800 p-8 text-center text-sm text-gray-400">
              No movable stock found for {sourceLabel.toLowerCase()}.
            </div>}
            {filteredItems.map(({i,part})=>{
              const avail=(i.quantity_on_hand||0)-(i.quantity_reserved||0);
              const picked=selected.has(i.id);
              return <div key={i.id} className={`rounded-lg border p-3 ${picked?'border-amber-600 bg-amber-950/10':'border-gray-800 bg-gray-900/40'}`}>
                <div className="flex gap-3 items-center">
                  <input type="checkbox" checked={picked} onChange={()=>toggle(i)} className="w-5 h-5 accent-amber-500 shrink-0" aria-label={`Select ${part?.part_name||'part'}`}/>
                  {(part?.featured_photo||part?.photos?.[0])?
                    <img src={part.featured_photo||part.photos[0]} alt="" className="w-11 h-11 rounded object-cover shrink-0"/>:
                    <div className="w-11 h-11 rounded bg-gray-800 flex items-center justify-center shrink-0"><Package className="w-5 h-5 text-gray-600"/></div>}
                  <button className="flex-1 min-w-0 text-left" onClick={()=>toggle(i)}>
                    <span className="text-sm font-semibold block break-words">{part?.part_name||'Unknown catalog part'}</span>
                    <span className="text-xs text-gray-400 block">{part?.vendor_part_number||i.part_id} · {avail} movable / {i.quantity_on_hand||0} in stock</span>
                  </button>
                  {picked&&<div className="shrink-0">
                    <label className="text-[10px] text-gray-400 block text-right" htmlFor={`qty-${i.id}`}>Move qty</label>
                    <input id={`qty-${i.id}`} type="number" inputMode="numeric" min="1" max={avail}
                      value={selected.get(i.id)} onChange={e=>setQuantity(i,e.target.value)}
                      className="w-16 h-10 bg-gray-800 text-white rounded border border-gray-600 text-center text-sm"/>
                  </div>}
                </div>
              </div>;
            })}
          </div>
        </>}
        {step==='destination'&&<>
          <p className="text-sm text-gray-300"><strong>{lineRows.length} stock lines</strong> · {totalQty} units from {sourceLabel}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button className="h-12 gap-2" onClick={()=>{setScanError('');setScanOpen(true)}}><ScanLine className="w-5 h-5"/>Scan destination QR</Button>
            <div className="relative"><Search className="absolute top-1/2 left-3 -translate-y-1/2 w-4 h-4 text-gray-500"/>
              <Input value={destinationSearch} onChange={e=>setDestinationSearch(e.target.value)} placeholder="Search racks or shelves…" className="pl-9 h-12 bg-gray-900 border-gray-700"/></div>
          </div>
          {scanError&&<p className="text-amber-300 text-sm">{scanError}</p>}
          <p className="text-xs text-gray-500">Select the physical destination. Receiving and Unassigned are not destinations for this action.</p>
          <div className="space-y-1">
            {destinations.map(loc=><button key={loc.id} onClick={()=>chooseDestination(loc)}
              className="w-full rounded-lg bg-gray-900/45 border border-gray-800 hover:border-amber-600 px-3 py-3 text-left flex items-center gap-3">
              <MapPin className="w-5 h-5 shrink-0 text-amber-400"/>
              <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{loc.location_area}</div>
                <div className="text-xs text-gray-500 truncate">{buildLocationPathString(loc.id,locations)}</div></div>
              <ArrowRight className="w-4 h-4 shrink-0 text-gray-400"/>
            </button>)}
            {destinations.length===0&&<p className="text-sm text-gray-500 py-8 text-center">No matching physical locations.</p>}
          </div>
        </>}
        {step==='review'&&<>
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/15 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">From</div>
            <p className="font-semibold">{sourceLabel}</p>
            <ArrowRight className="w-5 h-5 text-amber-400"/>
            <div className="text-[11px] uppercase tracking-wide text-gray-400">To</div>
            <p className="font-semibold text-lg">{destination?.location_area}</p>
            <p className="text-xs text-gray-400">{buildLocationPathString(destination?.id,locations)}</p>
          </div>
          <div className="rounded-xl border border-gray-800 p-3">
            <h3 className="text-sm font-semibold mb-2">Confirm {lineRows.length} lines · {totalQty} units</h3>
            <div className="space-y-2">
              {lineRows.map(({i,part,qty})=><div key={i.id} className="text-sm flex justify-between gap-3 border-b border-gray-800 pb-2">
                <span className="min-w-0">{part?.part_name||i.part_id}</span><span className="font-mono shrink-0">{qty}</span>
              </div>)}
            </div>
            <p className="text-xs text-gray-500 mt-3">Stock is relocated using the existing inventory transfer service. Reserved quantities remain protected.</p>
          </div>
        </>}
        {step==='result'&&<>
          <div className={`rounded-xl border p-5 space-y-3 ${result?.success?'border-green-800 bg-green-950/10':'border-amber-800 bg-amber-950/10'}`}>
            {result?.success?<CheckCircle2 className="w-9 h-9 text-green-400"/>:<CircleAlert className="w-9 h-9 text-amber-400"/>}
            <h3 className="text-xl font-semibold">{result?.success?'Location updated':result?.uncertain?'Move status needs verification':'Some items were not placed'}</h3>
            <p className="text-sm text-gray-300">{result?.executed||0} confirmed lines moved · {result?.failed||0} failed</p>
            {result?.error&&<p className="text-sm text-amber-200">{result.error}</p>}
            {result?.errors?.length>0&&<div className="text-xs text-gray-400 space-y-1">{result.errors.map((e,index)=><p key={index}>Line {e.index+1}: {e.error}</p>)}</div>}
            {!result?.success&&<p className="text-xs text-amber-200">Do not repeat this transfer until you verify the actual stock state. The backend can partially execute a batch.</p>}
          </div>
        </>}
      </div>
    </div>
    {!scanOpen&&<div className="shrink-0 px-3 sm:px-6 py-3 border-t border-gray-700 bg-gray-900/90" style={{paddingBottom:'calc(env(safe-area-inset-bottom, 0px) + 12px)'}}>
      <div className="max-w-4xl mx-auto flex gap-2">
        {step==='items'&&<Button className="w-full h-12 font-semibold" disabled={!lineRows.length} onClick={()=>setStep('destination')}>
          Choose shelf for {lineRows.length} line{lineRows.length===1?'':'s'} · {totalQty} units <ArrowRight className="w-4 h-4 ml-2"/>
        </Button>}
        {step==='destination'&&<Button variant="outline" className="w-full h-12" onClick={()=>setStep('items')}>Back to selected parts</Button>}
        {step==='review'&&<>
          <Button variant="outline" disabled={busy} className="h-12 px-5" onClick={()=>setStep('destination')}>Change shelf</Button>
          <Button className="flex-1 h-12 font-semibold" disabled={busy} onClick={submit}>{busy?'Placing stock…':'Confirm Location Assignment'}</Button>
        </>}
        {step==='result'&&<>
          {result?.success&&<Button variant="outline" className="flex-1 h-12" onClick={()=>{onNavigate?.(destination.id);close()}}>View shelf</Button>}
          <Button className="flex-1 h-12" onClick={close}>{result?.success?'Done':'Close and review stock'}</Button>
        </>}
      </div>
    </div>}
    {scanOpen&&<div className="fixed inset-0 z-[90] bg-black"><QRScanner onScan={handleScan} onClose={()=>setScanOpen(false)}/></div>}
  </div>;
}
