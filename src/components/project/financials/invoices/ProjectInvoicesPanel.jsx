import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectInvoiceView } from "@/components/financial/useProjectInvoiceView";
import CreateProjectInvoiceModal from "@/components/financial/CreateProjectInvoiceModal";
import ProjectInvoiceDetailDrawer from "@/components/financial/ProjectInvoiceDetailDrawer";
import InvoiceGroup from "./InvoiceGroup";
import { money } from "../finFormat";

// Project-scoped view of the existing invoice workflow. All actions go through the existing windows.
export default function ProjectInvoicesPanel({ projectId }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const { invoices, creditBalances, summary, isLoading, isFetching, refetch } = useProjectInvoiceView(projectId);

  const refreshAll = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["projectFinancialOverview", projectId] });
    queryClient.invalidateQueries({ queryKey: ["scopeFundingRecon", projectId] });
  };

  const drafts = invoices.filter((i) => i.status === "draft");
  const finalized = invoices.filter((i) => ["sent", "partial", "overdue", "paid"].includes(i.status));
  const closed = invoices.filter((i) => ["cancelled", "void"].includes(i.status));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-red-900/30 bg-black/40 p-3 text-sm">
        <span className="text-gray-400">Outstanding <span className="tabular-nums text-amber-300 font-medium">{money(summary.total_balance_due ?? 0)}</span></span>
        <span className="text-gray-400">Unused client credit <span className="tabular-nums text-emerald-300 font-medium">{money(creditBalances[projectId] ?? 0)}</span></span>
        {summary.overdue_count > 0 && <span className="text-red-400">{summary.overdue_count} overdue</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 bg-red-600 hover:bg-red-700"><Plus className="w-4 h-4 mr-1" />Create invoice</Button>
          <Button size="sm" variant="ghost" onClick={refreshAll} className="text-gray-400" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>
      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-red-500" /></div> : <>
        <InvoiceGroup title="Draft invoices" invoices={drafts} onOpen={setSelectedId} emptyText="No draft invoices." />
        <InvoiceGroup title="Finalized invoices" invoices={finalized} onOpen={setSelectedId} emptyText="No sent or paid invoices yet." />
        <InvoiceGroup title="Cancelled" invoices={closed} onOpen={setSelectedId} collapsible />
      </>}
      {showCreate && (
        <CreateProjectInvoiceModal
          open={showCreate}
          preselectedProjectId={projectId}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); refreshAll(); }}
          onOpenDraft={(id) => { setShowCreate(false); setSelectedId(id); }}
        />
      )}
      {selectedId && (
        <ProjectInvoiceDetailDrawer invoiceId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} onUpdated={refreshAll} />
      )}
    </div>
  );
}