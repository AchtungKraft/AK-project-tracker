import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Which existing commitment an "add part" request should increment.
 * Regular projects: unchanged (the existing record for the part).
 * AK STOCK: only an open buyer stock order (STOCK_MANUAL) — never an automatic
 * replenishment record, a legacy stock-holding record, or a closed/received order.
 * Prefers the one not yet ordered (mirrors executeSupplyAction dedup).
 */
export function pickAddPartMergeTarget(commitments, partId, isAkStock) {
  const forPart = commitments.filter((c) => c.part_id === partId);
  if (!isAkStock) return forPart[0] || null;
  const open = forPart.filter(
    (c) => c.demand_source === "STOCK_MANUAL" && !c.is_archived && !["closed", "cancelled"].includes(c.commitment_status)
  );
  return open.find((c) => c.commitment_status === "planned" && !(c.covered_from_po > 0) && !(c.qty_installed > 0)) || open[0] || null;
}

export function useIsAkStockProject(projectId) {
  const { data } = useQuery({
    queryKey: ["project-is-ak-stock", projectId],
    queryFn: async () => {
      const [p] = await base44.entities.Project.filter({ id: projectId });
      return p?.is_system_project === true && p?.system_project_type === "AK_STOCK";
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
  return data === true;
}