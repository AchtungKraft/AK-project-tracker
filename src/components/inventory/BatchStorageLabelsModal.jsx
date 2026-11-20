import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, RotateCcw, ShieldCheck, ScanLine } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { printStorageLabelBatch } from "./printStorageLabelBatch";
import { draftFromContainer, draftFromReserved } from "./labels/labelDrafts";
import { useStorageCategories } from "./labels/useStorageCategories";
import ToteLabelStudio from "./labels/ToteLabelStudio";
import ContainerLabelPicker from "./labels/ContainerLabelPicker";

const key = () => crypto.randomUUID().replace(/-/g,'');
const unwrap = (r) => r?.data || r;

export default function BatchStorageLabelsModal({ containers = [], onClose }) {
  const { toast } = useToast();
  const notifyError = (title, e) => toast({ title, description: e?.message, variant: 'destructive' });
  const { data: categories = [] } = useStorageCategories();
  const [count,setCount] = useState('10');
  const [containerType,setContainerType] = useState('box');
  const [busy,setBusy] = useState(false);
  const [historyBusy,setHistoryBusy] = useState(true);
  const [batches,setBatches] = useState([]);
  const [labels,setLabels] = useState([]);
  const [drafts,setDrafts] = useState([]);
  const [batchCode,setBatchCode] = useState('');
  const requestKey = useRef(key());

  useEffect(() => {
    let alive=true;
    base44.functions.invoke('storageLabels',{action:'list_batches'})
      .then(r => { if(alive) setBatches(unwrap(r)?.batches||[]); })
      .catch(e => { if(alive) notifyError('Batch history unavailable', e); })
      .finally(()=>{if(alive) setHistoryBusy(false)});
    return ()=>{alive=false};
  },[]);

  const showReserved = (list, code) => { setLabels(list); setBatchCode(code||''); setDrafts(list.map(draftFromReserved)); };

  const create = async () => {
    if (busy || drafts.length) return;
    setBusy(true);
    try {
      const res = unwrap(await base44.functions.invoke('storageLabels',{
        action:'generate',request_key:requestKey.current,
        count:Number(count),container_type:containerType,
      }));
      if (res.error || !res.success || !Array.isArray(res.labels)) throw new Error(res.error || 'Could not reserve labels');
      showReserved(res.labels, res.batch_code);
      setBatches(prev => [{id:res.batch_id,batch_code:res.batch_code,requested_count:res.labels.length,status:'ready'},...prev.filter(b=>b.id!==res.batch_id)]);
      toast({ title: res.labels.length+' permanent labels reserved' });
    } catch(e) { notifyError('Label generation failed — retry with the same batch selection', e); }
    finally {setBusy(false)}
  };

  const loadBatch = async (id) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = unwrap(await base44.functions.invoke('storageLabels',{action:'get_batch',batch_id:id}));
      if (res.error || !res.success) throw new Error(res.error || 'Could not load batch');
      showReserved(res.labels||[], res.batch_code);
      toast({ title: 'Batch loaded for reprint' });
    } catch (e) { notifyError('Could not load batch', e); }
    finally {setBusy(false)}
  };

  const printThermal = () => {
    try {
      if (!printStorageLabelBatch(labels,{format:'thermal',batchCode})) notifyError('Pop-up blocked. Allow printing windows and retry.');
    } catch(e) { notifyError('Cannot print', e); }
  };
  const newBatch = () => { setLabels([]);setDrafts([]);setBatchCode('');requestKey.current=key(); };

  return <Dialog open onOpenChange={(isOpen)=>{if(!isOpen && !busy) onClose()}}>
    <DialogContent className={`bg-gray-900 border-gray-700 text-white w-[calc(100vw-20px)] ${drafts.length ? 'max-w-3xl' : 'max-w-lg'} max-h-[90dvh] flex flex-col overflow-hidden`}>
      <DialogHeader><DialogTitle className="flex gap-2 items-center"><Printer className="w-5 h-5"/> Storage Labels</DialogTitle></DialogHeader>
      <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1">
        {!drafts.length ? <>
          <div className="text-xs text-gray-400 flex gap-2 items-start">
            <ShieldCheck className="w-4 h-4 text-green-400 shrink-0"/>
            Reserve permanent QR labels before packing. They are not counted as occupied storage until activated by scanning.
          </div>
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
            <p className="text-sm font-semibold mb-2">Print existing containers</p>
            <ContainerLabelPicker containers={containers} onContinue={list => { setLabels([]); setBatchCode(''); setDrafts(list.map(draftFromContainer)); }} />
          </div>
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
          {batchCode && <div className="rounded-md border border-green-800/50 bg-green-950/20 p-3">
            <p className="text-green-300 text-sm font-semibold">{drafts.length} reserved labels</p>
            <p className="text-xs font-mono text-gray-400">{batchCode}</p>
          </div>}
          <ToteLabelStudio drafts={drafts} onChange={setDrafts} categories={categories} onThermal={labels.length ? printThermal : undefined} />
          <Button variant="outline" onClick={newBatch} className="w-full"><RotateCcw className="w-4 h-4 mr-2"/> Back</Button>
        </>}
        <p className="text-xs text-gray-500 flex gap-2"><ScanLine className="w-4 h-4 shrink-0"/> Scan a printed label later to assign its project and current location. Printing does not create Parts or inventory.</p>
      </div>
    </DialogContent>
  </Dialog>;
}