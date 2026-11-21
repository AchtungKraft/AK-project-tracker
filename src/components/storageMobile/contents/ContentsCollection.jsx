import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import ContentCard from "./ContentCard";
import ContentRow from "./ContentRow";
import { itemKey } from "./useToteContents";

const GRID = "grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(104px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]";

/** Grid or list of tote contents with loading, empty, error and Load More states. */
export default function ContentsCollection({ query, view, selecting, selected, onOpen, onToggle }) {
  const { items, isLoading, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, total } = query;
  if (isLoading) {
    return <div className={GRID}>{Array.from({ length: 9 }, (_, i) => <div key={i} className="aspect-square rounded-lg bg-gray-800/60 animate-pulse" />)}</div>;
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-200 space-y-2">
        <p>Contents could not be loaded. {error?.message}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 text-xs">Try again</Button>
      </div>
    );
  }
  if (!items.length) {
    return <p className="rounded-lg border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">Nothing documented in this tote yet. Tap Capture to start.</p>;
  }
  const Item = view === 'list' ? ContentRow : ContentCard;
  const remaining = (total ?? items.length) - items.length;
  return (
    <div className="space-y-3">
      <div className={view === 'list' ? "space-y-1.5" : GRID}>
        {items.map((i) => <Item key={itemKey(i)} item={i} selecting={selecting} selected={selected.has(itemKey(i))} onOpen={onOpen} onToggle={onToggle} onBroken={query.refreshLinks} />)}
      </div>
      {hasNextPage && (
        <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="w-full h-11 gap-2 border-gray-700 text-gray-200">
          {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />}Load more{remaining > 0 ? ` (${remaining} more)` : ''}
        </Button>
      )}
    </div>
  );
}