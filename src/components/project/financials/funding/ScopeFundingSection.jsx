import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import BillingDisabledNotice from "./BillingDisabledNotice";
import FundingVsReconDashboard from "./FundingVsReconDashboard";
import ReconTotals from "./ReconTotals";
import ReconTree from "./ReconTree";
import UnattributedPanel from "./UnattributedPanel";
import FundingPlanEditor from "./FundingPlanEditor";
import MilestoneStatusList from "./MilestoneStatusList";
import TaskCostComparison from "./TaskCostComparison";

const Sub = ({ title, children }) => <div className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h4>{children}</div>;

// Admin-only. Read-only reconciliation + DRAFT funding plan. No invoice action exists in this section.
export default function ScopeFundingSection({ projectId }) {
  const [showUnattr, setShowUnattr] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const recon = useQuery({ queryKey: ["scopeFundingRecon", projectId], queryFn: async () => (await base44.functions.invoke("getScopeFundingReconciliation", { project_id: projectId })).data, enabled: !!projectId, staleTime: 60000, retry: false });
  const plan = useQuery({ queryKey: ["scopeFundingPlan", projectId], queryFn: async () => (await base44.functions.invoke("scopeFundingPlanAction", { action: "get", project_id: projectId })).data, enabled: !!projectId, retry: false });
  if (recon.error?.response?.status === 403 || plan.error?.response?.status === 403) return null;
  const err = recon.error || plan.error;
  const d = recon.data;
  return (
    <section className="rounded-lg border border-violet-900/50 bg-violet-950/10 p-4 space-y-4" aria-label="Funding vs Reconciliation">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-white">Funding vs Reconciliation <span className="text-xs font-normal text-violet-300">(admin · down payment vs reconciled costs)</span></h3>
          <p className="text-xs text-gray-400 mt-0.5">Client funding on the left, shop purchasing costs on the right. Cost, retail and funding are never combined.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { recon.refetch(); plan.refetch(); }} className="text-gray-400 shrink-0" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${recon.isFetching ? "animate-spin" : ""}`} /></Button>
      </div>
      <BillingDisabledNotice />
      {recon.isLoading || plan.isLoading ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
        : err || !d?.success || !plan.data?.success ? <p className="text-xs text-red-400">Could not load: {err?.response?.data?.error || err?.message || d?.error || plan.data?.error}</p>
        : <>
          <FundingVsReconDashboard plan={plan.data.plan} data={d} />
          <Sub title="Deposit milestones (draft)"><MilestoneStatusList plan={plan.data.plan} /></Sub>
          <Sub title="Task-level linked part / PO cost"><TaskCostComparison data={d} projectId={projectId} /></Sub>
          <Sub title="Reconciliation detail">
            <button onClick={() => setShowDetail(!showDetail)} className="text-xs text-gray-300 hover:underline">{showDetail ? "Hide" : "Show"} attributed vs unattributed totals and scope tree</button>
            {showDetail && <>
              <ReconTotals data={d} />
              {d.tree.length ? <ReconTree tree={d.tree} /> : <p className="text-xs text-gray-500">No approved scope items.</p>}
            </>}
            {d.excluded_from_budget.length > 0 && <p className="text-xs text-amber-300">{d.excluded_from_budget.length} approved item(s) need review and are not in the approved budget (see Approved Scope Budget).</p>}
            <button onClick={() => setShowUnattr(!showUnattr)} className="block text-xs text-amber-200 hover:underline">{showUnattr ? "Hide" : "Show"} unattributed sources ({d.totals.unattributed_commitments} part(s), {d.unattributed.services.length} service(s))</button>
            {showUnattr && <UnattributedPanel data={d} />}
          </Sub>
          <Sub title="Edit funding plan (draft)">
            <FundingPlanEditor projectId={projectId} planData={plan.data} approved={d.approved_totals} />
          </Sub>
        </>}
    </section>
  );
}