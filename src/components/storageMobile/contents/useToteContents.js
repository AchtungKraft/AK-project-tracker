import { useCallback, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchToteContentsPage } from "@/lib/totePhotoApi";

const RESIGN_AFTER = 45 * 60_000;
export const itemKey = (i) => `${i.kind}:${i.id}`;

/** Paged contents of one tote: one item per content entry and one per unsorted photo. */
export function useToteContents(containerId) {
  // Under the photo grid key, so every organizing or capture refresh also refreshes Contents.
  const query = useInfiniteQuery({
    queryKey: ['storagePhotoGrid', containerId, 'contents'],
    queryFn: ({ pageParam }) => fetchToteContentsPage({ containerId, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor || undefined,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: RESIGN_AFTER,
    retry: 1,
  });
  const { refetch } = query;
  const pages = query.data?.pages;
  const items = useMemo(() => {
    const seen = new Set();
    return (pages || []).flatMap((p) => p.items).filter((i) => !seen.has(itemKey(i)) && seen.add(itemKey(i)));
  }, [pages]);
  const lastRetry = useRef(0);
  const refreshLinks = useCallback(() => {
    if (Date.now() - lastRetry.current < 2 * 60_000) return;
    lastRetry.current = Date.now();
    refetch();
  }, [refetch]);
  const lastCounts = useRef(null);
  if (pages?.[0]?.counts) lastCounts.current = pages[0].counts;
  return { ...query, items, refreshLinks, counts: lastCounts.current, total: pages?.[0]?.total ?? null };
}