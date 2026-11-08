import { invalidateProjectCaches } from "@/components/tasks/useTaskInteraction";

export function invalidateBaselineCaches(queryClient, requestId, projectId) {
  queryClient.invalidateQueries({ queryKey: ["scopeReviewData", requestId] });
  queryClient.invalidateQueries({ queryKey: ["scopeBaselinePreview", requestId] });
  queryClient.invalidateQueries({ queryKey: ["scopeBaselineReconciliation", requestId] });
  queryClient.invalidateQueries({ queryKey: ["taskScopeEstimate"] });
  if (projectId) invalidateProjectCaches(queryClient, projectId);
}