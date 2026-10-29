import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DataQualityIndicator from "./DataQualityIndicator";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import FinancialWarnings from "./FinancialWarnings";
import FinancialSummaryCards from "./FinancialSummaryCards";
import FinancialCategoryBreakdown from "./FinancialCategoryBreakdown";
import FinancialInvoiceSummary from "./FinancialInvoiceSummary";
import FinancialLaborSummary from "./FinancialLaborSummary";
import FinancialLaborBilling from "./FinancialLaborBilling";
import FinancialLineItems from "./FinancialLineItems";

export default function ProjectFinancialsTab({ projectId }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["projectFinancialOverview", projectId],
    queryFn: async () => (await base44.functions.invoke("getProjectFinancialOverview", { project_id: projectId })).data,
    enabled: !!projectId,
    staleTime: 30000,
  });

  // Live refresh when this project's time entries or tasks change
  useEffect(() => {
    if (!projectId) return;
    let timer;
    // Short delay: the server read can lag a write by ~1s
    const onChange = (ev) => {
      if (ev.data?.project_id !== projectId && ev.type !== "delete") return;
      clearTimeout(timer);
      timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ["projectFinancialOverview", projectId] }), 1500);
    };
    const u1 = base44.entities.TaskTimeEntry.subscribe(onChange);
    const u2 = base44.entities.Task.subscribe(onChange);
    return () => { clearTimeout(timer); u1(); u2(); };
  }, [projectId, queryClient]);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-red-500" /></div>;
  }
  if (error || !data?.success) {
    return <div className="text-red-400 text-sm p-4">Could not load financials: {error?.message || data?.error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Current scope uses today's quantities and prices. Invoice figures are historical and never recalculated.
        </p>
        <Button size="sm" variant="ghost" onClick={() => refetch()} className="text-gray-400 shrink-0">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <FinancialWarnings warnings={data.warnings} lines={data.lines} />
      <DataQualityIndicator dataQuality={data.data_quality} lines={data.lines} />
      <FinancialSummaryCards summary={data.summary} />
      <FinancialCategoryBreakdown categories={data.categories} summary={data.summary} laborBilling={data.labor_billing} />
      <FinancialLaborBilling projectId={projectId} lb={data.labor_billing} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FinancialInvoiceSummary invoices={data.invoices} summary={data.summary} />
        <FinancialLaborSummary labor={data.labor} />
      </div>
      <FinancialLineItems lines={data.lines} />
    </div>
  );
}