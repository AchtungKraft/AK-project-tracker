import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { storageMobile } from "@/lib/storageMobileApi";
import MoveContainerModal from "@/components/inventory/MoveContainerModal";

/** Existing secured container move (transferInventoryBatch), fed with just the active locations. */
export default function MoveToteDialog({ tote, onClose, onMoved }) {
  const { data: locations, isLoading, isError, error } = useQuery({
    queryKey: ['storageMobileLocations'],
    queryFn: () => storageMobile('locations').then((d) => d.locations || []),
    staleTime: 60_000,
  });
  if (isLoading || isError) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
        <div className="rounded-xl bg-gray-900 px-5 py-4 text-sm text-gray-200 flex items-center gap-2">
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading locations…</> : error.message}
        </div>
      </div>
    );
  }
  return <MoveContainerModal container={tote} locations={locations} allowScan title="Move Tote" onMoved={onMoved} onClose={onClose} />;
}