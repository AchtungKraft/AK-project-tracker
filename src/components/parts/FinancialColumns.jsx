import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle, Clock, DollarSign } from "lucide-react";

/**
 * FinancialColumns - Shared financial visibility component
 * 
 * Renders consistent financial data across all parts pages:
 * - ProjectParts
 * - NeedToBuy
 * - OnOrder
 * - BuildsDashboard
 * 
 * All values come from precomputed commitment fields only.
 * No page may reimplement financial logic.
 */

// Format currency consistently
const formatCurrency = (value) => {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Billing status badge configuration
const BILLING_STATUS_CONFIG = {
  not_billable: { label: "Not Billable", color: "bg-gray-600 text-gray-200" },
  billable: { label: "Billable", color: "bg-blue-600 text-white" },
  invoiced: { label: "Invoiced", color: "bg-amber-600 text-white" },
  paid: { label: "Paid", color: "bg-green-600 text-white" },
};

// Coverage badge with tooltip
export function CoverageBadge({ commitment, compact = false }) {
  const plannedRetail = commitment?.planned_retail_total || 0;
  const coveredRetail = commitment?.covered_retail_total || 0;
  const exposureGap = commitment?.exposure_gap ?? (plannedRetail - coveredRetail);
  
  const coveragePercent = plannedRetail > 0 
    ? Math.round((coveredRetail / plannedRetail) * 100) 
    : 0;
  
  const isFullyCovered = exposureGap <= 0;
  const hasExposure = exposureGap > 0;
  
  let badgeColor = "bg-green-600 text-white";
  let Icon = CheckCircle;
  
  if (coveragePercent === 0 && plannedRetail > 0) {
    badgeColor = "bg-red-600 text-white";
    Icon = AlertTriangle;
  } else if (!isFullyCovered) {
    badgeColor = "bg-amber-600 text-white";
    Icon = Clock;
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${badgeColor} cursor-help`}>
            <Icon className="w-3 h-3 mr-1" />
            {compact ? `${coveragePercent}%` : `${coveragePercent}% Covered`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-gray-900 border-gray-700 p-3 max-w-xs">
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-white border-b border-gray-700 pb-1">
              Coverage Details
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-gray-400">% Covered:</span>
              <span className="text-white font-medium">{coveragePercent}%</span>
              
              <span className="text-gray-400">Covered Amount:</span>
              <span className="text-green-400 font-medium">{formatCurrency(coveredRetail)}</span>
              
              <span className="text-gray-400">Remaining Exposure:</span>
              <span className={`font-medium ${hasExposure ? 'text-red-400' : 'text-green-400'}`}>
                {formatCurrency(exposureGap)}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Billing status badge
export function BillingStatusBadge({ commitment }) {
  const status = commitment?.billing_status || "billable";
  const config = BILLING_STATUS_CONFIG[status] || BILLING_STATUS_CONFIG.billable;
  
  return (
    <Badge className={config.color}>
      {config.label}
    </Badge>
  );
}

// Exposure basis indicator
export function ExposureBasisLabel({ commitment }) {
  const invoicedRetail = commitment?.invoiced_retail_total || 0;
  const hasInvoice = invoicedRetail > 0;
  
  return (
    <span className="text-xs text-gray-500">
      Basis: {hasInvoice ? "Invoice Retail" : "Planned Retail"}
    </span>
  );
}

// Main FinancialColumns component - inline display
export function FinancialColumns({ commitment, variant = "full" }) {
  if (!commitment) {
    return <span className="text-gray-500">—</span>;
  }
  
  const plannedRetail = commitment.planned_retail_total || 0;
  const orderedCost = commitment.actual_extended_cost || (commitment.unit_cost_snapshot * commitment.qty_committed) || 0;
  const invoicedRetail = commitment.invoiced_retail_total || 0;
  const coveredRetail = commitment.covered_retail_total || 0;
  const exposureGap = commitment.exposure_gap ?? (plannedRetail - coveredRetail);
  
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-white font-medium">{formatCurrency(plannedRetail)}</span>
        {exposureGap > 0 && (
          <Badge className="bg-red-600/20 text-red-400 text-xs">
            Gap: {formatCurrency(exposureGap)}
          </Badge>
        )}
      </div>
    );
  }
  
  if (variant === "row") {
    return (
      <div className="flex items-center gap-4 text-sm">
        <div>
          <span className="text-gray-500">Retail:</span>{" "}
          <span className="text-white">{formatCurrency(plannedRetail)}</span>
        </div>
        <div>
          <span className="text-gray-500">Cost:</span>{" "}
          <span className="text-gray-300">{formatCurrency(orderedCost)}</span>
        </div>
        <CoverageBadge commitment={commitment} compact />
        <BillingStatusBadge commitment={commitment} />
      </div>
    );
  }
  
  // Full variant - vertical stack
  return (
    <div className="space-y-1 text-sm">
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-gray-500">Planned Retail:</span>
        <span className="text-white font-medium">{formatCurrency(plannedRetail)}</span>
        
        <span className="text-gray-500">Ordered Cost:</span>
        <span className="text-gray-300">{formatCurrency(orderedCost)}</span>
        
        <span className="text-gray-500">Invoiced Retail:</span>
        <span className="text-gray-300">{formatCurrency(invoicedRetail)}</span>
        
        <span className="text-gray-500">Covered Retail:</span>
        <span className="text-green-400">{formatCurrency(coveredRetail)}</span>
        
        <span className="text-gray-500">Exposure Gap:</span>
        <span className={exposureGap > 0 ? "text-red-400 font-medium" : "text-green-400"}>
          {formatCurrency(exposureGap)}
        </span>
      </div>
      
      <div className="flex items-center justify-between pt-1 border-t border-gray-700/50">
        <ExposureBasisLabel commitment={commitment} />
        <div className="flex items-center gap-2">
          <CoverageBadge commitment={commitment} compact />
          <BillingStatusBadge commitment={commitment} />
        </div>
      </div>
    </div>
  );
}

// Table cell variants for consistent column rendering
export function FinancialCell({ commitment, field }) {
  if (!commitment) return <span className="text-gray-500">—</span>;
  
  const values = {
    planned_retail: commitment.planned_retail_total || 0,
    ordered_cost: commitment.actual_extended_cost || (commitment.unit_cost_snapshot * commitment.qty_committed) || 0,
    invoiced_retail: commitment.invoiced_retail_total || 0,
    covered_retail: commitment.covered_retail_total || 0,
    exposure_gap: commitment.exposure_gap ?? ((commitment.planned_retail_total || 0) - (commitment.covered_retail_total || 0)),
  };
  
  const value = values[field];
  
  if (field === "exposure_gap") {
    return (
      <span className={value > 0 ? "text-red-400 font-medium" : "text-green-400"}>
        {formatCurrency(value)}
      </span>
    );
  }
  
  if (field === "covered_retail") {
    return <span className="text-green-400">{formatCurrency(value)}</span>;
  }
  
  return <span className="text-gray-300">{formatCurrency(value)}</span>;
}

// Export all components
export default FinancialColumns;