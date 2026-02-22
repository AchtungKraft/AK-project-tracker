import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, FileText, CreditCard, AlertTriangle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * PHASE 7 — Financial Bar for Project Supply Manager
 * 
 * Shows financial summary strip at top of project views.
 * Uses getFinancialProjectsView filtered to single project.
 */
export default function ProjectFinancialBar({ projectId, className }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["financialProjectsView"],
    queryFn: async () => {
      const response = await base44.functions.invoke("getFinancialProjectsView", {});
      return response.data;
    },
    staleTime: 30000,
  });

  // Find this project's financial data
  const projectFinancials = data?.projects?.find((p) => p.project_id === projectId);

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg", className)}>
        <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        <span className="text-sm text-gray-500">Loading financials...</span>
      </div>
    );
  }

  if (error || !projectFinancials) {
    return null; // Silent fail - don't show bar if no data
  }

  const {
    total_parts_exposure,
    total_invoiced,
    total_paid,
    remaining_to_bill,
    available_credit,
    has_unpaid_parts,
  } = projectFinancials;

  const metrics = [
    {
      label: "Parts Exposure",
      value: total_parts_exposure,
      icon: DollarSign,
      color: "text-blue-400",
      bgColor: "bg-blue-900/20",
    },
    {
      label: "Invoiced",
      value: total_invoiced,
      icon: FileText,
      color: "text-purple-400",
      bgColor: "bg-purple-900/20",
    },
    {
      label: "Paid",
      value: total_paid,
      icon: CreditCard,
      color: "text-green-400",
      bgColor: "bg-green-900/20",
    },
    {
      label: "Remaining",
      value: remaining_to_bill,
      icon: AlertTriangle,
      color: remaining_to_bill > 0 ? "text-amber-400" : "text-gray-400",
      bgColor: remaining_to_bill > 0 ? "bg-amber-900/20" : "bg-gray-800/50",
      highlight: remaining_to_bill > 0,
    },
    {
      label: "Credit",
      value: available_credit,
      icon: Wallet,
      color: available_credit > 0 ? "text-green-400" : "text-gray-400",
      bgColor: available_credit > 0 ? "bg-green-900/20" : "bg-gray-800/50",
      show: available_credit > 0,
    },
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 p-3 bg-gray-900/50 border border-gray-800 rounded-lg",
        className
      )}
    >
      {metrics
        .filter((m) => m.show !== false)
        .map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg",
                metric.bgColor
              )}
            >
              <Icon className={cn("w-4 h-4", metric.color)} />
              <div className="flex flex-col">
                <span className="text-xs text-gray-400">{metric.label}</span>
                <span className={cn("text-sm font-mono font-medium", metric.color)}>
                  {formatCurrencyUSD(metric.value)}
                </span>
              </div>
            </div>
          );
        })}

      {has_unpaid_parts && remaining_to_bill > 0 && (
        <Badge className="bg-amber-600/20 text-amber-400 ml-auto">
          Billing Needed
        </Badge>
      )}
    </div>
  );
}