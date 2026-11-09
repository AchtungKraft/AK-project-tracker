import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { hasEstimateAccess } from "./taskEstimateAccess";

// Returns true only when the server confirms the signed-in user may view task-level estimates.
// Denied, loading and error all return false, so nothing renders and nothing else is fetched.
export default function useTaskEstimateAccess() {
  const { data } = useQuery({
    queryKey: ["scopeEstimateAccess"],
    queryFn: async () => (await base44.functions.invoke("scopeEstimateBaseline", { action: "estimate_access" })).data,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return hasEstimateAccess(data);
}