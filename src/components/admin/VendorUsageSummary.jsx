import React from "react";
import { BarChart3, CalendarDays, FolderKanban, FileText } from "lucide-react";

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
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function VendorUsageSummary({ commitments, projectMap, statusMap }) {
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

  const allDates = commitments
    .flatMap(sc => [sc.created_date, sc.ordered_date, sc.completed_date])
    .filter(Boolean)
    .sort();

  const firstUsed = allDates[0];
  const lastUsed = allDates[allDates.length - 1];

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5 mb-1">
        <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Vendor Usage</span>
      </div>
      <Stat icon={FolderKanban} label="Projects" value={projectIds.length} color="text-blue-400" />
      <Stat icon={FolderKanban} label="Active" value={activeCount} color="text-green-400" />
      <Stat icon={FolderKanban} label="Completed" value={completedCount} color="text-gray-500" />
      <div className="border-t border-gray-700/50 my-1" />
      <Stat icon={CalendarDays} label="First Used" value={formatDate(firstUsed)} color="text-purple-400" />
      <Stat icon={CalendarDays} label="Last Used" value={formatDate(lastUsed)} color="text-purple-400" />
      <div className="border-t border-gray-700/50 my-1" />
      <Stat icon={FileText} label="Service Records" value={commitments.length} color="text-amber-400" />
    </div>
  );
}