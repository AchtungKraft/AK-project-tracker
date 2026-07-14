import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, Users, Wrench, FileQuestion, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const BLOCKER_TYPES = {
  WAITING_ON_PARTS: { label: "Waiting on Parts", icon: Package, color: "text-orange-400", bg: "bg-orange-900/20", border: "border-orange-800/30" },
  WAITING_ON_VENDOR: { label: "Waiting on Vendor", icon: Wrench, color: "text-purple-400", bg: "bg-purple-900/20", border: "border-purple-800/30" },
  WAITING_ON_CUSTOMER: { label: "Waiting on Customer", icon: Users, color: "text-blue-400", bg: "bg-blue-900/20", border: "border-blue-800/30" },
  BLOCKED: { label: "Blocked", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-900/20", border: "border-red-800/30" },
  REVIEW_REQUIRED: { label: "Review Required", icon: FileQuestion, color: "text-violet-400", bg: "bg-violet-900/20", border: "border-violet-800/30" },
};

export default function ShopBlockersSummary({ tasks, projectMap }) {
  const blockerGroups = useMemo(() => {
    const groups = {};

    tasks.forEach(t => {
      const state = t.operational_state;
      if (!BLOCKER_TYPES[state]) return;

      if (!groups[state]) {
        groups[state] = { ...BLOCKER_TYPES[state], count: 0, projects: new Set() };
      }
      groups[state].count++;
      if (t.project_id) groups[state].projects.add(t.project_id);
    });

    return Object.entries(groups)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, g]) => ({
        key,
        ...g,
        projectNames: Array.from(g.projects).map(pid => projectMap.get(pid)?.name || "Unknown").slice(0, 5),
      }));
  }, [tasks, projectMap]);

  // Also count project-level blockers
  const projectBlockers = useMemo(() => {
    const blockers = [];
    projectMap.forEach(p => {
      if (p.current_blocker) {
        blockers.push({ projectName: p.name, blocker: p.current_blocker, projectId: p.id });
      }
    });
    return blockers;
  }, [projectMap]);

  if (blockerGroups.length === 0 && projectBlockers.length === 0) return null;

  const totalBlocked = blockerGroups.reduce((s, g) => s + g.count, 0);

  return (
    <div className="bg-black/30 border border-gray-700/40 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-bold text-gray-200">Shop Blockers</span>
        <Badge className="text-[10px] px-1.5 py-0 bg-red-900/30 text-red-400 border-0">
          {totalBlocked} tasks blocked
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {blockerGroups.map(g => {
          const Icon = g.icon;
          return (
            <div
              key={g.key}
              className={cn("rounded-md border px-3 py-2", g.bg, g.border)}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={cn("w-3.5 h-3.5", g.color)} />
                <span className={cn("text-lg font-bold tabular-nums", g.color)}>{g.count}</span>
              </div>
              <p className={cn("text-[10px] font-medium", g.color)}>{g.label}</p>
              <p className="text-[9px] text-gray-600 mt-0.5 truncate" title={g.projectNames.join(", ")}>
                {g.projectNames.join(", ")}
                {g.projects.size > 5 && ` +${g.projects.size - 5}`}
              </p>
            </div>
          );
        })}
      </div>

      {/* Project-level blockers */}
      {projectBlockers.length > 0 && (
        <div className="mt-2 border-t border-gray-800/30 pt-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Active Project Blockers</span>
          <div className="mt-1 space-y-0.5">
            {projectBlockers.map(b => (
              <div key={b.projectId} className="flex items-center gap-2 text-[11px]">
                <span className="text-gray-400 font-medium truncate w-32 shrink-0">{b.projectName}</span>
                <AlertTriangle className="w-2.5 h-2.5 text-red-400 shrink-0" />
                <span className="text-red-400 truncate">{b.blocker}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}