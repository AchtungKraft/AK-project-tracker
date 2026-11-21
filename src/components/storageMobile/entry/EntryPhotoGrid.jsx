import PhotoGridTile from "@/components/inventory/photos/PhotoGridTile";

const GRID = "grid gap-1.5 grid-cols-3 sm:grid-cols-4";

/** Every photo of the item; in separate mode photos are selectable. */
export default function EntryPhotoGrid({ query, selecting, selected, onOpen, onToggle }) {
  const { photos, isLoading, isError, error, refetch } = query;
  if (isLoading) return <div className={GRID}>{Array.from({ length: 3 }, (_, i) => <div key={i} className="aspect-square rounded-md bg-gray-800/60 animate-pulse" />)}</div>;
  if (isError) return <p className="text-sm text-red-300">{error.message} <button className="underline" onClick={() => refetch()}>Retry</button></p>;
  if (!photos.length) return <p className="rounded-lg border border-dashed border-gray-800 p-4 text-center text-sm text-gray-500">No photos yet. Tap Add Photos.</p>;
  return (
    <div className={GRID}>
      {photos.map((p, i) => <PhotoGridTile key={p.id} photo={p} index={i} selecting={selecting} selected={selected.has(p.id)} onOpen={onOpen} onToggle={onToggle} onBroken={query.refreshLinks} />)}
    </div>
  );
}