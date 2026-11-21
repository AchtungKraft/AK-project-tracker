import { useCallback, useMemo, useState } from "react";
import { useLocalPreference } from "@/components/inventory/photos/useLocalPreference";
import PhotoSelectionBar from "@/components/inventory/photos/PhotoSelectionBar";
import PhotoViewer from "@/components/inventory/photos/PhotoViewer";
import PhotoOrganizeDialogs from "@/components/inventory/photos/organize/PhotoOrganizeDialogs";
import ContentMoveDialog from "../move/ContentMoveDialog";
import EntryDetailSheet from "../entry/EntryDetailSheet";
import { itemKey, useToteContents } from "./useToteContents";
import { entryAsPhoto } from "./contentLabels";
import ContentsToolbar from "./ContentsToolbar";
import ContentsCollection from "./ContentsCollection";
import ContentsActions from "./ContentsActions";

/** Contents mode: one card per physical thing (whole item or unsorted photo). */
export default function ToteContentsView({ tote }) {
  const [view, setView] = useLocalPreference('ak_storage_contents_view', 'grid', ['grid', 'list']);
  const query = useToteContents(tote.id);
  const { items } = query;
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [dialog, setDialog] = useState(null);
  const unsorted = useMemo(() => items.filter((i) => i.kind === 'photo').map((i) => i.cover).filter(Boolean), [items]);
  const chosen = useMemo(() => items.filter((i) => selected.has(itemKey(i))), [items, selected]);
  const openItem = items.find((i) => i.kind === 'entry' && i.id === openId);

  const toggle = useCallback((item) => setSelected((s) => {
    const n = new Set(s); const k = itemKey(item);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  }), []);
  const open = useCallback((item) => {
    if (item.kind === 'entry') setOpenId(item.id);
    else setViewer(unsorted.findIndex((p) => p.id === item.id));
  }, [unsorted]);
  const endSelect = useCallback(() => { setSelecting(false); setSelected(new Set()); setDialog(null); }, []);
  const closeEntry = useCallback(() => setOpenId(null), []);

  return (
    <div className="space-y-2">
      <ContentsToolbar counts={query.counts} view={view} onView={setView} selecting={selecting} onSelect={() => setSelecting(true)} />
      {selecting && (
        <PhotoSelectionBar count={selected.size} loaded={items.length} total={query.total ?? items.length} filterLabel="Contents"
          onSelectAll={() => setSelected(new Set(items.map(itemKey)))} onClear={() => setSelected(new Set())} onCancel={endSelect}>
          <ContentsActions items={chosen} onAction={setDialog} />
        </PhotoSelectionBar>
      )}
      <ContentsCollection query={query} view={view} selecting={selecting} selected={selected} onOpen={open} onToggle={toggle} />
      {viewer != null && viewer >= 0 && (
        <PhotoViewer photos={unsorted} index={viewer} total={unsorted.length} hasMore={false} loadMore={() => {}} onIndex={setViewer} onClose={() => setViewer(null)} />
      )}
      {openItem && <EntryDetailSheet key={openItem.id} tote={tote} item={openItem} onClose={closeEntry} />}
      {dialog === 'move' && chosen.length > 0 && (
        <ContentMoveDialog source={tote} entries={chosen.filter((i) => i.kind === 'entry')} photos={chosen.filter((i) => i.kind === 'photo')}
          onClose={() => setDialog(null)} onMoved={endSelect} />
      )}
      {(dialog === 'details' || dialog === 'identify') && chosen[0]?.kind === 'entry' && (
        <PhotoOrganizeDialogs key={dialog} containerId={tote.id} dialog={dialog} photos={[entryAsPhoto(chosen[0])]} onClose={() => setDialog(null)} onDone={endSelect} />
      )}
    </div>
  );
}