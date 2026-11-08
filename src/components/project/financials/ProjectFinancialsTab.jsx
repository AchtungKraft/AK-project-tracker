import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DataQualityIndicator from "./DataQualityIndicator";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw, FileText, FileSpreadsheet } from "lucide-react";
import FinancialExportDialog from "./FinancialExportDialog";
import { Button } from "@/components/ui/button";
import FinancialWarnings from "./FinancialWarnings";
import FinancialSummaryCards from "./FinancialSummaryCards";
import FinancialCategoryBreakdown from "./FinancialCategoryBreakdown";
import FinancialInvoiceSummary from "./FinancialInvoiceSummary";
import FinancialLaborBilling from "./FinancialLaborBilling";
import FinancialLineItems from "./FinancialLineItems";
import ApprovedScopeBudgetSection from "./ApprovedScopeBudgetSection";

export default function ProjectFinancialsTab({ projectId }) {
  const queryClient = useQueryClient();
  const [exportFormat, setExportFormat] = useState(null);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Current scope uses today's quantities and prices. Invoice figures are historical and never recalculated.
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setExportFormat("pdf")} className="h-8"><FileText className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" variant="outline" onClick={() => setExportFormat("xlsx")} className="h-8"><FileSpreadsheet className="w-4 h-4 mr-1" />Export Excel</Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="text-gray-400">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {exportFormat && <FinancialExportDialog projectId={projectId} format={exportFormat} onClose={() => setExportFormat(null)} />}
      <FinancialWarnings warnings={data.warnings} lines={data.lines} />
      <DataQualityIndicator dataQuality={data.data_quality} lines={data.lines} />
      <FinancialSummaryCards summary={data.summary} />
      <FinancialCategoryBreakdown categories={data.categories} summary={data.summary} laborBilling={data.labor_billing} />
      <FinancialLaborBilling projectId={projectId} lb={data.labor_billing} labor={data.labor} />
      <FinancialInvoiceSummary invoices={data.invoices} summary={data.summary} />
      <ApprovedScopeBudgetSection projectId={projectId} />
      <FinancialLineItems lines={data.lines} laborBilling={data.labor_billing} />
    </div>
  );
}