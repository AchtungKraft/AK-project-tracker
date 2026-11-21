import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useLocalPreference } from "@/components/inventory/photos/useLocalPreference";
import TotePhotoSection from "@/components/inventory/photos/TotePhotoSection";
import ToteModeTabs from "./contents/ToteModeTabs";
import ToteContentsView from "./contents/ToteContentsView";
import EntryDetailSheet from "./entry/EntryDetailSheet";
import ContentMoveHistory from "./ContentMoveHistory";

/**
 * Contents (default) and Photos share one tote screen. A mode stays mounted once visited,
 * so switching back keeps its filter, selection and scroll. Item detail lives in the URL
 * (?item=) so browser Back closes it and direct links open it.
 */
export default function ToteContentsSection({ tote }) {
  const [mode, setMode] = useLocalPreference('ak_storage_tote_mode', 'contents', ['contents', 'photos']);
  const [visited, setVisited] = useState(() => new Set([mode]));
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const itemId = params.get('item');

  const changeMode = (m) => { setMode(m); setVisited((v) => new Set(v).add(m)); };
  const openItem = useCallback((id, seed, action = null) => {
    const next = new URLSearchParams(params); next.set('item', id); next.delete('do');
    navigate({ search: next.toString() }, { state: { fromTote: true, seed, action } });
  }, [params, navigate]);
  const closing = useRef(null);
  const closeItem = useCallback(() => {
    if (closing.current === itemId) return; // Back tapped twice, or the item also left the tote
    closing.current = itemId;
    if (location.state?.fromTote) { navigate(-1); return; }
    const next = new URLSearchParams(params); next.delete('item');
    setParams(next, { replace: true });
  }, [itemId, location.state, navigate, params, setParams]);

  return (
    <section className="space-y-2" aria-label="Tote contents">
      <ToteModeTabs mode={mode} onMode={changeMode} />
      {visited.has('contents') && <div hidden={mode !== 'contents'}><ToteContentsView tote={tote} onOpenItem={openItem} /></div>}
      {visited.has('photos') && <div hidden={mode !== 'photos'}><TotePhotoSection container={tote} onOpenItem={openItem} /></div>}
      <ContentMoveHistory containerId={tote.id} />
      {itemId && (
        <EntryDetailSheet key={itemId} tote={tote} itemId={itemId} seed={location.state?.seed} initialAction={location.state?.action}
          onClose={closeItem} />
      )}
    </section>
  );
}