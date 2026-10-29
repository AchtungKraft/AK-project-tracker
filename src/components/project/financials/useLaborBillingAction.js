import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Calls the admin-only laborBillingAction and refreshes the financial overview.
export default function useLaborBillingAction(projectId) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await base44.functions.invoke("laborBillingAction", { project_id: projectId, ...payload }).catch((e) => e.response || { data: { error: e.message } });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectFinancialOverview", projectId] }),
    onError: (e) => toast({ title: "Labor billing not saved", description: e.message, variant: "destructive" }),
  });
}