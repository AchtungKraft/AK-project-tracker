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
 * Coverage states:
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

  const tooltipContent = (
    <div className="text-xs space-y-1">
      <div className="font-medium">{config.label} Coverage</div>
      <div className="text-gray-400">
        ${coveredRetail.toFixed(2)} / ${plannedRetail.toFixed(2)} ({coveragePct}%)
      </div>
      {exposureGap > 0 && (
        <div className="text-red-400">
          Exposure gap: ${exposureGap.toFixed(2)}
        </div>
      )}
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