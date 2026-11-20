import React from "react";
import { Loader2 } from "lucide-react";
import FinSection from "../FinSection";
import FinancialWarnings from "../FinancialWarnings";
import DataQualityIndicator from "../DataQualityIndicator";
import FinancialCategoryBreakdown from "../FinancialCategoryBreakdown";
import FinancialLineItems from "../FinancialLineItems";
import LaborReconciliationTable from "../billing/LaborReconciliationTable";
import ProjectedPartsCostTable from "../billing/ProjectedPartsCostTable";
import ScopeReconciliationSection from "../funding/ScopeReconciliationSection";
import { useBillingAuthorization } from "../useFinancialQueries";
import { money } from "../finFormat";

// Costs & Reconciliation: cost and margin first; source-level and technical detail behind expandable sections.
export default function CostsReconciliationArea({ projectId, data }) {
  const auth = useBillingAuthorization(projectId);
  const pc = data.data_quality?.position_check;
  const authBody = (render) => auth.isLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
    : auth.data?.success ? render(auth.data) : <p className="text-xs text-red-400">Could not load: {auth.error?.message || auth.data?.error}</p>;
  return (
    <div className="space-y-3">
      <FinancialWarnings warnings={data.warnings} lines={data.lines} />
      <DataQualityIndicator dataQuality={data.data_quality} lines={data.lines} />
      <FinancialCategoryBreakdown categories={data.categories} summary={data.summary} laborBilling={data.labor_billing} />
      {pc && Math.abs(pc.difference) > 0.01 && (
        <p className="text-xs text-amber-300">Scope value at today's prices ({money(pc.scope_value)}) differs from invoiced plus open billing ({money(pc.billed_plus_open)}) by {money(pc.difference)}. Usually a price change after invoicing or parts not billed to the client.</p>
      )}
      <FinSection title="Labor: estimate vs actual" sub="Advance-billed hours and hours over estimate">
        {authBody((d) => <LaborReconciliationTable rows={d.labor_reconciliation || []} />)}
      </FinSection>
      <FinSection title="Advance-billed parts: estimated vs actual cost">
        {authBody((d) => <ProjectedPartsCostTable rows={d.projected_parts_tracking || []} />)}
      </FinSection>
      <FinSection title="Scope and purchasing reconciliation" sub="Approved scope, task-linked purchasing and project-level sources">
        <ScopeReconciliationSection projectId={projectId} />
      </FinSection>
      <FinSection title="Source line items" sub="Every part, service and labor line with cost state and flags">
        <FinancialLineItems lines={data.lines} laborBilling={data.labor_billing} />
      </FinSection>
    </div>
  );
}