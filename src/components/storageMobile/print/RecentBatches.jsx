import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const call = async (payload) => {
  const res = (await base44.functions.invoke('storageLabels', payload))?.data;
  if (!res?.success) throw new Error(res?.error || 'Unavailable');
  return res;
};

/** Already reserved batches: reprint the same numbers (e.g. after a cancelled print) without reserving new ones. */
export default function RecentBatches({ disabled, onLoad }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['storageLabelBatches'],
    queryFn: () => call({ action: 'list_batches' }).then((r) => r.batches.slice(0, 6)),
    staleTime: 15_000,
  });
  const open = async (b) => {
    setLoading(b.id);
    try { const r = await call({ action: 'get_batch', batch_id: b.id }); onLoad(r.labels || [], r.batch_code); }
    catch (e) { toast({ title: 'Could not load batch', description: e.message, variant: 'destructive' }); }
    finally { setLoading(null); }
  };
  return (
    <div className="border-t border-gray-800 pt-3">
      <p className="text-sm font-semibold text-white mb-2">Reprint a reserved batch</p>
      {isLoading ? <p className="text-xs text-gray-500">Loading…</p>
        : isError ? <p className="text-xs text-gray-500">Batch history unavailable.</p>
        : !data.length ? <p className="text-xs text-gray-500">No batches yet.</p>
        : <div className="space-y-1.5">{data.map((b) => (
          <button key={b.id} type="button" disabled={disabled || !!loading} onClick={() => open(b)}
            className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5 min-h-[48px] text-left active:bg-gray-800">
            <span className="text-xs font-mono text-gray-200 truncate">{b.batch_code || b.id.slice(-9)}</span>
            <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">{loading === b.id && <Loader2 className="w-3 h-3 animate-spin" />}{b.requested_count} · {b.container_type}</span>
          </button>))}
        </div>}
    </div>
  );
}