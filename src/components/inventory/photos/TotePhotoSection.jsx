import { useCallback, useMemo, useState } from "react";
import { useTotePhotos } from "./useTotePhotos";
import { useLocalPreference } from "./useLocalPreference";
import PhotoToolbar from "./PhotoToolbar";
import PhotoCollection from "./PhotoCollection";
import PhotoViewer from "./PhotoViewer";
import OrganizeUndoBar from "./organize/OrganizeUndoBar";
import { selectionInfo } from "./organize/selectionInfo";
import SelectionToolbar from "@/components/storageMobile/actions/SelectionToolbar";
import SelectionDialogs from "@/components/storageMobile/actions/SelectionDialogs";
import { selectionActions } from "@/components/storageMobile/actions/storageActions";

const FILTER_LABEL = { all: 'all photos', unsorted: 'unsorted photos', identified: 'identified photos' };
const seedFromPhoto = (p) => ({ name: p.group_name, photo_count: p.group_size, identified: p.identified, part_name: p.part_name, inventory_linked: p.inventory_linked, quantity: p.group_quantity });

/** Every photo of one tote, paged. onOpenItem (Storage Mobile) adds item detail and content moves. */
export default function TotePhotoSection({ container, onOpenItem }) {
  const [filter, setFilter] = useState('all');
  const [view, setView] = useLocalPreference('ak_storage_photo_view', 'grid', ['grid', 'list']);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [viewerIndex, setViewerIndex] = useState(null);
  const [dialog, setDialog] = useState(null);
  const query = useTotePhotos(container.id, filter);
  const { photos, counts } = query;
  const selectedPhotos = useMemo(() => photos.filter((p) => selected.has(p.id)), [photos, selected]);
  const info = useMemo(() => selectionInfo(selectedPhotos), [selectedPhotos]);
  const mobile = !!onOpenItem;
  const actions = useMemo(() => selectionActions(info, { photoLevel: true, canOpen: mobile, canMove: mobile }), [info, mobile]);

  const toggle = useCallback((id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);
  const changeFilter = (f) => { setFilter(f); setSelected(new Set()); setViewerIndex(null); };
  const endSelect = useCallback(() => { setSelecting(false); setSelected(new Set()); setDialog(null); }, []);
  const onAction = (key) => {
    if (key === 'view') return setViewerIndex(photos.indexOf(selectedPhotos[0]));
    if (key === 'open' || key === 'capture') {
      const p = selectedPhotos[0];
      onOpenItem(p.group_id, seedFromPhoto(p), key === 'capture' ? 'capture' : null);
      return endSelect();
    }
    setDialog(key);
  };
  const moveEntries = info.groups.map((g) => ({ id: g.id, name: g.name, photo_count: g.size }));
  const movePhotos = selectedPhotos.filter((p) => !p.group_id);

  return (
    <section className={mobile ? "space-y-2" : "space-y-3 mb-5 pb-4 border-b border-gray-800"} aria-label="Tote photos">
      <PhotoToolbar counts={counts} filter={filter} onFilter={changeFilter} view={view} onView={setView}
        selecting={selecting} onSelect={() => setSelecting(true)} />
      {!selecting && <OrganizeUndoBar containerId={container.id} />}
      <PhotoCollection query={query} photos={photos} filter={filter} view={view}
        selecting={selecting} selected={selected} onOpen={setViewerIndex} onToggle={toggle} />
      {selecting && (
        <SelectionToolbar count={selected.size} loaded={photos.length} total={query.filteredTotal ?? photos.length}
          scopeLabel={FILTER_LABEL[filter]} onSelectAll={() => setSelected(new Set(photos.map((p) => p.id)))}
          onClear={() => setSelected(new Set())} onCancel={endSelect} actions={actions} onAction={onAction} hint="Tap photos to select them." />
      )}
      {viewerIndex != null && viewerIndex >= 0 && (
        <PhotoViewer photos={photos} index={viewerIndex} total={query.filteredTotal} hasMore={!!query.hasNextPage}
          loadMore={() => query.fetchNextPage()} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} />
      )}
      <SelectionDialogs tote={container} dialog={dialog} photos={selectedPhotos} moveEntries={moveEntries} movePhotos={movePhotos}
        onClose={() => setDialog(null)} onDone={endSelect} />
    </section>
  );
}