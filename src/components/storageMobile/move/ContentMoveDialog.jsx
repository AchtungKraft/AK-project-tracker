import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import QRScanner from "@/components/inventory/QRScanner";
import OrganizeSheet from "@/components/inventory/photos/organize/OrganizeSheet";
import { toast } from "@/lib/notify";
import { storageMobile } from "@/lib/storageMobileApi";
import { newOpKey } from "@/lib/photoOrganizeApi";
import { describeSelection } from "../contents/contentLabels";
import { useContentMove } from "./useContentMove";
import DestinationPicker from "./DestinationPicker";
import MoveConfirmSummary from "./MoveConfirmSummary";

/** Move Selected Contents: whole items (with every photo) and unsorted photos to another tote. */
export default function ContentMoveDialog({ source, entries, photos, onClose, onMoved }) {
  const [dest, setDest] = useState(null);
  const [opKey, setOpKey] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [pickError, setPickError] = useState(null);
  const [resolving, setResolving] = useState(false);
  const { busy, error, run } = useContentMove(source.id);
  const description = describeSelection(entries, photos);

  const choose = (tote) => { setPickError(null); setDest(tote); setOpKey(newOpKey()); };
  const onScan = async (code) => {
    setScanning(false); setResolving(true); setPickError(null);
    try {
      const r = await storageMobile('resolve', { code });
      if (r.kind === 'reserved') throw new Error('That label has not been activated as a tote yet.');
      if (r.kind !== 'container') throw new Error(`That is a location code${r.location_name ? ` (${r.location_name})` : ''}. Scan the label on the destination tote.`);
      if (r.container_id === source.id) throw new Error('That is this same tote. Scan the destination tote.');
      choose((await storageMobile('container', { container_id: r.container_id })).container);
    } catch (e) { setPickError(e.message); }
    setResolving(false);
  };
  const confirm = async () => {
    const r = await run({ opKey, destinationId: dest.id, entryIds: entries.map((e) => e.id), photoIds: photos.map((p) => p.id) });
    if (!r) return;
    toast.success(`Moved ${description} to ${dest.short_code || dest.name}`);
    onMoved?.(r);
  };

  if (scanning) return <div className="fixed inset-0 z-[90] bg-black"><QRScanner onScan={onScan} onClose={() => setScanning(false)} className="h-full" /></div>;
  return (
    <OrganizeSheet title="Move to Another Tote" description={dest ? null : `${description} from ${source.short_code || source.name}`}
      busy={busy} onClose={onClose}>
      {!dest ? (
        <>
          {resolving && <p className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Reading label…</p>}
          {pickError && <p className="text-xs text-amber-300">{pickError}</p>}
          <DestinationPicker sourceId={source.id} onPick={choose} onScan={() => setScanning(true)} />
        </>
      ) : (
        <>
          <MoveConfirmSummary source={source} destination={dest} description={description} />
          {error && <p className="rounded border border-red-900/60 bg-red-950/30 p-2 text-xs text-red-200">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setDest(null)} disabled={busy} className="flex-1 h-11">Change tote</Button>
            <Button onClick={confirm} disabled={busy} className="flex-1 h-11 gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Confirm move</Button>
          </div>
        </>
      )}
    </OrganizeSheet>
  );
}