import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Active internal team members (id, name, role only) from the same server check used on convert.
export default function useScopeAssigneeOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["scopeAssigneeOptions"],
    queryFn: async () => (await base44.functions.invoke("scopeEstimateBaseline", { action: "assignee_options" })).data,
    staleTime: 5 * 60 * 1000,
  });
  return { options: data?.options || [], isLoading };
}