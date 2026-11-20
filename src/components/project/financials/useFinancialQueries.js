import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Shared queries (same keys everywhere, so each loads once per project).
export function useBillingAuthorization(projectId) {
  return useQuery({
    queryKey: ["billingAuthorization", projectId],
    queryFn: async () => (await base44.functions.invoke("billingAuthorizationCore", { project_id: projectId, detail: true })).data,
    enabled: !!projectId, staleTime: 30000,
  });
}

export function useScopeFunding(projectId) {
  const recon = useQuery({
    queryKey: ["scopeFundingRecon", projectId],
    queryFn: async () => (await base44.functions.invoke("getScopeFundingReconciliation", { project_id: projectId })).data,
    enabled: !!projectId, staleTime: 60000, retry: false,
  });
  const plan = useQuery({
    queryKey: ["scopeFundingPlan", projectId],
    queryFn: async () => (await base44.functions.invoke("scopeFundingPlanAction", { action: "get", project_id: projectId })).data,
    enabled: !!projectId, retry: false,
  });
  const forbidden = recon.error?.response?.status === 403 || plan.error?.response?.status === 403;
  const error = recon.error || plan.error;
  const errorText = error?.response?.data?.error || error?.message || (!recon.data?.success && recon.data?.error) || (!plan.data?.success && plan.data?.error) || null;
  return { recon, plan, forbidden, loading: recon.isLoading || plan.isLoading, errorText, ready: !!recon.data?.success && !!plan.data?.success };
}