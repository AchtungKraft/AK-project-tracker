import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storageMobile } from "@/lib/storageMobileApi";
import ToteRow from "./ToteRow";

/** Paged server-side tote search (20 per page). */
export default function SearchResults({ q, act }) {
  const query = useInfiniteQuery({
    queryKey: ['storageMobileSearch', q],
    queryFn: ({ pageParam }) => storageMobile('search', { q, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
  if (q.length < 2) return <p className="text-sm text-gray-500 py-2">Type a tote number, name, client, project, location, contents or part.</p>;
  if (query.isLoading) return <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</div>;
  if (query.isError) return <p className="text-sm text-amber-400 py-2">{query.error.message}</p>;
  const pages = query.data.pages;
  const rows = pages.flatMap((p) => p.results);
  if (!rows.length) return <p className="text-sm text-gray-500 py-2">No totes match “{q}”.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{pages[0].total} {pages[0].total === 1 ? 'tote' : 'totes'}</p>
      {rows.map((t) => <ToteRow key={t.id} tote={t} act={act} />)}
      {query.hasNextPage && (
        <Button variant="outline" className="w-full h-11" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />} Load more
        </Button>
      )}
    </div>
  );
}