import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  AlertTriangle, 
  Circle,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * CoverageBadge - Shows coverage status for a commitment
 * 
 * NOTE: This component is LEGACY MODEL ONLY.
 * Forward model projects should NOT render this badge.
 * Forward model uses InvoiceBatch status (Uninvoiced/Invoiced/Paid) instead.
 * 
 * Legacy Coverage states (based on pool allocation):
 * - Covered: exposure_gap <= 0
 * - Partial: exposure_gap > 0 AND covered_retail_total > 0
 * - Uncovered: exposure_gap > 0 AND covered_retail_total = 0
 * 
 * Lock indicators:
 * - cost_locked_at != null → Shows lock icon for cost
 * - billing_status >= 'invoiced' → Shows lock icon for retail
 */
export default function CoverageBadge({ 
  commitment,
  poLine,
  showLockIcons = true,
  compact = false,
  onClick,
}) {
  if (!commitment) {
    return null;
  }

  const exposureGap = commitment.exposure_gap ?? 0;
  const coveredRetail = commitment.covered_retail_total ?? 0;
  const plannedRetail = commitment.planned_retail_total ?? 0;

  // Determine coverage state
  let coverageState;
  if (exposureGap <= 0) {
    coverageState = 'covered';
  } else if (coveredRetail > 0) {
    coverageState = 'partial';
  } else {
    coverageState = 'uncovered';
  }

  const config = {
    covered: {
      label: 'Covered',
      color: 'bg-green-600',
      textColor: 'text-green-400',
      icon: CheckCircle2,
    },
    partial: {
      label: 'Partial',
      color: 'bg-yellow-600',
      textColor: 'text-yellow-400',
      icon: AlertTriangle,
    },
    uncovered: {
      label: 'Uncovered',
      color: 'bg-red-600',
      textColor: 'text-red-400',
      icon: Circle,
    },
  }[coverageState];

  const Icon = config.icon;

  // Lock indicators
  const isCostLocked = poLine?.cost_locked_at != null;
  const isRetailLocked = ['invoiced', 'paid'].includes(commitment.billing_status);

  const coveragePct = plannedRetail > 0 
    ? Math.min(100, (coveredRetail / plannedRetail) * 100).toFixed(0)
    : 0;

  const invoicedRetail = commitment.invoiced_retail_total ?? 0;
  const remainingExposure = Math.max(0, plannedRetail - coveredRetail);

  const tooltipContent = (
    <div className="text-xs space-y-1.5 min-w-[180px]">
      <div className="font-medium border-b border-gray-700 pb-1">{config.label} Coverage</div>
      
      {/* Coverage percentage bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full",
              coverageState === 'covered' ? 'bg-green-500' :
              coverageState === 'partial' ? 'bg-yellow-500' :
              'bg-red-500'
            )}
            style={{ width: `${Math.min(100, coveragePct)}%` }}
          />
        </div>
        <span className="text-gray-300 font-medium">{coveragePct}%</span>
      </div>
      
      {/* Financial breakdown */}
      <div className="space-y-0.5 pt-1 border-t border-gray-700">
        <div className="flex justify-between">
          <span className="text-gray-500">Planned:</span>
          <span className="text-white">${plannedRetail.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Covered:</span>
          <span className="text-green-400">${coveredRetail.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Invoiced:</span>
          <span className="text-blue-400">${invoicedRetail.toFixed(2)}</span>
        </div>
      </div>
      
      {/* Exposure warning */}
      {exposureGap > 0 && (
        <div className="pt-1 border-t border-gray-700">
          <div className="flex justify-between text-red-400">
            <span>Exposure Gap:</span>
            <span className="font-medium">${exposureGap.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Remaining:</span>
            <span>${remainingExposure.toFixed(2)}</span>
          </div>
        </div>
      )}
      
      {/* Lock indicators */}
      {(isCostLocked || isRetailLocked) && (
        <div className="pt-1 border-t border-gray-700 space-y-0.5">
          {isCostLocked && (
            <div className="text-purple-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Cost locked by invoice
            </div>
          )}
          {isRetailLocked && (
            <div className="text-blue-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Retail locked (billed)
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={cn(
                "inline-flex items-center gap-1 cursor-default",
                onClick && "cursor-pointer hover:opacity-80"
              )}
              onClick={onClick}
            >
              <Icon className={cn("w-3 h-3", config.textColor)} />
              {showLockIcons && (isCostLocked || isRetailLocked) && (
                <Lock className="w-2.5 h-2.5 text-purple-400" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-gray-900 border-gray-700">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            className={cn(
              config.color, 
              "text-white gap-1",
              onClick && "cursor-pointer hover:opacity-80"
            )}
            onClick={onClick}
          >
            <Icon className="w-3 h-3" />
            {config.label}
            {showLockIcons && isCostLocked && (
              <Lock className="w-3 h-3 ml-1 text-white/70" title="Cost locked" />
            )}
            {showLockIcons && isRetailLocked && (
              <Lock className="w-3 h-3 ml-1 text-white/70" title="Retail locked" />
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-gray-900 border-gray-700">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * CoverageSummary - Shows aggregate coverage for a project
 */
export function CoverageSummary({ commitments = [] }) {
  const activeCommitments = commitments.filter(c => 
    !['cancelled', 'closed'].includes(c.commitment_status)
  );

  const stats = activeCommitments.reduce((acc, c) => {
    acc.totalPlanned += c.planned_retail_total || 0;
    acc.totalCovered += c.covered_retail_total || 0;
    acc.totalExposure += Math.max(0, c.exposure_gap || 0);
    
    if ((c.exposure_gap || 0) <= 0) acc.coveredCount++;
    else if ((c.covered_retail_total || 0) > 0) acc.partialCount++;
    else acc.uncoveredCount++;
    
    return acc;
  }, {
    totalPlanned: 0,
    totalCovered: 0,
    totalExposure: 0,
    coveredCount: 0,
    partialCount: 0,
    uncoveredCount: 0,
  });

  const coveragePct = stats.totalPlanned > 0 
    ? (stats.totalCovered / stats.totalPlanned * 100).toFixed(1)
    : 0;

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-green-400" />
        <span className="text-gray-300">{stats.coveredCount}</span>
      </div>
      <div className="flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 text-yellow-400" />
        <span className="text-gray-300">{stats.partialCount}</span>
      </div>
      <div className="flex items-center gap-1">
        <Circle className="w-3 h-3 text-red-400" />
        <span className="text-gray-300">{stats.uncoveredCount}</span>
      </div>
      <span className="text-gray-500">|</span>
      <span className="text-gray-300">{coveragePct}% covered</span>
      {stats.totalExposure > 0 && (
        <span className="text-red-400">
          ${stats.totalExposure.toFixed(2)} exposure
        </span>
      )}
    </div>
  );
}