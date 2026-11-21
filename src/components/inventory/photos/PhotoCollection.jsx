import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import PhotoGridTile from "./PhotoGridTile";
import PhotoListRow from "./PhotoListRow";

const GRID = "grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(96px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]";
const EMPTY = {
  all: 'No photos in this tote yet. Tap Capture Photos to start documenting it.',
  unsorted: 'No unsorted photos. Everything here belongs to a content entry.',
  identified: 'No identified items yet. Use Identify as Part on a content entry.',
};

/** Grid or list body with loading, empty, error and Load More states. */
export default function PhotoCollection({ query, photos, filter, view, selecting, selected, onOpen, onToggle }) {
  const { isLoading, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, filteredTotal } = query;
  if (isLoading) {
    return <div className={GRID}>{Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-square rounded-md bg-gray-800/60 animate-pulse" />)}</div>;
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300 space-y-2">
        <p>Photos could not be loaded. {error?.message}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 text-xs border-red-800 text-red-200">Try again</Button>
      </div>
    );
  }
  if (!photos.length) {
    return <p className="rounded-lg border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">{EMPTY[filter]}</p>;
  }
  const Item = view === 'list' ? PhotoListRow : PhotoGridTile;
  const remaining = (filteredTotal ?? photos.length) - photos.length;
  return (
    <div className="space-y-3">
      <div className={view === 'list' ? "space-y-1.5" : GRID}>
        {photos.map((p, i) => <Item key={p.id} photo={p} index={i} selecting={selecting} selected={selected.has(p.id)} onOpen={onOpen} onToggle={onToggle} />)}
      </div>
      {hasNextPage && (
        <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="w-full h-11 gap-2 border-gray-700 text-gray-200">
          {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />}
          Load more{remaining > 0 ? ` (${remaining} more)` : ''}
        </Button>
      )}
    </div>
  );
}