/**
 * useServicesView — React hook for the canonical services read model.
 *
 * Replaces client-side joins (servicesMap, vendorsMap, projectsMap)
 * with a single backend call that returns pre-enriched data.
 *
 * Usage:
 *   const { commitments, summary, isLoading, refetch } = useServicesView();
 *   const { commitments } = useServicesView({ project_id: "..." });
 *   const { commitments } = useServicesView({ include_line_items: true });
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export const SERVICES_VIEW_KEY = "servicesView";

/**
 * Build a stable query key from filter params.
 */
function buildQueryKey(params = {}) {
  const parts = [SERVICES_VIEW_KEY];
  if (params.project_id) parts.push("proj", params.project_id);
  if (params.status) parts.push("status", params.status);
  if (params.vendor_id) parts.push("vendor", params.vendor_id);
  if (params.include_line_items) parts.push("withLines");
  return parts;
}

/**
 * Primary hook — fetches enriched service commitments from backend.
 */
export function useServicesView(params = {}) {
  const queryKey = buildQueryKey(params);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await base44.functions.invoke("getServicesView", params);
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    commitments: data?.commitments ?? [],
    summary: data?.summary ?? { total: 0, by_status: { planned: 0, ordered: 0, completed: 0, billed: 0 }, total_cost: 0, total_billable: 0, margin_pct: 0, cost_by_status: { planned: 0, ordered: 0, completed: 0, billed: 0 }, billable_by_status: { planned: 0, ordered: 0, completed: 0, billed: 0 } },
    isLoading,
    refetch,
    error,
  };
}

/**
 * Invalidate all services view queries (call after mutations).
 */
export function useInvalidateServicesView() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [SERVICES_VIEW_KEY] });
  };
}