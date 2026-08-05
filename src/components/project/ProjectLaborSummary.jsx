import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, ChevronDown, ChevronRight, Users, Layers, Download, Printer, Info, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildProjectLaborSummary, generateTaskSummaryCSV, generateTimeEntryCSV, ESTIMATE_STATUS_LABELS } from "@/lib/taskTimeUtils";
import ProjectLaborPrintReport from "@/components/print/ProjectLaborPrintReport";
import { formatDuration } from "@/lib/estimateUtils";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TASK_FILTERS = [
  { value: 'with_hours', label: 'Tasks With Logged Hours' },
  { value: 'all', label: 'All Tasks' },
  { value: 'missing_estimates', label: 'Tasks Missing Estimates' },
  { value: 'over_estimate', label: 'Tasks Over Estimate' },
  { value: 'completed', label: 'Completed Tasks' },
  { value: 'open', label: 'Open Tasks' },
];

export default function ProjectLaborSummary({ project, projectId, tasks = [], buckets = [], teamMembers = [], categories = [] }) {
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

  const [showByMember, setShowByMember] = useState(false);
  const [showByPhase, setShowByPhase] = useState(false);
  const [showByTask, setShowByTask] = useState(false);
  const [taskFilter, setTaskFilter] = useState('with_hours');

  if (isLoading) {
    return <div className="text-center text-gray-500 py-6 text-sm">Loading labor data…</div>;
  }

  const memberEntries = Object.values(summary.byTeamMember).sort((a, b) => b.hours - a.hours);
  const phaseEntries = Object.values(summary.byBucket).sort((a, b) => b.logged - a.logged);
  const bucketMap = new Map(buckets.map(b => [b.id, b.name]));
  const memberMap = new Map(teamMembers.map(m => [m.id, m.full_name]));

  // Filter tasks based on selected filter
  const allTaskEntries = Object.values(summary.byTask);
  const filteredTaskEntries = allTaskEntries.filter(t => {
    switch (taskFilter) {
      case 'with_hours': return t.loggedHours > 0;
      case 'missing_estimates': return t.estimateStatus === 'missing_estimate';
      case 'over_estimate': return t.estimateStatus === 'over_estimate';
      case 'completed': return t.status === 'completed';
      case 'open': return t.status === 'open';
      default: return true;
    }
  }).sort((a, b) => b.loggedHours - a.loggedHours);

  return (
    <div className="space-y-4">
      {/* Summary metrics — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Estimated" value={formatDuration(summary.totalEstimatedHours) || "0h"} />
        <MetricCard label="Total Logged" value={formatDuration(summary.totalLoggedHours) || "0h"} accent />
        <MetricCard
          label="Logged on Estimated"
          value={formatDuration(summary.estimatedTaskLoggedHours) || "0h"}
        />
        <MetricCard
          label="Unestimated Logged"
          value={formatDuration(summary.unestimatedTaskLoggedHours) || "0h"}
          color={summary.unestimatedTaskLoggedHours > 0 ? "text-amber-400" : "text-gray-400"}
        />
        <MetricCard
          label="Est. Work Variance"
          value={summary.varianceOnEstimatedTasks === 0
            ? "On target"
            : `${formatDuration(Math.abs(summary.varianceOnEstimatedTasks))} ${summary.varianceOnEstimatedTasks > 0 ? "over" : "under"}`
          }
          color={summary.varianceOnEstimatedTasks > 0 ? "text-red-400" : summary.varianceOnEstimatedTasks < 0 ? "text-green-400" : "text-gray-400"}
        />
        <MetricCard label="Missing Estimates" value={String(summary.unestimatedTaskCount)} />
      </div>

      {/* Secondary row */}
      <div className="flex flex-wrap gap-2">
        {summary.completedZeroHours > 0 && (
          <Badge className="bg-amber-900/30 text-amber-300 text-xs gap-1 border-0">
            <AlertTriangle className="w-3 h-3" />
            {summary.completedZeroHours} completed without hours
          </Badge>
        )}
        {summary.tasksOverEstimate > 0 && (
          <Badge className="bg-red-900/30 text-red-300 text-xs gap-1 border-0">
            <AlertTriangle className="w-3 h-3" />
            {summary.tasksOverEstimate} tasks over estimate
          </Badge>
        )}
        <Badge className="bg-gray-800 text-gray-400 text-xs gap-1 border-0">
          <Clock className="w-3 h-3" />
          {summary.tasksWithLoggedHours} / {tasks.length} tasks with hours
        </Badge>
      </div>

      {/* Unestimated labor notice */}
      {summary.unestimatedTaskLoggedHours > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-900/15 border border-amber-800/30 rounded-lg text-xs text-amber-300">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {formatDuration(summary.unestimatedTaskLoggedHours)} of logged labor is on tasks without estimates.
            <button
              className="ml-2 underline hover:text-amber-200"
              onClick={() => { setTaskFilter('missing_estimates'); setShowByTask(true); }}
            >
              View Unestimated Tasks
            </button>
          </span>
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
                    {m.unestimatedTaskHours > 0 && (
                      <span className="text-amber-400/70">{formatDuration(m.unestimatedTaskHours)} unest.</span>
                    )}
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
              {phaseEntries.map(p => {
                const phaseVariance = p.estimated > 0 ? roundHours((p.logged - p.unestimatedLogged) - p.estimated) : null;
                return (
                  <div key={p.bucketId} className="flex items-center justify-between px-3 py-1.5 bg-gray-800/30 rounded text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-300 truncate">{p.bucketName}</span>
                      {p.missingEstimates > 0 && (
                        <span className="text-[9px] text-amber-400/70">{p.missingEstimates} unest.</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                      <span className="text-gray-500">Est {formatDuration(p.estimated) || "—"}</span>
                      <span className="text-white font-medium">{formatDuration(p.logged) || "0h"}</span>
                      {p.unestimatedLogged > 0 && (
                        <span className="text-amber-400/70">{formatDuration(p.unestimatedLogged)} unest.</span>
                      )}
                      {phaseVariance != null && (
                        <span className={cn(
                          "text-xs",
                          phaseVariance > 0 ? "text-red-400" : phaseVariance < 0 ? "text-green-400" : "text-gray-500"
                        )}>
                          {phaseVariance === 0 ? "0" : `${phaseVariance > 0 ? '+' : ''}${formatDuration(Math.abs(phaseVariance))}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* By Task with filters */}
      {allTaskEntries.length > 0 && (
        <Collapsible open={showByTask} onOpenChange={setShowByTask}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-300 hover:text-white w-full py-1">
            {showByTask ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span className="font-medium">By Task</span>
            <span className="text-xs text-gray-600 ml-auto">{filteredTaskEntries.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2">
              {/* Task filter dropdown */}
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-3 h-3 text-gray-500" />
                <Select value={taskFilter} onValueChange={setTaskFilter}>
                  <SelectTrigger className="w-56 h-7 text-xs bg-gray-800/60 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_FILTERS.map(f => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-gray-600">{filteredTaskEntries.length} tasks</span>
              </div>

              {/* Task table */}
              <div className="space-y-px">
                <div className="grid grid-cols-12 gap-1 px-3 py-1 text-[9px] uppercase tracking-wider text-gray-600 font-semibold">
                  <span className="col-span-4">Task</span>
                  <span className="col-span-1 text-center">Status</span>
                  <span className="col-span-2 text-right">Estimate</span>
                  <span className="col-span-2 text-right">Logged</span>
                  <span className="col-span-1 text-right">Variance</span>
                  <span className="col-span-2 text-right">Est. Status</span>
                </div>
                {filteredTaskEntries.map(t => (
                  <TaskRow key={t.taskId} t={t} bucketMap={bucketMap} memberMap={memberMap} />
                ))}
                {filteredTaskEntries.length === 0 && (
                  <div className="text-center text-gray-600 py-3 text-xs">No tasks match this filter.</div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* CSV Export + Print buttons */}
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
              generateTimeEntryCSV(project?.name, timeEntries, tasks, { buckets, categories, teamMembers, laborSummary: summary }),
              `${(project?.name || 'project').replace(/[^a-zA-Z0-9]/g, '_')}_time_entries.csv`
            )}
          >
            <Download className="w-3 h-3" />
            Detailed CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-gray-700 text-gray-400 hover:text-white gap-1.5"
            onClick={() => printLaborReport(project, summary, timeEntries, tasks, teamMembers, taskFilter)}
          >
            <Printer className="w-3 h-3" />
            Print Labor Report
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

function TaskRow({ t, bucketMap, memberMap }) {
  const estStatusLabel = ESTIMATE_STATUS_LABELS[t.estimateStatus] || '';
  const variance = t.varianceHours;
  const estStatusColor = {
    missing_estimate: 'text-amber-400',
    over_estimate: 'text-red-400',
    under_estimate: 'text-green-400',
    on_estimate: 'text-gray-500',
  }[t.estimateStatus] || 'text-gray-500';

  return (
    <div className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-gray-800/20 rounded text-xs items-center">
      <span className="col-span-4 text-gray-300 truncate">{t.taskName}</span>
      <span className={cn("col-span-1 text-center", t.status === 'completed' ? "text-green-500" : "text-gray-500")}>
        {t.status === 'completed' ? '✓' : '○'}
      </span>
      <span className="col-span-2 text-right text-gray-500 tabular-nums">{t.estimatedHours ? formatDuration(t.estimatedHours) : "—"}</span>
      <span className="col-span-2 text-right text-white tabular-nums font-medium">{formatDuration(t.loggedHours) || "0h"}</span>
      <span className={cn(
        "col-span-1 text-right tabular-nums",
        variance == null ? "text-gray-600" : variance > 0 ? "text-red-400" : variance < 0 ? "text-green-400" : "text-gray-500"
      )}>
        {variance == null ? "—" : variance === 0 ? "0" : `${variance > 0 ? '+' : ''}${formatDuration(Math.abs(variance))}`}
      </span>
      <span className={cn("col-span-2 text-right text-[10px]", estStatusColor)}>
        {estStatusLabel}
      </span>
    </div>
  );
}

function printLaborReport(project, laborSummary, timeEntries, tasks, teamMembers, taskFilter) {
  import('react-dom/server').then(({ renderToString }) => {
    const html = renderToString(
      <ProjectLaborPrintReport
        project={project}
        laborSummary={laborSummary}
        timeEntries={timeEntries}
        tasks={tasks}
        teamMembers={teamMembers}
        taskFilter={taskFilter}
      />
    );
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Labor Report — ${project?.name || 'Project'}</title>
      <style>body{margin:24px;font-family:system-ui,sans-serif;font-size:11px;color:#333}
      @media print{body{margin:12px}}</style></head><body>${html}</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  });
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

function roundHours(n) {
  return Math.round(n * 100) / 100;
}