import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import StorageGate from "@/components/storageMobile/StorageGate";
import ToteHeader from "@/components/storageMobile/ToteHeader";
import MoveToteDialog from "@/components/storageMobile/MoveToteDialog";
import TotePhotoSection from "@/components/inventory/photos/TotePhotoSection";
import QuickCaptureDialog from "@/components/inventory/capture/QuickCaptureDialog";
import { storageMobile, rememberTote } from "@/lib/storageMobileApi";

/** Photo-first tote screen for the shop floor. */
export default function StorageTote() {
  const { search } = useLocation();
  return <ToteScreen key={search} search={search} />;
}

function ToteScreen({ search }) {
  const params = new URLSearchParams(search);
  const id = params.get('id');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(params.get('do')); // 'capture' | 'move' | null
  const { data: tote, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['storageMobileContainer', id],
    queryFn: () => storageMobile('container', { container_id: id }).then((d) => d.container),
    enabled: !!id, retry: 1,
  });

  useEffect(() => {
    if (!tote?.id) return;
    rememberTote(tote.id).then((changed) => changed && qc.invalidateQueries({ queryKey: ['storageMobileRecent'] })).catch(() => {});
  }, [tote?.id, qc]);

  const body = !id ? <p className="text-gray-400">No tote selected.</p>
    : isLoading ? <div className="flex items-center gap-2 py-16 justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Opening tote…</div>
    : isError ? (
      <div className="py-12 text-center space-y-3">
        <p className="text-amber-400">{error.message}</p>
        <Link to="/storage" className="text-sm text-gray-300 underline">Back to Storage</Link>
      </div>
    ) : (
      <>
        <ToteHeader tote={tote} />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setOpen('capture')} className="h-12 text-base gap-2 bg-red-600 hover:bg-red-700 text-white">
            <Camera className="w-5 h-5" /> Capture
          </Button>
          <Button variant="outline" onClick={() => setOpen('move')} className="h-12 text-base gap-2">
            <ArrowRightLeft className="w-5 h-5" /> Move
          </Button>
        </div>
        <TotePhotoSection key={tote.id} container={tote} />
        {open === 'capture' && <QuickCaptureDialog container={tote} onClose={() => { setOpen(null); refetch(); }} />}
        {open === 'move' && (
          <MoveToteDialog tote={tote} onClose={() => setOpen(null)}
            onMoved={(dest) => { toast({ title: `Moved to ${dest?.location_area || 'new location'}` }); refetch(); qc.invalidateQueries({ queryKey: ['storageMobileRecent'] }); }} />
        )}
      </>
    );

  return (
    <StorageGate>
      <div className="mx-auto w-full max-w-3xl space-y-3 pb-4 min-w-0">{body}</div>
    </StorageGate>
  );
}