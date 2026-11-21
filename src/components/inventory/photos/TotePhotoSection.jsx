import { useCallback, useState } from "react";
import { useTotePhotos } from "./useTotePhotos";
import { useLocalPreference } from "./useLocalPreference";
import PhotoToolbar from "./PhotoToolbar";
import PhotoSelectionBar from "./PhotoSelectionBar";
import PhotoCollection from "./PhotoCollection";
import PhotoViewer from "./PhotoViewer";

const FILTER_LABEL = { all: 'All photos', unsorted: 'Unsorted photos', identified: 'Identified photos' };

/** Primary tote contents view: one unified, paged photo collection for this tote only. */
export default function TotePhotoSection({ container }) {
  const [filter, setFilter] = useState('all');
  const [view, setView] = useLocalPreference('ak_storage_photo_view', 'grid', ['grid', 'list']);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [viewerIndex, setViewerIndex] = useState(null);
  const query = useTotePhotos(container.id, filter);
  const { photos, counts } = query;

  const toggle = useCallback((id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);
  const changeFilter = (f) => { setFilter(f); setSelected(new Set()); setViewerIndex(null); };
  const endSelect = () => { setSelecting(false); setSelected(new Set()); };

  return (
    <section className="space-y-3 mb-5 pb-4 border-b border-gray-800" aria-label="Tote photos">
      <PhotoToolbar counts={counts} filter={filter} onFilter={changeFilter} view={view} onView={setView}
        selecting={selecting} onSelect={() => setSelecting(true)} />
      {selecting && (
        <PhotoSelectionBar count={selected.size} loaded={photos.length} total={query.filteredTotal ?? photos.length}
          filterLabel={FILTER_LABEL[filter]} onSelectAll={() => setSelected(new Set(photos.map((p) => p.id)))}
          onClear={() => setSelected(new Set())} onCancel={endSelect} />
      )}
      <PhotoCollection query={query} photos={photos} filter={filter} view={view}
        selecting={selecting} selected={selected} onOpen={setViewerIndex} onToggle={toggle} />
      {viewerIndex != null && (
        <PhotoViewer photos={photos} index={viewerIndex} total={query.filteredTotal} hasMore={!!query.hasNextPage}
          loadMore={() => query.fetchNextPage()} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </section>
  );
}