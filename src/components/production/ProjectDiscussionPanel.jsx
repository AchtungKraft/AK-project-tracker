import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Flag, Clock, Package, Truck, Users,
  ClipboardCheck, Wrench, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deriveOperationalActions } from "./deriveOperationalActions";

/**
 * Discussion panel — shown at top of expanded project card.
 * Frames management discussion before task lists.
 */
export default function ProjectDiscussionPanel({
  project,
  tasks,
  milestones,
  overdueTasks,
  attention,
}) {
  const currentBlocker = project?.current_blocker;
  const nextMilestone = project?.next_milestone_name;
  const wh = project?.workflow_health || {};

  const operationalActions = deriveOperationalActions(tasks);

  // Critical risks: target completion approaching with blockers
  const risks = [];
  if (project?.target_completion) {
    const target = new Date(project.target_completion + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 14 && daysLeft >= 0) {
      risks.push(`Target completion in ${daysLeft} days`);
    } else if (daysLeft < 0) {
      risks.push(`Target completion was ${Math.abs(daysLeft)} days ago`);
    }
  }
  if (overdueTasks > 0) {
    risks.push(`${overdueTasks} overdue task${overdueTasks > 1 ? "s" : ""}`);
  }

  // Reopened milestones
  const reopenedMs = (milestones || []).filter(ms => ms.status === "reopened");

  const hasContent = currentBlocker || nextMilestone || risks.length > 0 ||
    operationalActions.length > 0 || reopenedMs.length > 0;

  if (!hasContent) return null;

  return (
    <div className="px-4 py-2 space-y-2 bg-gray-900/30 border-b border-gray-800/30">
      {/* Current Blocker */}
      {currentBlocker && (
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] text-red-400/70 uppercase tracking-wide font-medium">Current Blocker</span>
            <p className="text-[13px] text-red-300 font-medium leading-tight">{currentBlocker}</p>
          </div>
        </div>
      )}

      {/* Next Milestone */}
      {nextMilestone && (
        <div className="flex items-start gap-2">
          <Flag className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] text-amber-400/70 uppercase tracking-wide font-medium">Next Milestone</span>
            <p className="text-[13px] text-amber-300 font-medium leading-tight">{nextMilestone}</p>
          </div>
        </div>
      )}

      {/* Reopened Milestones */}
      {reopenedMs.length > 0 && (
        <div className="flex items-start gap-2">
          <Flag className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] text-red-400/70 uppercase tracking-wide font-medium">Reopened Milestones</span>
            {reopenedMs.map(ms => (
              <p key={ms.id} className="text-[12px] text-red-300 leading-tight">{ms.name}</p>
            ))}
          </div>
        </div>
      )}

      {/* Critical Risks */}
      {risks.length > 0 && (
        <div className="flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] text-amber-400/70 uppercase tracking-wide font-medium">Critical Risks</span>
            {risks.map((r, i) => (
              <p key={i} className="text-[12px] text-amber-300 leading-tight">{r}</p>
            ))}
          </div>
        </div>
      )}

      {/* Operational Actions */}
      {operationalActions.length > 0 && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium block mb-1">Management Actions</span>
          <div className="flex flex-wrap gap-1.5">
            {operationalActions.map(action => {
              const Icon = action.icon;
              return (
                <div
                  key={action.key}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1",
                    action.bgClass, action.borderClass
                  )}
                >
                  <Icon className={cn("w-3 h-3", action.color)} />
                  <span className={cn("text-[11px] font-semibold tabular-nums", action.color)}>
                    {action.count}
                  </span>
                  <span className={cn("text-[10px]", action.color)}>
                    {action.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}