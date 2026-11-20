import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { invoiceKeys } from "@/components/financial/queryKeyFactories";

// Every deposit read and write goes through the secured projectDepositAction backend.
export async function depositAction(payload) {
  const res = await base44.functions.invoke("projectDepositAction", payload).catch((e) => e.response || { data: { error: e.message } });
  return res.data || { error: "No response" };
}

export function useProjectDeposits(projectId) {
  return useQuery({
    queryKey: ["projectDeposits", projectId],
    queryFn: () => depositAction({ action: "summary", project_id: projectId }),
    enabled: !!projectId,
  });
}

export function useDepositRefresh(projectId) {
  const qc = useQueryClient();
  return () => Promise.all([
    ["projectDeposits", projectId], ["projectFinancialOverview", projectId], ["billingAuthorization", projectId], ["scopeFundingRecon", projectId], invoiceKeys.view(projectId),
  ].map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export const newKey = () => crypto.randomUUID();