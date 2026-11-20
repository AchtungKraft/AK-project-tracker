import React from "react";
import { Loader2 } from "lucide-react";
import BillingDisabledNotice from "./BillingDisabledNotice";
import FundingVsReconDashboard from "./FundingVsReconDashboard";
import FundingPlanEditor from "./FundingPlanEditor";
import MilestoneStatusList from "./MilestoneStatusList";
import { useScopeFunding } from "../useFinancialQueries";

const Sub = ({ title, children }) => <div className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h4>{children}</div>;

// Client budget, funding status, deposit milestones and the draft funding plan editor. No invoice action here.
export default function FundingPlanSection({ projectId }) {
  const { recon, plan, forbidden, loading, errorText, ready } = useScopeFunding(projectId);
  if (forbidden) return null;
  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;
  if (!ready) return <p className="text-xs text-red-400">Could not load: {errorText}</p>;
  return (
    <div className="space-y-4">
      <BillingDisabledNotice />
      <FundingVsReconDashboard plan={plan.data.plan} data={recon.data} />
      <Sub title="Deposit milestones (draft)"><MilestoneStatusList plan={plan.data.plan} /></Sub>
      <Sub title="Edit budget and funding plan"><FundingPlanEditor projectId={projectId} planData={plan.data} approved={recon.data.approved_totals} /></Sub>
    </div>
  );
}