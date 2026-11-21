import { useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchTotePhotoPage } from "@/lib/totePhotoApi";

/** Paged, tote-scoped photo collection. Each photo appears once (deduped by id). */
export function useTotePhotos(containerId, filter) {
  const query = useInfiniteQuery({
    queryKey: ['storagePhotoGrid', containerId, filter],
    queryFn: ({ pageParam }) => fetchTotePhotoPage({ containerId, filter, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor || undefined,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const pages = query.data?.pages;
  const photos = useMemo(() => {
    const seen = new Set();
    return (pages || []).flatMap((p) => p.photos).filter((p) => !seen.has(p.id) && seen.add(p.id));
  }, [pages]);
  // Counts survive filter switches so the toolbar never flashes empty.
  const lastCounts = useRef(null);
  if (pages?.[0]?.counts) lastCounts.current = pages[0].counts;
  return { ...query, photos, counts: lastCounts.current, filteredTotal: pages?.[0]?.filtered_total ?? null };
}