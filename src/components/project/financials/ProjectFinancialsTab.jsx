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
import ScopeFundingSection from "./funding/ScopeFundingSection";
import ProjectInvoicesPanel from "./invoices/ProjectInvoicesPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="text-gray-400">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {exportFormat && <FinancialExportDialog projectId={projectId} format={exportFormat} onClose={() => setExportFormat(null)} />}
      <Tabs defaultValue="overview">
        <TabsList className="bg-gray-900 border border-gray-800 h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices &amp; Payments</TabsTrigger>
          <TabsTrigger value="funding">Funding &amp; Deposits</TabsTrigger>
          <TabsTrigger value="costs">Cost Reconciliation</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4 mt-4">
          <FinancialWarnings warnings={data.warnings} lines={data.lines} />
          <DataQualityIndicator dataQuality={data.data_quality} lines={data.lines} />
          <FinancialSummaryCards summary={data.summary} />
          <FinancialCategoryBreakdown categories={data.categories} summary={data.summary} laborBilling={data.labor_billing} />
          <FinancialLaborBilling projectId={projectId} lb={data.labor_billing} labor={data.labor} />
        </TabsContent>
        <TabsContent value="invoices" className="space-y-4 mt-4">
          <ProjectInvoicesPanel projectId={projectId} />
          <FinancialInvoiceSummary invoices={data.invoices} summary={data.summary} />
        </TabsContent>
        <TabsContent value="funding" className="space-y-4 mt-4">
          <ApprovedScopeBudgetSection projectId={projectId} />
          <ScopeFundingSection projectId={projectId} />
        </TabsContent>
        <TabsContent value="costs" className="space-y-4 mt-4">
          <FinancialLineItems lines={data.lines} laborBilling={data.labor_billing} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <div className="rounded-lg border border-red-900/30 bg-black/40 p-4 space-y-3">
            <p className="text-sm text-gray-300">Internal financial report and client billing detail.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setExportFormat("pdf")} className="h-8"><FileText className="w-4 h-4 mr-1" />Export PDF</Button>
              <Button size="sm" variant="outline" onClick={() => setExportFormat("xlsx")} className="h-8"><FileSpreadsheet className="w-4 h-4 mr-1" />Export Excel</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}