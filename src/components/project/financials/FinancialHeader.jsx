import React from "react";
import { RefreshCw, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import BillingDesignationEditor from "./BillingDesignationEditor";
import FinancialPositionStrip from "./FinancialPositionStrip";

// Always-visible financial header: Billable / Non-Billable control (admin, server-enforced), reports and summary.
export default function FinancialHeader({ projectId, data, onExport, onRefresh, isFetching }) {
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 space-y-3">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="w-full md:max-w-md text-sm text-gray-200">
          <BillingDesignationEditor projectId={projectId} lb={data.labor_billing} />
        </div>
        <div className="flex flex-wrap items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={() => onExport("pdf")} className="h-8"><FileText className="w-4 h-4 mr-1" />PDF report</Button>
          <Button size="sm" variant="outline" onClick={() => onExport("xlsx")} className="h-8"><FileSpreadsheet className="w-4 h-4 mr-1" />Excel report</Button>
          <Button size="sm" variant="ghost" onClick={onRefresh} className="text-gray-400" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>
      <FinancialPositionStrip data={data} />
      <p className="text-[11px] text-gray-500">Open figures use today's quantities and prices. Issued invoices are historical and never recalculated.</p>
    </div>
  );
}