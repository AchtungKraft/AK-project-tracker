import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export function useProjectWorkflow(projectId, { enabled = true, dryRun = false } = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["projectWorkflow", projectId],
    queryFn: () => base44.functions.invoke("resolveProjectWorkflow", { project_id: projectId, dry_run: dryRun }),
    enabled: !!projectId && enabled,
    staleTime: 30000,
    select: (res) => res.data,
  });

  const recalculate = useMutation({
    mutationFn: () => base44.functions.invoke("resolveProjectWorkflow", { project_id: projectId, dry_run: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectWorkflow", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projectTasks", projectId] });
    },
  });

  return {
    workflow: query.data,
    tasks: query.data?.tasks || [],
    phases: query.data?.phases || [],
    warnings: query.data?.warnings || [],
    summary: query.data?.summary || null,
    isLoading: query.isLoading,
    error: query.error,
    recalculate: recalculate.mutate,
    isRecalculating: recalculate.isPending,
  };
}

export const OPERATIONAL_STATE_CONFIG = {
  NOT_STARTED: { label: "Not Started", color: "#6B7280", bgClass: "bg-gray-600/20", textClass: "text-gray-400" },
  READY: { label: "Ready", color: "#22C55E", bgClass: "bg-green-600/20", textClass: "text-green-400" },
  IN_PROGRESS: { label: "In Progress", color: "#F59E0B", bgClass: "bg-amber-600/20", textClass: "text-amber-400" },
  WAITING_ON_PARTS: { label: "Waiting on Parts", color: "#F97316", bgClass: "bg-orange-600/20", textClass: "text-orange-400" },
  WAITING_ON_VENDOR: { label: "Waiting on Vendor", color: "#8B5CF6", bgClass: "bg-purple-600/20", textClass: "text-purple-400" },
  WAITING_ON_CUSTOMER: { label: "Waiting on Customer", color: "#3B82F6", bgClass: "bg-blue-600/20", textClass: "text-blue-400" },
  BLOCKED: { label: "Blocked", color: "#EF4444", bgClass: "bg-red-600/20", textClass: "text-red-400" },
  REVIEW_REQUIRED: { label: "Review Required", color: "#A855F7", bgClass: "bg-violet-600/20", textClass: "text-violet-400" },
  COMPLETED: { label: "Completed", color: "#10B981", bgClass: "bg-emerald-600/20", textClass: "text-emerald-400" },
  CANCELLED: { label: "Cancelled", color: "#6B7280", bgClass: "bg-gray-600/20", textClass: "text-gray-500" },
};

export function getStateConfig(state) {
  return OPERATIONAL_STATE_CONFIG[state] || OPERATIONAL_STATE_CONFIG.NOT_STARTED;
}