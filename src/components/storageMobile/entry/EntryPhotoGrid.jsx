import { Button } from "@/components/ui/button";
import PhotoGridTile from "@/components/inventory/photos/PhotoGridTile";

const GRID = "grid gap-1.5 grid-cols-3 sm:grid-cols-4";

/** Every photo of the item; in separate mode photos are selectable. */
export default function EntryPhotoGrid({ query, selecting, selected, onOpen, onToggle, onSeparate, onCancel }) {
  const { photos, isLoading, isError, error, refetch } = query;
  if (isLoading) return <div className={GRID}>{Array.from({ length: 3 }, (_, i) => <div key={i} className="aspect-square rounded-md bg-gray-800/60 animate-pulse" />)}</div>;
  if (isError) return <p className="text-sm text-red-300">{error.message} <button className="underline" onClick={() => refetch()}>Retry</button></p>;
  if (!photos.length) return <p className="rounded-lg border border-dashed border-gray-800 p-4 text-center text-sm text-gray-500">No photos yet. Tap Add Photos.</p>;
  return (
    <div className="space-y-2">
      {selecting && (
        <div className="sticky top-14 z-10 flex items-center gap-2 rounded-md border border-red-900/50 bg-gray-950/95 px-3 py-2">
          <span className="flex-1 text-xs text-gray-300">{selected.size ? `${selected.size} selected` : 'Tap photos to separate'}</span>
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 text-xs text-gray-400">Cancel</Button>
          <Button size="sm" disabled={!selected.size} onClick={onSeparate} className="h-8 text-xs">Separate</Button>
        </div>
      )}
      <div className={GRID}>
        {photos.map((p, i) => <PhotoGridTile key={p.id} photo={p} index={i} selecting={selecting} selected={selected.has(p.id)} onOpen={onOpen} onToggle={onToggle} onBroken={query.refreshLinks} />)}
      </div>
    </div>
  );
}