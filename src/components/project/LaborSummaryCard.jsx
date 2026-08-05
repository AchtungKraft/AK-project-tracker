import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, ArrowRight } from "lucide-react";
import { buildProjectLaborSummary } from "@/lib/taskTimeUtils";
import { formatDuration } from "@/lib/estimateUtils";
import { cn } from "@/lib/utils";

/**
 * Compact labor summary card for the Overview tab.
 * Shows top-level metrics + a link to the full Hours tab.
 */
export default function LaborSummaryCard({ project, projectId, tasks = [], buckets = [], teamMembers = [], categories = [], onViewFullReport }) {
  const pid = projectId || project?.id;

  const { data: timeEntries = [], isLoading } = useQuery({
    queryKey: ['projectTimeEntries', pid],
    queryFn: () => base44.entities.TaskTimeEntry.filter({ project_id: pid }),
    enabled: !!pid,
    staleTime: 15000,
  });

  const summary = useMemo(
    () => buildProjectLaborSummary(
      project || { id: pid },
      tasks,
      timeEntries,
      { teamMembers, buckets, categories }
    ),
    [project, pid, tasks, timeEntries, teamMembers, buckets, categories]
  );

  const tasksWithHours = Object.values(summary.byTask).filter(t => t.loggedHours > 0).length;

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            Labor Summary
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewFullReport}
            className="text-red-400 hover:text-red-300 text-xs gap-1"
          >
            View Full Hours Report
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="text-center text-gray-500 py-4 text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-800/40 rounded-lg p-3">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Estimated</p>
              <p className="text-lg font-semibold tabular-nums text-gray-200">
                {formatDuration(summary.totalEstimated) || "0h"}
              </p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-3">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Logged</p>
              <p className="text-lg font-semibold tabular-nums text-white">
                {formatDuration(summary.totalLogged) || "0h"}
              </p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-3">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Variance</p>
              <p className={cn(
                "text-lg font-semibold tabular-nums",
                summary.totalVariance > 0 ? "text-red-400" : summary.totalVariance < 0 ? "text-green-400" : "text-gray-400"
              )}>
                {summary.totalVariance === 0
                  ? "On target"
                  : `${formatDuration(Math.abs(summary.totalVariance))} ${summary.totalVariance > 0 ? "over" : "under"}`}
              </p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-3">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Tasks w/ Hours</p>
              <p className="text-lg font-semibold tabular-nums text-gray-200">
                {tasksWithHours} / {tasks.length}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}