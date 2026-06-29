import React, { useMemo } from "react";
import { BarChart3, CalendarDays, FolderKanban, FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";

function Stat({ icon: Icon, label, value, color = "text-gray-400" }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-white ml-auto">{value}</span>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function VendorStatsDashboard({ commitments, projectMap, statusMap }) {
  const stats = useMemo(() => {
    if (!commitments || commitments.length === 0) return null;

    const projectIds = [...new Set(commitments.map(sc => sc.project_id).filter(Boolean))];
    let activeCount = 0;
    let completedCount = 0;

    for (const pid of projectIds) {
      const project = projectMap.get(pid);
      if (!project) continue;
      const status = statusMap.get(project.status_id);
      const isTerminal = status?.label?.toLowerCase().match(/complete|done|closed|archived/);
      if (isTerminal) completedCount++;
      else activeCount++;
    }

    const openWork = commitments.filter(sc => sc.status === "planned" || sc.status === "ordered").length;
    const completedWork = commitments.filter(sc => sc.status === "completed" || sc.status === "billed").length;

    const allDates = commitments
      .flatMap(sc => [sc.created_date, sc.ordered_date, sc.completed_date])
      .filter(Boolean)
      .sort();
    const firstUsed = allDates[0];
    const lastUsed = allDates[allDates.length - 1];

    // Cycle time calculation
    const cycleTimes = [];
    for (const sc of commitments) {
      if (sc.ordered_date && sc.completed_date) {
        const ordered = new Date(sc.ordered_date);
        const completed = new Date(sc.completed_date);
        const days = Math.round((completed - ordered) / (1000 * 60 * 60 * 24));
        if (days >= 0) cycleTimes.push(days);
      }
    }

    const avgCycle = cycleTimes.length > 0
      ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length)
      : null;
    const maxCycle = cycleTimes.length > 0 ? Math.max(...cycleTimes) : null;
    const minCycle = cycleTimes.length > 0 ? Math.min(...cycleTimes) : null;

    return {
      totalProjects: projectIds.length,
      activeProjects: activeCount,
      completedProjects: completedCount,
      totalCommitments: commitments.length,
      openWork,
      completedWork,
      firstUsed,
      lastUsed,
      avgCycle,
      maxCycle,
      minCycle,
    };
  }, [commitments, projectMap, statusMap]);

  if (!stats) return null;

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5 mb-1">
        <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Vendor Statistics</span>
      </div>

      <Stat icon={FolderKanban} label="Projects Used" value={stats.totalProjects} color="text-blue-400" />
      <Stat icon={FileText} label="Services Performed" value={stats.totalCommitments} color="text-purple-400" />
      <Stat icon={AlertCircle} label="Open Work" value={stats.openWork} color="text-amber-400" />
      <Stat icon={CheckCircle} label="Completed Work" value={stats.completedWork} color="text-green-400" />

      <div className="border-t border-gray-700/50 my-1" />
      <Stat icon={CalendarDays} label="First Used" value={formatDate(stats.firstUsed)} color="text-purple-400" />
      <Stat icon={CalendarDays} label="Last Used" value={formatDate(stats.lastUsed)} color="text-purple-400" />

      {stats.avgCycle != null && (
        <>
          <div className="border-t border-gray-700/50 my-1" />
          <Stat icon={Clock} label="Avg Cycle Time" value={`${stats.avgCycle} days`} color="text-cyan-400" />
          <Stat icon={Clock} label="Longest Cycle" value={`${stats.maxCycle} days`} color="text-red-400" />
          <Stat icon={Clock} label="Shortest Cycle" value={`${stats.minCycle} days`} color="text-green-400" />
        </>
      )}
    </div>
  );
}