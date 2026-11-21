import { useCallback, useMemo, useState } from "react";
import { useLocalPreference } from "@/components/inventory/photos/useLocalPreference";
import PhotoViewer from "@/components/inventory/photos/PhotoViewer";
import SelectionToolbar from "../actions/SelectionToolbar";
import SelectionDialogs from "../actions/SelectionDialogs";
import { selectionActions } from "../actions/storageActions";
import { itemKey, useToteContents } from "./useToteContents";
import { entryAsPhoto } from "./contentLabels";
import ContentsToolbar from "./ContentsToolbar";
import ContentsCollection from "./ContentsCollection";

const asGroup = (i) => ({ id: i.id, name: i.name, size: i.photo_count, selected: i.photo_count, identified: i.identified, part_name: i.part_name, tracked: i.inventory_linked });
// Item detail opens with what the card already knows; it then loads its own live data.
export const itemSeed = (i) => ({ name: i.name, photo_count: i.photo_count, identified: i.identified, part_name: i.part_name, inventory_linked: i.inventory_linked, quantity: i.quantity });

/** Contents mode: one card per physical thing (whole item or unsorted photo). */
export default function ToteContentsView({ tote, onOpenItem }) {
  const [view, setView] = useLocalPreference('ak_storage_contents_view', 'grid', ['grid', 'list']);
  const query = useToteContents(tote.id);
  const { items } = query;
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [viewer, setViewer] = useState(null);
  const [dialog, setDialog] = useState(null);
  const unsorted = useMemo(() => items.filter((i) => i.kind === 'photo').map((i) => i.cover).filter(Boolean), [items]);
  const chosen = useMemo(() => items.filter((i) => selected.has(itemKey(i))), [items, selected]);
  const entries = chosen.filter((i) => i.kind === 'entry');
  const photos = chosen.filter((i) => i.kind === 'photo');
  const actions = useMemo(() => selectionActions({ unsorted: photos.length, groups: entries.map(asGroup) }), [photos.length, entries]);

  const toggle = useCallback((item) => setSelected((s) => {
    const n = new Set(s); const k = itemKey(item);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  }), []);
  const viewPhoto = useCallback((id) => setViewer(unsorted.findIndex((p) => p.id === id)), [unsorted]);
  const open = useCallback((item) => (item.kind === 'entry' ? onOpenItem(item.id, itemSeed(item)) : viewPhoto(item.id)), [onOpenItem, viewPhoto]);
  const endSelect = useCallback(() => { setSelecting(false); setSelected(new Set()); setDialog(null); }, []);
  const onAction = (key) => {
    if (key === 'view') return viewPhoto(photos[0].id);
    if (['open', 'capture', 'separate'].includes(key)) { onOpenItem(entries[0].id, itemSeed(entries[0]), key === 'open' ? null : key); return endSelect(); }
    setDialog(key);
  };
  const organizeTarget = ['details', 'identify'].includes(dialog) ? [entryAsPhoto(entries[0])] : photos.map((p) => p.cover).filter(Boolean);

  return (
    <div className="space-y-2">
      <ContentsToolbar counts={query.counts} view={view} onView={setView} selecting={selecting} onSelect={() => setSelecting(true)} />
      <ContentsCollection query={query} view={view} selecting={selecting} selected={selected} onOpen={open} onToggle={toggle} />
      {selecting && (
        <SelectionToolbar count={selected.size} loaded={items.length} total={query.total ?? items.length} scopeLabel="contents"
          onSelectAll={() => setSelected(new Set(items.map(itemKey)))} onClear={() => setSelected(new Set())} onCancel={endSelect}
          actions={actions} onAction={onAction} hint="Tap items or photos to select them." />
      )}
      {viewer != null && viewer >= 0 && (
        <PhotoViewer photos={unsorted} index={viewer} total={unsorted.length} hasMore={false} loadMore={() => {}} onIndex={setViewer} onClose={() => setViewer(null)} />
      )}
      <SelectionDialogs tote={tote} dialog={dialog} photos={organizeTarget} moveEntries={entries} movePhotos={photos}
        onClose={() => setDialog(null)} onDone={endSelect} />
    </div>
  );
}