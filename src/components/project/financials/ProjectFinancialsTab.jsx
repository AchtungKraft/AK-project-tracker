import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FinancialExportDialog from "./FinancialExportDialog";
import FinancialHeader from "./FinancialHeader";
import BudgetPlanningArea from "./areas/BudgetPlanningArea";
import InvoicesPaymentsArea from "./areas/InvoicesPaymentsArea";
import CostsReconciliationArea from "./areas/CostsReconciliationArea";

export default function ProjectFinancialsTab({ projectId }) {
  const queryClient = useQueryClient();
  const [exportFormat, setExportFormat] = useState(null);
  const [tab, setTab] = useState("budget");
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

  const refreshAll = () => {
    refetch();
    ["billingAuthorization", "scopeFundingRecon", "scopeFundingPlan", "billableItems"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, projectId] }));
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-red-500" /></div>;
  }
  if (error || !data?.success) {
    return <div className="text-red-400 text-sm p-4">Could not load financials: {error?.message || data?.error}</div>;
  }

  return (
    <div className="space-y-4 min-w-0">
      <FinancialHeader projectId={projectId} data={data} onExport={setExportFormat} onRefresh={refreshAll} isFetching={isFetching} />
      {exportFormat && <FinancialExportDialog projectId={projectId} format={exportFormat} onClose={() => setExportFormat(null)} />}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-gray-900 border border-gray-800 h-auto w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
          <TabsTrigger value="budget" className="text-xs sm:text-sm">Budget &amp; Planning</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs sm:text-sm">Invoices &amp; Payments</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs sm:text-sm">Costs &amp; Reconciliation</TabsTrigger>
        </TabsList>
        <TabsContent value="budget" className="mt-4"><BudgetPlanningArea projectId={projectId} data={data} /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><InvoicesPaymentsArea projectId={projectId} data={data} /></TabsContent>
        <TabsContent value="costs" className="mt-4"><CostsReconciliationArea projectId={projectId} data={data} /></TabsContent>
      </Tabs>
    </div>
  );
}