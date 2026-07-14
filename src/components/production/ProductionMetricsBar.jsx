import React from "react";
import { Factory, Clock, AlertTriangle, CheckCircle2, CalendarDays, Package } from "lucide-react";
import { cn } from "@/lib/utils";

function MetricCard({ icon: Icon, label, value, color, subtext }) {
  return (
    <div className="flex items-center gap-2 bg-black/40 border border-gray-700/30 rounded-lg px-3 py-2 min-w-[110px]">
      <Icon className={cn("w-4 h-4 shrink-0", color)} />
      <div>
        <p className={cn("text-lg font-bold tabular-nums leading-tight", color)}>{value}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
        {subtext && <p className="text-[9px] text-gray-600">{subtext}</p>}
      </div>
    </div>
  );
}

export default function ProductionMetricsBar({
  projectCount,
  totalTasks,
  overdueCount,
  thisWeekCount,
  blockedCount,
  totalHoursRemaining,
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <MetricCard
        icon={Factory}
        label="Active Builds"
        value={projectCount}
        color="text-gray-200"
      />
      <MetricCard
        icon={CalendarDays}
        label="Due This Week"
        value={thisWeekCount}
        color="text-blue-400"
      />
      {overdueCount > 0 && (
        <MetricCard
          icon={AlertTriangle}
          label="Overdue"
          value={overdueCount}
          color="text-red-400"
        />
      )}
      {blockedCount > 0 && (
        <MetricCard
          icon={Package}
          label="Blocked / Waiting"
          value={blockedCount}
          color="text-orange-400"
        />
      )}
      {totalHoursRemaining > 0 && (
        <MetricCard
          icon={Clock}
          label="Hours Remaining"
          value={`${Math.round(totalHoursRemaining)}h`}
          color="text-gray-400"
        />
      )}
    </div>
  );
}