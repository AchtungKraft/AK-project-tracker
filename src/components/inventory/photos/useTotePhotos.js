import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchTotePhotoPage } from "@/lib/totePhotoApi";

// Preview links are signed for 60 minutes; loaded pages are re-signed before that.
const RESIGN_AFTER = 45 * 60_000;
const BROKEN_RETRY_GAP = 2 * 60_000;

/** Paged, tote-scoped photo collection. Each photo appears once (deduped by id). */
export function useTotePhotos(containerId, filter) {
  const query = useInfiniteQuery({
    queryKey: ['storagePhotoGrid', containerId, filter],
    queryFn: ({ pageParam }) => fetchTotePhotoPage({ containerId, filter, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor || undefined,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: RESIGN_AFTER,
    retry: 1,
  });
  const { refetch, dataUpdatedAt } = query;
  const pages = query.data?.pages;
  const photos = useMemo(() => {
    const seen = new Set();
    return (pages || []).flatMap((p) => p.photos).filter((p) => !seen.has(p.id) && seen.add(p.id));
  }, [pages]);

  // Returning to a tote left open (phone locked, app in background): re-sign if links are old.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && dataUpdatedAt && Date.now() - dataUpdatedAt > RESIGN_AFTER) refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch, dataUpdatedAt]);

  // A preview that fails to load (usually an expired link) re-signs the loaded pages, at most every 2 min.
  const lastRetry = useRef(0);
  const refreshLinks = useCallback(() => {
    if (Date.now() - lastRetry.current < BROKEN_RETRY_GAP) return;
    lastRetry.current = Date.now();
    refetch();
  }, [refetch]);

  // Counts survive filter switches so the toolbar never flashes empty.
  const lastCounts = useRef(null);
  if (pages?.[0]?.counts) lastCounts.current = pages[0].counts;
  return { ...query, photos, refreshLinks, counts: lastCounts.current, filteredTotal: pages?.[0]?.filtered_total ?? null };
}