import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import LabelQuantitySelector from "@/components/inventory/labels/LabelQuantitySelector";
import ToteLabelStudio from "@/components/inventory/labels/ToteLabelStudio";
import { draftFromReserved } from "@/components/inventory/labels/labelDrafts";
import { useStorageCategories } from "@/components/inventory/labels/useStorageCategories";
import { printToteLabelsMobile, mobilePreviewScale } from "@/lib/mobileLabelPrint";
import RecentBatches from "./RecentBatches";

const TYPES = ['box', 'tote', 'bin', 'crate']; // same choices as desktop batch labels
const newKey = () => crypto.randomUUID().replace(/-/g, '');
const unwrap = (r) => r?.data || r;

/**
 * New stickers through the existing reservation (storageLabels generate): permanent numbers come from
 * the global counter only when Reserve is tapped. Retrying uses the same request key, so a network
 * retry never reserves twice. Preview, print and cancel never reserve anything.
 */
export default function NewStickersPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: categories = [] } = useStorageCategories();
  const [type, setType] = useState('tote');
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [batchCode, setBatchCode] = useState('');
  const requestKey = useRef(newKey());
  const show = (labels, code) => { setDrafts(labels.map(draftFromReserved)); setBatchCode(code || ''); };
  const fail = (title, e) => toast({ title, description: e?.message, variant: 'destructive' });

  const reserve = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = unwrap(await base44.functions.invoke('storageLabels', { action: 'generate', request_key: requestKey.current, count, container_type: type }));
      if (!res?.success || !Array.isArray(res.labels)) throw new Error(res?.error || 'Could not reserve labels');
      show(res.labels, res.batch_code);
      qc.invalidateQueries({ queryKey: ['storageLabelBatches'] });
    } catch (e) { fail('Could not reserve labels. Tap Reserve again to retry safely.', e?.response?.data?.error ? new Error(e.response.data.error) : e); }
    finally { setBusy(false); }
  };
  const back = () => { setDrafts([]); setBatchCode(''); requestKey.current = newKey(); };

  if (drafts.length) return (
    <div className="space-y-3">
      <div className="rounded-lg border border-green-800/50 bg-green-950/20 p-3">
        <p className="text-green-300 text-sm font-semibold">{drafts.length} stickers reserved</p>
        <p className="text-xs font-mono text-gray-400 break-all">{batchCode}</p>
      </div>
      <ToteLabelStudio drafts={drafts} onChange={setDrafts} categories={categories} printLetter={printToteLabelsMobile} previewScale={mobilePreviewScale()} />
      <Button variant="outline" onClick={back} className="w-full h-11 gap-2"><RotateCcw className="w-4 h-4" /> Done</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <label className="text-xs text-gray-400 block">Label type
        <Select value={type} onValueChange={(v) => { setType(v); requestKey.current = newKey(); }}>
          <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
          <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      <LabelQuantitySelector value={count} onChange={(n) => { setCount(n); requestKey.current = newKey(); }} disabled={busy} />
      <p className="text-xs text-gray-400 flex gap-2"><ShieldCheck className="w-4 h-4 text-green-400 shrink-0" />
        Reserving assigns the next permanent numbers. You preview before printing, and unprinted stickers stay below for reprinting.</p>
      <Button onClick={reserve} disabled={busy} className="w-full h-12 text-base gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Reserve {count} stickers
      </Button>
      <RecentBatches disabled={busy} onLoad={show} />
    </div>
  );
}