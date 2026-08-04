import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, ChevronDown, ChevronRight, Users, Layers, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildProjectLaborSummary, generateTaskSummaryCSV, generateTimeEntryCSV } from "@/lib/taskTimeUtils";
import { formatDuration } from "@/lib/estimateUtils";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * ProjectLaborSummary — project-level labor overview panel.
 * Shows totals, variance, breakdowns by team member and phase.
 */
export default function ProjectLaborSummary({ project, projectId, tasks = [], buckets = [], teamMembers = [], categories = [] }) {
  const pid = projectId || project?.id;

  // Batch-fetch all time entries for the project (single query, not per-task)
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

  const [showByMember, setShowByMember] = React.useState(false);
  const [showByPhase, setShowByPhase] = React.useState(false);
  const [showByTask, setShowByTask] = React.useState(false);

  if (isLoading) {
    return <div className="text-center text-gray-500 py-6 text-sm">Loading labor data…</div>;
  }

  const memberEntries = Object.values(summary.byTeamMember).sort((a, b) => b.hours - a.hours);
  const phaseEntries = Object.values(summary.byBucket).sort((a, b) => b.logged - a.logged);
  const taskEntries = Object.values(summary.byTask)
    .filter(t => t.loggedHours > 0 || t.estimatedHours)
    .sort((a, b) => b.loggedHours - a.loggedHours);

  return (
    <div className="space-y-4">
      {/* Top-level totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Estimated" value={formatDuration(summary.totalEstimated) || "0h"} />
        <MetricCard label="Logged" value={formatDuration(summary.totalLogged) || "0h"} accent />
        <MetricCard
          label="Variance"
          value={summary.totalVariance === 0
            ? "On target"
            : `${formatDuration(Math.abs(summary.totalVariance))} ${summary.totalVariance > 0 ? "over" : "under"}`
          }
          color={summary.totalVariance > 0 ? "text-red-400" : summary.totalVariance < 0 ? "text-green-400" : "text-gray-400"}
        />
        <MetricCard label="Tasks w/ Hours" value={`${Object.values(summary.byTask).filter(t => t.loggedHours > 0).length} / ${tasks.length}`} />
      </div>

      {/* Warnings */}
      {(summary.completedZeroHours > 0 || summary.missingEstimates > 0) && (
        <div className="flex flex-wrap gap-2">
          {summary.completedZeroHours > 0 && (
            <Badge className="bg-amber-900/30 text-amber-300 text-xs gap-1 border-0">
              <AlertTriangle className="w-3 h-3" />
              {summary.completedZeroHours} completed without hours
            </Badge>
          )}
          {summary.missingEstimates > 0 && (
            <Badge className="bg-gray-800 text-gray-400 text-xs gap-1 border-0">
              <Clock className="w-3 h-3" />
              {summary.missingEstimates} missing estimates
            </Badge>
          )}
        </div>
      )}

      {/* By Team Member */}
      {memberEntries.length > 0 && (
        <Collapsible open={showByMember} onOpenChange={setShowByMember}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-300 hover:text-white w-full py-1">
            {showByMember ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Users className="w-3.5 h-3.5 text-gray-500" />
            <span className="font-medium">By Team Member</span>
            <span className="text-xs text-gray-600 ml-auto">{memberEntries.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1">
              {memberEntries.map(m => (
                <div key={m.memberId} className="flex items-center justify-between px-3 py-1.5 bg-gray-800/30 rounded text-sm">
                  <span className="text-gray-300">{m.memberName}</span>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="text-white font-medium">{formatDuration(m.hours)}</span>
                    <span className="text-gray-600">{m.entryCount} entries</span>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* By Phase */}
      {phaseEntries.length > 0 && (
        <Collapsible open={showByPhase} onOpenChange={setShowByPhase}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-300 hover:text-white w-full py-1">
            {showByPhase ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Layers className="w-3.5 h-3.5 text-gray-500" />
            <span className="font-medium">By Phase</span>
            <span className="text-xs text-gray-600 ml-auto">{phaseEntries.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1">
              {phaseEntries.map(p => (
                <div key={p.bucketId} className="flex items-center justify-between px-3 py-1.5 bg-gray-800/30 rounded text-sm">
                  <span className="text-gray-300">{p.bucketName}</span>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="text-gray-500">Est {formatDuration(p.estimated) || "—"}</span>
                    <span className="text-white font-medium">{formatDuration(p.logged) || "0h"}</span>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* By Task */}
      {taskEntries.length > 0 && (
        <Collapsible open={showByTask} onOpenChange={setShowByTask}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-300 hover:text-white w-full py-1">
            {showByTask ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span className="font-medium">By Task</span>
            <span className="text-xs text-gray-600 ml-auto">{taskEntries.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-px">
              <div className="grid grid-cols-12 gap-1 px-3 py-1 text-[9px] uppercase tracking-wider text-gray-600 font-semibold">
                <span className="col-span-5">Task</span>
                <span className="col-span-1 text-right">Status</span>
                <span className="col-span-2 text-right">Estimate</span>
                <span className="col-span-2 text-right">Logged</span>
                <span className="col-span-2 text-right">Variance</span>
              </div>
              {taskEntries.map(t => {
                const variance = t.varianceHours;
                return (
                  <div key={t.taskId} className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-gray-800/20 rounded text-xs items-center">
                    <span className="col-span-5 text-gray-300 truncate">{t.taskName}</span>
                    <span className={cn("col-span-1 text-right", t.status === 'completed' ? "text-green-500" : "text-gray-500")}>
                      {t.status === 'completed' ? '✓' : '○'}
                    </span>
                    <span className="col-span-2 text-right text-gray-500 tabular-nums">{t.estimatedHours ? formatDuration(t.estimatedHours) : "—"}</span>
                    <span className="col-span-2 text-right text-white tabular-nums font-medium">{formatDuration(t.loggedHours) || "0h"}</span>
                    <span className={cn(
                      "col-span-2 text-right tabular-nums",
                      variance == null ? "text-gray-600" : variance > 0 ? "text-red-400" : variance < 0 ? "text-green-400" : "text-gray-500"
                    )}>
                      {variance == null ? "—" : variance === 0 ? "0" : `${variance > 0 ? '+' : ''}${formatDuration(Math.abs(variance))}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* CSV Export buttons */}
      {timeEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800/50">
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-gray-700 text-gray-400 hover:text-white gap-1.5"
            onClick={() => downloadCSV(
              generateTaskSummaryCSV(project?.name, summary, tasks, { buckets, categories, teamMembers }),
              `${(project?.name || 'project').replace(/[^a-zA-Z0-9]/g, '_')}_labor_summary.csv`
            )}
          >
            <Download className="w-3 h-3" />
            Summary CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-gray-700 text-gray-400 hover:text-white gap-1.5"
            onClick={() => downloadCSV(
              generateTimeEntryCSV(project?.name, timeEntries, tasks, { buckets, categories, teamMembers }),
              `${(project?.name || 'project').replace(/[^a-zA-Z0-9]/g, '_')}_time_entries.csv`
            )}
          >
            <Download className="w-3 h-3" />
            Detailed CSV
          </Button>
        </div>
      )}

      {/* Empty state */}
      {timeEntries.length === 0 && (
        <div className="text-center text-gray-600 py-4 text-sm">
          No time has been logged for this project yet.
        </div>
      )}
    </div>
  );
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, accent = false, color }) {
  return (
    <div className="bg-gray-800/40 rounded-lg p-3">
      <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", color || (accent ? "text-white" : "text-gray-200"))}>
        {value}
      </p>
    </div>
  );
}