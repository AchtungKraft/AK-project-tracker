import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import FinSection from "../FinSection";
import BillingAuthorizationPanel from "../billing/BillingAuthorizationPanel";
import BillingStatusCard from "../billing/BillingStatusCard";
import FundingPlanSection from "../funding/FundingPlanSection";
import FinancialLaborBilling from "../FinancialLaborBilling";
import ApprovedScopeBudgetSection from "../ApprovedScopeBudgetSection";
import { useBillingAuthorization } from "../useFinancialQueries";
import DepositFundingSummary from "../deposits/DepositFundingSummary";

// Budget & Planning: authorization, funding plan, labor billing setup, approved scope and status history.
export default function BudgetPlanningArea({ projectId, data }) {
  const auth = useBillingAuthorization(projectId);
  const [planOpen, setPlanOpen] = useState(false);
  const openPlan = () => {
    setPlanOpen(true);
    setTimeout(() => document.getElementById("fin-funding-plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const p = data.position;
  return (
    <div className="space-y-3">
      {auth.isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        : !auth.data?.success ? <p className="text-sm text-red-400">Could not load billing authorization: {auth.error?.message || auth.data?.error}</p>
        : <BillingAuthorizationPanel a={auth.data.authorization} earned={auth.data.earned_value} projected={{ labor: p.projected_labor_available, parts: p.parts_unreceived }} onGoToFunding={openPlan} />}
      <DepositFundingSummary projectId={projectId} confirmedBudget={auth.data?.authorization?.authorized ?? null} />
      <div id="fin-funding-plan" className="scroll-mt-4">
        <FinSection title="Client budget & funding plan" sub="Agreed budget, funding received, deposit milestones" open={planOpen} onOpenChange={setPlanOpen}>
          <FundingPlanSection projectId={projectId} />
        </FinSection>
      </div>
      <FinSection title="Labor billing setup" sub="Billing rate and task classification" defaultOpen>
        <FinancialLaborBilling projectId={projectId} lb={data.labor_billing} labor={data.labor} />
      </FinSection>
      <FinSection title="Approved scope budget" sub="Planning reference from client-approved scope; not invoice eligible">
        <ApprovedScopeBudgetSection projectId={projectId} />
      </FinSection>
      <FinSection title="Billing status history" sub="Billable / Non-Billable changes and reasons">
        <BillingStatusCard projectId={projectId} lb={data.labor_billing} />
      </FinSection>
    </div>
  );
}