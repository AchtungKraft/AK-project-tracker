import { useLocalPreference } from "@/components/inventory/photos/useLocalPreference";
import TotePhotoSection from "@/components/inventory/photos/TotePhotoSection";
import ToteModeTabs from "./contents/ToteModeTabs";
import ToteContentsView from "./contents/ToteContentsView";
import ContentMoveHistory from "./ContentMoveHistory";

/** Contents (default) for what is inside; Photos for the full Phase C/D photo grid and organizing. */
export default function ToteContentsSection({ tote }) {
  const [mode, setMode] = useLocalPreference('ak_storage_tote_mode', 'contents', ['contents', 'photos']);
  return (
    <section className="space-y-2" aria-label="Tote contents">
      <ToteModeTabs mode={mode} onMode={setMode} />
      {mode === 'contents' ? <ToteContentsView tote={tote} /> : <TotePhotoSection container={tote} />}
      <ContentMoveHistory containerId={tote.id} />
    </section>
  );
}