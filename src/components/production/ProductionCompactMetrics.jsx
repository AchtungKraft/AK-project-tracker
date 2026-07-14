import React from "react";
import { Factory, Clock, AlertTriangle, CalendarDays, Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compressed summary bar — replaces the old large metric cards.
 * Numbers inline, reduced visual importance. Meeting starts with projects, not metrics.
 */
export default function ProductionCompactMetrics({
  projectCount,
  needsAttentionCount,
  overdueCount,
  thisWeekCount,
  blockedCount,
  totalHoursRemaining,
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] px-1 py-1.5">
      <span className="flex items-center gap-1.5 text-gray-300">
        <Factory className="w-3.5 h-3.5 text-gray-500" />
        <span className="font-semibold tabular-nums">{projectCount}</span>
        <span className="text-gray-500">builds</span>
      </span>

      {needsAttentionCount > 0 && (
        <span className="flex items-center gap-1 text-red-400">
          <AlertTriangle className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{needsAttentionCount}</span>
          <span className="text-red-400/70">need attention</span>
        </span>
      )}

      {overdueCount > 0 && (
        <span className="flex items-center gap-1 text-red-400">
          <span className="font-semibold tabular-nums">{overdueCount}</span>
          <span className="text-red-400/70">overdue</span>
        </span>
      )}

      <span className="flex items-center gap-1 text-blue-400">
        <CalendarDays className="w-3 h-3" />
        <span className="font-semibold tabular-nums">{thisWeekCount}</span>
        <span className="text-blue-400/70">this week</span>
      </span>

      {blockedCount > 0 && (
        <span className="flex items-center gap-1 text-orange-400">
          <Package className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{blockedCount}</span>
          <span className="text-orange-400/70">blocked</span>
        </span>
      )}

      {totalHoursRemaining > 0 && (
        <span className="flex items-center gap-1 text-gray-500">
          <Clock className="w-3 h-3" />
          <span className="font-medium tabular-nums">{Math.round(totalHoursRemaining)}h</span>
          <span>remaining</span>
        </span>
      )}
    </div>
  );
}