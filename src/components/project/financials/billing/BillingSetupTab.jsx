import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import BillingStatusCard from "./BillingStatusCard";
import BillingAuthorizationPanel from "./BillingAuthorizationPanel";
import LaborReconciliationTable from "./LaborReconciliationTable";
import ProjectedPartsCostTable from "./ProjectedPartsCostTable";

// Admin project billing administration: status, authorization, projected labor reconciliation, projected part costs.
export default function BillingSetupTab({ projectId, lb, onGoToFunding }) {
  const auth = useQuery({
    queryKey: ["billingAuthorization", projectId],
    queryFn: async () => (await base44.functions.invoke("billingAuthorizationCore", { project_id: projectId, detail: true })).data,
    staleTime: 30000,
  });
  const billable = useQuery({
    queryKey: ["billableItems", projectId],
    queryFn: async () => (await base44.functions.invoke("resolveProjectBillableItems", { project_id: projectId })).data,
    staleTime: 15000,
  });
  const s = billable.data?.summary;
  const projected = s ? { labor: s.projected_labor_total || 0, parts: s.projected_parts_total || 0 } : null;
  return (
    <div className="space-y-4">
      <BillingStatusCard projectId={projectId} lb={lb} />
      {auth.isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        : !auth.data?.success ? <p className="text-sm text-red-400">Could not load billing authorization: {auth.error?.message || auth.data?.error}</p>
        : (
          <>
            <BillingAuthorizationPanel a={auth.data.authorization} earned={auth.data.earned_value} projected={projected} onGoToFunding={onGoToFunding} />
            <LaborReconciliationTable rows={auth.data.labor_reconciliation || []} />
            <ProjectedPartsCostTable rows={auth.data.projected_parts_tracking || []} />
          </>
        )}
    </div>
  );
}