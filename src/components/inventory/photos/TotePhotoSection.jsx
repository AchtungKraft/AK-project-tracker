import { useCallback, useMemo, useState } from "react";
import { useTotePhotos } from "./useTotePhotos";
import { useLocalPreference } from "./useLocalPreference";
import PhotoToolbar from "./PhotoToolbar";
import PhotoSelectionBar from "./PhotoSelectionBar";
import PhotoCollection from "./PhotoCollection";
import PhotoViewer from "./PhotoViewer";
import PhotoOrganizeActions from "./organize/PhotoOrganizeActions";
import PhotoOrganizeDialogs from "./organize/PhotoOrganizeDialogs";
import OrganizeUndoBar from "./organize/OrganizeUndoBar";
import { selectionInfo } from "./organize/selectionInfo";

const FILTER_LABEL = { all: 'All photos', unsorted: 'Unsorted photos', identified: 'Identified photos' };

/** Primary tote contents view: one unified, paged photo collection for this tote only. */
export default function TotePhotoSection({ container }) {
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

  const toggle = useCallback((id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);
  const changeFilter = (f) => { setFilter(f); setSelected(new Set()); setViewerIndex(null); };
  const endSelect = useCallback(() => { setSelecting(false); setSelected(new Set()); setDialog(null); }, []);

  return (
    <section className="space-y-3 mb-5 pb-4 border-b border-gray-800" aria-label="Tote photos">
      <PhotoToolbar counts={counts} filter={filter} onFilter={changeFilter} view={view} onView={setView}
        selecting={selecting} onSelect={() => setSelecting(true)} />
      {selecting ? (
        <PhotoSelectionBar count={selected.size} loaded={photos.length} total={query.filteredTotal ?? photos.length}
          filterLabel={FILTER_LABEL[filter]} onSelectAll={() => setSelected(new Set(photos.map((p) => p.id)))}
          onClear={() => setSelected(new Set())} onCancel={endSelect}>
          <PhotoOrganizeActions info={info} onAction={setDialog} />
        </PhotoSelectionBar>
      ) : <OrganizeUndoBar containerId={container.id} />}
      <PhotoCollection query={query} photos={photos} filter={filter} view={view}
        selecting={selecting} selected={selected} onOpen={setViewerIndex} onToggle={toggle} />
      {viewerIndex != null && (
        <PhotoViewer photos={photos} index={viewerIndex} total={query.filteredTotal} hasMore={!!query.hasNextPage}
          loadMore={() => query.fetchNextPage()} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} />
      )}
      {dialog && selectedPhotos.length > 0 && (
        <PhotoOrganizeDialogs key={dialog} containerId={container.id} dialog={dialog} photos={selectedPhotos}
          onClose={() => setDialog(null)} onDone={endSelect} />
      )}
    </section>
  );
}