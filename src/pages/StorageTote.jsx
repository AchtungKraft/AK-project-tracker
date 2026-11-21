import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Camera, Loader2, Printer } from "lucide-react";
import PrintStickersDialog from "@/components/storageMobile/print/PrintStickersDialog";
import { Button } from "@/components/ui/button";
import StorageGate from "@/components/storageMobile/StorageGate";
import ToteHeader from "@/components/storageMobile/ToteHeader";
import MoveToteDialog from "@/components/storageMobile/MoveToteDialog";
import ToteContentsSection from "@/components/storageMobile/ToteContentsSection";
import QuickCaptureDialog from "@/components/inventory/capture/QuickCaptureDialog";
import { storageMobile, rememberTote } from "@/lib/storageMobileApi";

/** Photo-first tote screen for the shop floor. Remounts only when the tote changes, not when ?item= changes. */
export default function StorageTote() {
  const [params] = useSearchParams();
  const id = params.get('id');
  return <ToteScreen key={id || 'none'} id={id} />;
}

function ToteScreen({ id }) {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(() => params.get('do')); // 'capture' | 'move' | null
  const { data: tote, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['storageMobileContainer', id],
    queryFn: () => storageMobile('container', { container_id: id }).then((d) => d.container),
    enabled: !!id, retry: 1,
  });

  useEffect(() => {
    if (!tote?.id) return;
    rememberTote(tote.id).then((changed) => changed && qc.invalidateQueries({ queryKey: ['storageMobileRecent'] })).catch(() => {});
  }, [tote?.id, qc]);

  // Closing an action opened from a link (?do=) clears it, so a reload does not reopen it.
  const close = () => {
    setOpen(null);
    if (params.get('do')) { const next = new URLSearchParams(params); next.delete('do'); setParams(next, { replace: true }); }
  };

  const body = !id ? <p className="text-gray-400">No tote selected. <Link to="/storage" className="underline">Back to Storage</Link></p>
    : isLoading ? <div className="flex items-center gap-2 py-16 justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Opening tote…</div>
    : isError ? (
      <div className="py-12 text-center space-y-3">
        <p className="text-amber-400">{error.message}</p>
        <Link to="/storage" className="text-sm text-gray-300 underline">Back to Storage</Link>
      </div>
    ) : (
      <>
        <ToteHeader tote={tote} />
        <div className="flex gap-2">
          <Button onClick={() => setOpen('capture')} className="flex-1 h-11 text-sm gap-2">
            <Camera className="w-5 h-5" /> Capture Photos
          </Button>
          <Button variant="outline" onClick={() => setOpen('move')} className="h-11 px-3 text-sm gap-1.5">
            <ArrowRightLeft className="w-4 h-4" /> Move Tote
          </Button>
          <Button variant="outline" onClick={() => setOpen('print')} className="h-11 px-3 text-sm" aria-label="Print Label" title="Print Label">
            <Printer className="w-4 h-4" />
          </Button>
        </div>
        <ToteContentsSection key={tote.id} tote={tote} />
        {open === 'capture' && <QuickCaptureDialog container={tote} onClose={() => { close(); refetch(); }} />}
        {open === 'print' && <PrintStickersDialog tote={tote} onClose={() => { close(); refetch(); }} />}
        {open === 'move' && (
          <MoveToteDialog tote={tote} onClose={close}
            onMoved={() => {
              refetch();
              qc.invalidateQueries({ queryKey: ['storageMobileRecent'] });
              qc.invalidateQueries({ queryKey: ['storageMobileSearch'] });
            }} />
        )}
      </>
    );

  return (
    <StorageGate>
      <div className="mx-auto w-full max-w-3xl space-y-2.5 pb-4 min-w-0">{body}</div>
    </StorageGate>
  );
}