import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  ChevronRight, 
  DollarSign,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle 
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ExposureDetailRow - Expandable row showing commitment exposure details
 * 
 * Displays precomputed fields from commitment:
 * - planned_retail_total
 * - covered_retail_total
 * - invoiced_retail_total
 * - exposure_gap
 * 
 * No recalculation in UI - all values come from backend.
 */
export default function ExposureDetailRow({ 
  commitment, 
  isExpanded, 
  onToggle,
  className 
}) {
  if (!commitment) return null;

  const plannedRetail = commitment.planned_retail_total || 0;
  const coveredRetail = commitment.covered_retail_total || 0;
  const invoicedRetail = commitment.invoiced_retail_total || 0;
  const exposureGap = commitment.exposure_gap || 0;

  // Derive coverage percentage
  const coveragePct = plannedRetail > 0 
    ? Math.min(100, (coveredRetail / plannedRetail) * 100) 
    : 0;

  // Determine health status
  const healthStatus = exposureGap <= 0 ? 'healthy' : 
                       coveragePct >= 50 ? 'partial' : 
                       'critical';

  const healthConfig = {
    healthy: { 
      icon: ShieldCheck, 
      color: 'text-green-400', 
      bgColor: 'bg-green-900/30',
      borderColor: 'border-green-700/50',
      label: 'Fully Covered' 
    },
    partial: { 
      icon: ShieldAlert, 
      color: 'text-yellow-400', 
      bgColor: 'bg-yellow-900/30',
      borderColor: 'border-yellow-700/50',
      label: 'Partial Coverage' 
    },
    critical: { 
      icon: AlertTriangle, 
      color: 'text-red-400', 
      bgColor: 'bg-red-900/30',
      borderColor: 'border-red-700/50',
      label: 'Exposure Risk' 
    },
  }[healthStatus];

  const HealthIcon = healthConfig.icon;

  if (!isExpanded) {
    return (
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors",
          className
        )}
      >
        <ChevronRight className="w-3 h-3" />
        <span>Exposure Details</span>
        {exposureGap > 0 && (
          <Badge className="bg-red-600/30 text-red-400 text-xs">
            ${exposureGap.toFixed(2)} gap
          </Badge>
        )}
      </button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        <ChevronDown className="w-3 h-3" />
        <span>Exposure Details</span>
      </button>

      {/* Expanded Content */}
      <div className={cn(
        "p-3 rounded-lg border",
        healthConfig.bgColor,
        healthConfig.borderColor
      )}>
        {/* Health Status Header */}
        <div className="flex items-center gap-2 mb-3">
          <HealthIcon className={cn("w-4 h-4", healthConfig.color)} />
          <span className={cn("text-sm font-medium", healthConfig.color)}>
            {healthConfig.label}
          </span>
          <span className="text-xs text-gray-400 ml-auto">
            {coveragePct.toFixed(0)}% covered
          </span>
        </div>

        {/* Financial Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-gray-900/50 rounded">
            <p className="text-gray-500 mb-0.5">Planned Retail</p>
            <p className="text-white font-medium">${plannedRetail.toFixed(2)}</p>
          </div>
          <div className="p-2 bg-gray-900/50 rounded">
            <p className="text-gray-500 mb-0.5">Covered (Pool)</p>
            <p className="text-green-400 font-medium">${coveredRetail.toFixed(2)}</p>
          </div>
          <div className="p-2 bg-gray-900/50 rounded">
            <p className="text-gray-500 mb-0.5">Invoiced Retail</p>
            <p className="text-blue-400 font-medium">${invoicedRetail.toFixed(2)}</p>
          </div>
          <div className="p-2 bg-gray-900/50 rounded">
            <p className="text-gray-500 mb-0.5">Exposure Gap</p>
            <p className={cn(
              "font-medium",
              exposureGap > 0 ? "text-red-400" : "text-green-400"
            )}>
              {exposureGap > 0 ? `-$${exposureGap.toFixed(2)}` : '$0.00'}
            </p>
          </div>
        </div>

        {/* Coverage Bar */}
        <div className="mt-3">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all",
                healthStatus === 'healthy' ? 'bg-green-500' :
                healthStatus === 'partial' ? 'bg-yellow-500' :
                'bg-red-500'
              )}
              style={{ width: `${Math.min(100, coveragePct)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ExposureDetailInline - Compact inline version for table cells
 */
export function ExposureDetailInline({ commitment }) {
  if (!commitment) return null;

  const exposureGap = commitment.exposure_gap || 0;
  const plannedRetail = commitment.planned_retail_total || 0;
  const coveragePct = plannedRetail > 0 
    ? Math.min(100, ((commitment.covered_retail_total || 0) / plannedRetail) * 100) 
    : 0;

  return (
    <div className="flex items-center gap-2 text-xs">
      {exposureGap > 0 ? (
        <>
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span className="text-red-400">${exposureGap.toFixed(2)}</span>
        </>
      ) : (
        <>
          <ShieldCheck className="w-3 h-3 text-green-400" />
          <span className="text-green-400">{coveragePct.toFixed(0)}%</span>
        </>
      )}
    </div>
  );
}