import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Package, Truck, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * ReadyToInvoiceSection — Shows projects with unbilled items
 * 
 * Clicking a row opens CreateProjectInvoiceModal with project pre-selected.
 * Uses getProjectsBillingSummary as SINGLE data source.
 */
export default function ReadyToInvoiceSection({ onCreateInvoice }) {
  const { data, isLoading } = useQuery({
    queryKey: ["billingSummary"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getProjectsBillingSummary", {});
      return res.data;
    },
    staleTime: 30000,
  });

  const projects = data?.projects || [];

  if (isLoading) {
    return (
      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
          <span className="text-gray-400 text-sm">Loading billable items...</span>
        </CardContent>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="flex items-center justify-center py-6 gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <span className="text-gray-400">All projects are fully invoiced</span>
        </CardContent>
      </Card>
    );
  }

  // Group by value tier
  const high = projects.filter(p => p.total_billable_amount > 1000);
  const medium = projects.filter(p => p.total_billable_amount >= 200 && p.total_billable_amount <= 1000);
  const low = projects.filter(p => p.total_billable_amount < 200);

  const renderGroup = (label, items, color) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <p className={cn("text-xs font-semibold uppercase tracking-wider px-1", color)}>
          {label}
        </p>
        {items.map(p => (
          <ProjectBillableRow
            key={p.project_id}
            project={p}
            onCreateInvoice={onCreateInvoice}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Ready to Invoice</h2>
        <Badge variant="secondary" className="text-xs">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="p-3 space-y-3">
          {renderGroup("High Value (>$1,000)", high, "text-red-400")}
          {renderGroup("Medium ($200–$1,000)", medium, "text-amber-400")}
          {renderGroup("Low (<$200)", low, "text-gray-400")}
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectBillableRow({ project, onCreateInvoice }) {
  const { breakdown } = project;

  const typeHint = breakdown.services_count > 0 && breakdown.parts_count === 0
    ? "service"
    : breakdown.parts_count > 0 && breakdown.services_count === 0
    ? "parts"
    : "mixed";

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/70 cursor-pointer transition-colors group"
      onClick={() => onCreateInvoice(project.project_id)}
    >
      {/* Project Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{project.project_name}</p>
        {project.client_name && (
          <p className="text-xs text-gray-500 truncate">{project.client_name}</p>
        )}
      </div>

      {/* Item breakdown */}
      <div className="flex items-center gap-2 shrink-0">
        {breakdown.parts_count > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Package className="w-3.5 h-3.5" />
            <span>{breakdown.parts_count}</span>
          </div>
        )}
        {breakdown.services_count > 0 && (
          <div className="flex items-center gap-1 text-xs text-blue-400">
            <Truck className="w-3.5 h-3.5" />
            <span>{breakdown.services_count}</span>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="text-right shrink-0 min-w-[80px]">
        <p className="font-mono font-semibold text-white">
          {formatCurrencyUSD(project.total_billable_amount)}
        </p>
        <p className="text-xs text-gray-500">
          {project.billable_count} item{project.billable_count !== 1 ? "s" : ""}
        </p>
      </div>

      {/* CTA */}
      <Button
        size="sm"
        className="shrink-0 gap-1 opacity-80 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onCreateInvoice(project.project_id);
        }}
      >
        Create Invoice
        <ChevronRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}