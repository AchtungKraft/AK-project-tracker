import React, { useState, useMemo } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BLOCKER_TYPE_LABELS } from "./workloadConfig";

export default function ShopBottleneckSummary({ sections, projectMap }) {
  const [expanded, setExpanded] = useState(false);

  const bottlenecks = useMemo(() => {
    const blockerSections = ["BLOCKED", "WAITING_ON_PARTS", "WAITING_ON_VENDOR", "WAITING_ON_CUSTOMER"];
    const blockerDetails = {};

    sections.forEach(sec => {
      if (!blockerSections.includes(sec.key)) return;
      sec.tasks.forEach(t => {
        (t.blocking_reasons || []).forEach(r => {
          const label = r.label || BLOCKER_TYPE_LABELS[r.type] || r.type;
          if (!blockerDetails[label]) {
            blockerDetails[label] = { label, tasks: 0, projects: new Set() };
          }
          blockerDetails[label].tasks++;
          if (t.project_id) blockerDetails[label].projects.add(t.project_id);
        });
      });
    });

    return Object.values(blockerDetails)
      .sort((a, b) => b.tasks - a.tasks)
      .map(b => ({ ...b, projectCount: b.projects.size }));
  }, [sections]);

  if (bottlenecks.length === 0) return null;

  const totalBlockerTasks = bottlenecks.reduce((s, b) => s + b.tasks, 0);
  const totalBlockerProjects = new Set(bottlenecks.flatMap(b => [...b.projects])).size;
  const topBlockers = expanded ? bottlenecks : bottlenecks.slice(0, 3);

  return (
    <div className="bg-red-950/10 border border-red-900/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-900/10 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        <span className="text-xs font-semibold text-red-400">Shop Bottlenecks</span>
        <span className="text-[10px] text-red-500 tabular-nums">
          {totalBlockerTasks} tasks · {totalBlockerProjects} projects
        </span>
        <div className="ml-auto">
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-red-500" />
            : <ChevronRight className="w-3.5 h-3.5 text-red-500" />
          }
        </div>
      </button>

      {/* Blocker rows */}
      <div className={cn("px-3 pb-2 space-y-1", !expanded && "pt-0")}>
        {topBlockers.map(b => (
          <div key={b.label} className="flex items-center gap-3 text-[11px]">
            <span className="text-gray-300 truncate flex-1">{b.label}</span>
            <span className="text-red-400 tabular-nums shrink-0">{b.projectCount} proj</span>
            <span className="text-gray-500 tabular-nums shrink-0">{b.tasks} tasks</span>
          </div>
        ))}
        {!expanded && bottlenecks.length > 3 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            className="text-[10px] text-red-500 hover:text-red-300 transition-colors"
          >
            +{bottlenecks.length - 3} more blockers
          </button>
        )}
      </div>
    </div>
  );
}