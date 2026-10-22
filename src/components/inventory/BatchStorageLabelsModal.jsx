import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, RotateCcw, ShieldCheck, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { printStorageLabelBatch } from "./printStorageLabelBatch";

const key = () => crypto.randomUUID().replace(/-/g,'');
const unwrap = (r) => r?.data || r;

export default function BatchStorageLabelsModal({ onClose }) {
  const [count,setCount] = useState('10');
  const [containerType,setContainerType] = useState('box');
  const [format,setFormat] = useState('thermal');
  const [busy,setBusy] = useState(false);
  const [historyBusy,setHistoryBusy] = useState(true);
  const [batches,setBatches] = useState([]);
  const [labels,setLabels] = useState([]);
  const [batchCode,setBatchCode] = useState('');
  const requestKey = useRef(key());

  useEffect(() => {
    let alive=true;
    base44.functions.invoke('storageLabels',{action:'list_batches'})
      .then(r => { if(alive) setBatches(unwrap(r)?.batches||[]); })
      .catch(e => { if(alive) toast.error('Batch history unavailable: '+e.message); })
      .finally(()=>{if(alive) setHistoryBusy(false)});
    return ()=>{alive=false};
  },[]);

  const create = async () => {
    if (busy || labels.length) return;
    setBusy(true);
    try {
      const res = unwrap(await base44.functions.invoke('storageLabels',{
        action:'generate',request_key:requestKey.current,
        count:Number(count),container_type:containerType,
      }));
      if (res.error || !res.success || !Array.isArray(res.labels)) throw new Error(res.error || 'Could not reserve labels');
      setLabels(res.labels);
      setBatchCode(res.batch_code);
      setBatches(prev => [{id:res.batch_id,batch_code:res.batch_code,requested_count:res.labels.length,status:'ready'},...prev.filter(b=>b.id!==res.batch_id)]);
      toast.success(res.labels.length+' permanent labels reserved');
    } catch(e) { toast.error('Label generation failed: '+e.message+' — retry with the same batch selection'); }
    finally {setBusy(false)}
  };

  const loadBatch = async (id) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = unwrap(await base44.functions.invoke('storageLabels',{action:'get_batch',batch_id:id}));
      if (res.error || !res.success) throw new Error(res.error || 'Could not load batch');
      setBatchCode(res.batch_code||'');
      setLabels(res.labels||[]);
      toast.success('Batch loaded for reprint');
    } catch (e) {toast.error(e.message)}
    finally {setBusy(false)}
  };

  const print = () => {
    try {
      if (!printStorageLabelBatch(labels,{format,batchCode})) toast.error('Pop-up blocked. Allow printing windows and retry.');
    } catch(e) {toast.error(e.message)}
  };
  const newBatch = () => {
    setLabels([]);setBatchCode('');requestKey.current=key();
  };

  return <Dialog open onOpenChange={(isOpen)=>{if(!isOpen && !busy) onClose()}}>
    <DialogContent className="bg-gray-900 border-gray-700 text-white w-[calc(100vw-20px)] max-w-lg max-h-[85dvh] flex flex-col overflow-hidden">
      <DialogHeader><DialogTitle className="flex gap-2 items-center"><Printer className="w-5 h-5"/> Batch Storage Labels</DialogTitle></DialogHeader>
      <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1">
        <div className="text-xs text-gray-400 flex gap-2 items-start">
          <ShieldCheck className="w-4 h-4 text-green-400 shrink-0"/>
          Reserve permanent QR labels before packing. They are not counted as occupied storage until activated by scanning.
        </div>
        {!labels.length ? <>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-400">Labels per batch
              <Select value={count} onValueChange={setCount}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                <SelectContent>{['10','25','50'].map(n=><SelectItem key={n} value={n}>{n} labels</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="text-xs text-gray-400">Container type
              <Select value={containerType} onValueChange={setContainerType}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                <SelectContent>{['box','tote','bin','crate'].map(t=><SelectItem key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          </div>
          <Button onClick={create} disabled={busy} className="w-full">
            {busy?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Printer className="w-4 h-4 mr-2"/>}
            Reserve {count} labels
          </Button>
          <div className="border-t border-gray-700 pt-3">
            <p className="text-sm font-semibold mb-2">Previous batches</p>
            {historyBusy ? <p className="text-xs text-gray-500">Loading…</p> :
              batches.length===0 ? <p className="text-xs text-gray-500">No previous batches.</p> :
              <div className="space-y-1">
                {batches.map(b=><button key={b.id} disabled={busy} onClick={()=>loadBatch(b.id)}
                  className="w-full flex items-center justify-between text-left border border-gray-800 hover:border-gray-600 rounded-md p-2">
                  <span className="text-xs font-mono">{b.batch_code || b.id.slice(-9)}</span>
                  <span className="text-xs text-gray-400">{b.requested_count} · {b.status} · Reprint</span>
                </button>)}
              </div>}
          </div>
        </> : <>
          <div className="rounded-md border border-green-800/50 bg-green-950/20 p-3">
            <p className="text-green-300 text-sm font-semibold">{labels.length} labels reserved</p>
            <p className="text-xs font-mono text-gray-400">{batchCode}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-44 overflow-y-auto">
            {labels.map(c=><div key={c.id} className="text-[10px] text-gray-300 font-mono border border-gray-700 rounded p-1 truncate" title={c.short_code}>{c.short_code}</div>)}
          </div>
          <label className="text-xs text-gray-400 block">Print format
            <Select value={format} onValueChange={setFormat}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="thermal">4 × 3 in thermal (one per page)</SelectItem><SelectItem value="letter">US Letter (multi-label sheet)</SelectItem></SelectContent>
            </Select>
          </label>
          <Button onClick={print} className="w-full"><Printer className="w-4 h-4 mr-2"/> Open Print Layout</Button>
          <Button variant="outline" onClick={newBatch} className="w-full"><RotateCcw className="w-4 h-4 mr-2"/> New Batch</Button>
        </>}
        <p className="text-xs text-gray-500 flex gap-2"><ScanLine className="w-4 h-4 shrink-0"/> Scan a printed label later to assign its project and current location. Printing does not create Parts or inventory.</p>
      </div>
    </DialogContent>
  </Dialog>;
}
