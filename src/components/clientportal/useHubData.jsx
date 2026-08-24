import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Resilient data loader for ClientPortalHub.
 *
 * Primary path: getClientPortalHubData backend function (single optimized call).
 * Fallback path: 4 parallel direct entity reads (same shape).
 *
 * On any error, distinguishes between:
 *   - Successful load (data.requests is a valid array)
 *   - API/function error (throws, enabling React Query error state)
 *   - Malformed response (throws)
 */

async function fetchViaBackendFunction() {
  const response = await base44.functions.invoke('getClientPortalHubData', {});
  const data = response?.data;

  // Validate response shape
  if (!data || !Array.isArray(data.requests)) {
    throw new Error(
      `getClientPortalHubData returned malformed response: ` +
      `data=${typeof data}, requests=${typeof data?.requests}`
    );
  }

  return {
    source: 'getClientPortalHubData',
    requests: data.requests,
    comments: data.comments || [],
    decisions: data.decisions || [],
    attachments: data.attachments || [],
  };
}

async function fetchViaDirectEntities() {
  const [requests, comments, decisions, attachments] = await Promise.all([
    base44.entities.ClientFeedbackRequest.list(),
    base44.entities.ClientFeedbackComment.list(),
    base44.entities.ClientFeedbackDecision.list(),
    base44.entities.ClientFeedbackAttachment.list(),
  ]);

  return {
    source: 'direct-fallback',
    requests: requests || [],
    comments: comments || [],
    decisions: decisions || [],
    attachments: attachments || [],
  };
}

async function loadHubData() {
  let result;
  let primaryError = null;

  // Try primary path
  try {
    result = await fetchViaBackendFunction();
  } catch (err) {
    primaryError = err;
    console.warn('[ClientPortalHub] Primary loader failed, attempting direct fallback:', err?.message || err);
  }

  // If primary failed, try fallback
  if (!result) {
    try {
      result = await fetchViaDirectEntities();
    } catch (fallbackErr) {
      // Both paths failed — throw a combined error so React Query surfaces it
      const msg = `Hub data load failed. Primary: ${primaryError?.message || 'unknown'}. Fallback: ${fallbackErr?.message || 'unknown'}`;
      console.error('[ClientPortalHub]', msg);
      throw new Error(msg);
    }
  }

  // Production-safe diagnostic log
  console.log('[ClientPortalHub] Data loaded', {
    source: result.source,
    requestsCount: result.requests.length,
    commentsCount: result.comments.length,
    decisionsCount: result.decisions.length,
    attachmentsCount: result.attachments.length,
  });

  return result;
}

/**
 * Hook for ClientPortalHub data with built-in resilience.
 * Returns { data, isLoading, isError, error, refetch }
 */
export function useHubData() {
  const query = useQuery({
    queryKey: ["clientPortalHubData"],
    queryFn: loadHubData,
    staleTime: 15000,
    refetchOnMount: true,
    retry: 1, // One automatic retry before surfacing error
  });

  return {
    data: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}