import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { fetchStoredPropertyForContainer } from "@/components/inventory/ContainerStoredProperty";
import { useTotePhotos } from "@/components/inventory/photos/useTotePhotos";
import PhotoViewer from "@/components/inventory/photos/PhotoViewer";
import PhotoOrganizeDialogs from "@/components/inventory/photos/organize/PhotoOrganizeDialogs";
import { useOrganizeRunner } from "@/components/inventory/photos/organize/useOrganizeRunner";
import QuickCaptureDialog from "@/components/inventory/capture/QuickCaptureDialog";
import { newOpKey, organizePhotos } from "@/lib/photoOrganizeApi";
import ContentMoveDialog from "../move/ContentMoveDialog";
import { entryAsPhoto, plural } from "../contents/contentLabels";
import EntryDetailInfo from "./EntryDetailInfo";
import EntryDetailActions from "./EntryDetailActions";
import EntryPhotoGrid from "./EntryPhotoGrid";

/** One physical item: its photos, facts and actions. Reuses the existing content entry. */
export default function EntryDetailSheet({ tote, item, onClose }) {
  const query = useTotePhotos(tote.id, 'entry', item.id);
  const { data: entries } = useQuery({
    queryKey: ['storedPropertyContainer', tote.id], queryFn: () => fetchStoredPropertyForContainer(tote.id),
    staleTime: 20_000, refetchOnWindowFocus: false,
  });
  const entry = entries?.find((e) => e.id === item.id);
  const [dialog, setDialog] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const { run } = useOrganizeRunner(tote.id);

  // Item left this tote (moved, or all photos separated): close.
  useEffect(() => { if (entries && (!entry || entry.status !== 'in_storage' || entry.container_id !== tote.id)) onClose(); }, [entries, entry, tote.id, onClose]);

  const toggle = useCallback((id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const endSelect = useCallback(() => { setSelecting(false); setSelected(new Set()); setDialog(null); }, []);
  const organizeTarget = useMemo(() => {
    if (dialog === 'separate') return query.photos.filter((p) => selected.has(p.id));
    return query.photos.length ? query.photos : [entryAsPhoto(item)];
  }, [dialog, query.photos, selected, item]);
  const onAction = (key) => (key === 'separate' ? setSelecting(true) : setDialog(key));
  const addPhotos = (ids) => run(
    () => organizePhotos(tote.id, { operation: 'group_existing', target_property_id: item.id, op_key: newOpKey(), photo_ids: ids }),
    `Added ${plural(ids.length, 'photo')} to ${item.name}`,
  );

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-950 text-white" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-800 bg-gray-950/95 px-2 py-2 backdrop-blur" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg active:bg-gray-800" aria-label="Back to tote"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold leading-tight truncate">{entry?.name || item.name}</h2>
          <p className="text-[11px] text-gray-400 truncate">
            {plural(query.photos.length || item.photo_count, 'photo')} ·{' '}
            {item.identified ? <span className="font-semibold text-blue-300">Identified: {item.part_name || 'Catalog part'}</span> : 'Not identified'}
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-3xl space-y-3 p-3">
        <EntryPhotoGrid query={query} selecting={selecting} selected={selected} onOpen={setViewer} onToggle={toggle}
          onSeparate={() => setDialog('separate')} onCancel={endSelect} />
        <EntryDetailInfo entry={entry} item={item} tote={tote} />
        {!selecting && <EntryDetailActions item={item} onAction={onAction} />}
      </div>
      {viewer != null && <PhotoViewer photos={query.photos} index={viewer} total={query.photos.length} hasMore={false} loadMore={() => {}} onIndex={setViewer} onClose={() => setViewer(null)} />}
      {['details', 'identify', 'separate'].includes(dialog) && organizeTarget.length > 0 && (
        <PhotoOrganizeDialogs key={dialog} containerId={tote.id} dialog={dialog} photos={organizeTarget} onClose={() => setDialog(null)} onDone={endSelect} />
      )}
      {dialog === 'capture' && <QuickCaptureDialog container={tote} subtitle={`Photos are added to ${item.name}`} onSaved={addPhotos} onClose={() => setDialog(null)} />}
      {dialog === 'move' && <ContentMoveDialog source={tote} entries={[item]} photos={[]} onClose={() => setDialog(null)} onMoved={onClose} />}
    </div>,
    document.body,
  );
}