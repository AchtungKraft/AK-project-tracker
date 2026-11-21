import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { fetchStoredPropertyForContainer } from "@/components/inventory/ContainerStoredProperty";
import { useTotePhotos } from "@/components/inventory/photos/useTotePhotos";
import PhotoViewer from "@/components/inventory/photos/PhotoViewer";
import QuickCaptureDialog from "@/components/inventory/capture/QuickCaptureDialog";
import SelectionDialogs from "../actions/SelectionDialogs";
import SelectionToolbar from "../actions/SelectionToolbar";
import { entryAsPhoto, plural } from "../contents/contentLabels";
import EntryDetailInfo from "./EntryDetailInfo";
import EntryDetailActions from "./EntryDetailActions";
import EntryPhotoGrid from "./EntryPhotoGrid";

const SEPARATE = [{ key: 'separate', label: 'Separate Photos', primary: true }];

/** One physical item: its photos, facts and actions. Built from live data, so it is always current. */
export default function EntryDetailSheet({ tote, itemId, seed, initialAction, onClose }) {
  const query = useTotePhotos(tote.id, 'entry', itemId);
  const { data: entries } = useQuery({
    queryKey: ['storedPropertyContainer', tote.id], queryFn: () => fetchStoredPropertyForContainer(tote.id),
    staleTime: 20_000, refetchOnWindowFocus: false,
  });
  const entry = entries?.find((e) => e.id === itemId);
  const [dialog, setDialog] = useState(initialAction === 'capture' ? 'capture' : null);
  const [viewer, setViewer] = useState(null);
  const [selecting, setSelecting] = useState(initialAction === 'separate');
  const [selected, setSelected] = useState(() => new Set());
  const location = useLocation();
  const navigate = useNavigate();

  // The opening action runs once; do not replay it after a reload.
  useEffect(() => {
    if (location.state?.action) navigate({ search: location.search }, { replace: true, state: { ...location.state, action: null } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Item left this tote (moved, or all photos separated): close.
  useEffect(() => { if (entries && (!entry || entry.status !== 'in_storage' || entry.container_id !== tote.id)) onClose(); }, [entries, entry, tote.id, onClose]);

  const first = query.photos[0];
  const item = useMemo(() => ({
    kind: 'entry', id: itemId, cover: first,
    name: entry?.name ?? seed?.name ?? 'Item',
    photo_count: query.filteredTotal ?? (query.photos.length || seed?.photo_count || 0),
    identified: entry ? !!entry.catalog_part_id : !!seed?.identified,
    part_name: (first?.identified ? first.part_name : null) ?? seed?.part_name ?? null,
    inventory_linked: entry ? !!entry.converted_inventory_item_id : !!seed?.inventory_linked,
    quantity: entry ? (entry.quantity_known ? entry.quantity : null) : seed?.quantity ?? null,
    description: entry?.description, notes: entry?.notes,
  }), [itemId, entry, seed, first, query.filteredTotal, query.photos.length]);

  const toggle = useCallback((id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const endSelect = useCallback(() => { setSelecting(false); setSelected(new Set()); setDialog(null); }, []);
  const organizeTarget = dialog === 'separate' ? query.photos.filter((p) => selected.has(p.id)) : (query.photos.length ? query.photos : [entryAsPhoto(item)]);
  const onAction = (key) => (key === 'separate' ? setSelecting(true) : setDialog(key));

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-950 text-white" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-800 bg-gray-950/95 px-2 py-2 backdrop-blur" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg active:bg-gray-800" aria-label="Back to tote"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold leading-tight truncate">{item.name}</h2>
          <p className="text-[11px] text-gray-400 truncate">
            {plural(item.photo_count, 'photo')} ·{' '}
            {item.identified ? <span className="font-semibold text-blue-300">Identified: {item.part_name || 'Catalog part'}</span> : 'Not identified'}
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-3xl space-y-3 p-3">
        <EntryPhotoGrid query={query} selecting={selecting} selected={selected} onOpen={setViewer} onToggle={toggle} />
        {selecting && (
          <SelectionToolbar placement="sheet" count={selected.size} loaded={query.photos.length} total={query.photos.length}
            scopeLabel="this item's photos" onCancel={endSelect} actions={SEPARATE} onAction={() => setDialog('separate')}
            hint="Tap the photos to separate from this item." />
        )}
        <EntryDetailInfo entry={entry} item={item} tote={tote} />
        {!selecting && <EntryDetailActions item={item} onAction={onAction} />}
      </div>
      {viewer != null && <PhotoViewer photos={query.photos} index={viewer} total={query.photos.length} hasMore={false} loadMore={() => {}} onIndex={setViewer} onClose={() => setViewer(null)} />}
      {dialog === 'capture' && <QuickCaptureDialog container={tote} target={{ id: itemId, name: item.name }} onClose={() => setDialog(null)} />}
      {dialog !== 'capture' && (
        <SelectionDialogs tote={tote} dialog={dialog} photos={organizeTarget} moveEntries={[item]} movePhotos={[]}
          onClose={() => setDialog(null)} onDone={dialog === 'move' ? onClose : endSelect} />
      )}
    </div>,
    document.body,
  );
}