import React from "react";
import {
  MessageCircle, AlertTriangle, Package, Users, Truck, CalendarDays, Pause,
} from "lucide-react";

/**
 * Meeting agenda header — frames what needs discussion today.
 * Not a dashboard. An agenda.
 */
export default function ProductionCompactMetrics({
  discussionCount,
  waitingPartsCount,
  customerDecisionCount,
  vendorFollowUpCount,
  deliveriesThisWeekCount,
  idleProjectCount,
  overdueCount,
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] px-1 py-2 border-b border-gray-800/30">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium mr-1">Today's Agenda</span>

      {discussionCount > 0 && (
        <span className="flex items-center gap-1 text-red-400">
          <MessageCircle className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{discussionCount}</span>
          <span className="text-red-400/70">need discussion</span>
        </span>
      )}

      {waitingPartsCount > 0 && (
        <span className="flex items-center gap-1 text-amber-400">
          <Package className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{waitingPartsCount}</span>
          <span className="text-amber-400/70">waiting on parts</span>
        </span>
      )}

      {customerDecisionCount > 0 && (
        <span className="flex items-center gap-1 text-blue-400">
          <Users className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{customerDecisionCount}</span>
          <span className="text-blue-400/70">customer decisions</span>
        </span>
      )}

      {vendorFollowUpCount > 0 && (
        <span className="flex items-center gap-1 text-purple-400">
          <Truck className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{vendorFollowUpCount}</span>
          <span className="text-purple-400/70">vendor follow-ups</span>
        </span>
      )}

      {deliveriesThisWeekCount > 0 && (
        <span className="flex items-center gap-1 text-cyan-400">
          <CalendarDays className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{deliveriesThisWeekCount}</span>
          <span className="text-cyan-400/70">deliver this week</span>
        </span>
      )}

      {overdueCount > 0 && (
        <span className="flex items-center gap-1 text-red-400">
          <AlertTriangle className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{overdueCount}</span>
          <span className="text-red-400/70">overdue</span>
        </span>
      )}

      {idleProjectCount > 0 && (
        <span className="flex items-center gap-1 text-gray-500">
          <Pause className="w-3 h-3" />
          <span className="font-semibold tabular-nums">{idleProjectCount}</span>
          <span className="text-gray-500/70">idle</span>
        </span>
      )}
    </div>
  );
}