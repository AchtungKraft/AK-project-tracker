import React from "react";
import { Activity, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Derive project momentum from recent task activity.
 * Returns { label, color, icon, daysSinceActivity }
 */
export function deriveMomentum(project, allTasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find most recent completed task or updated task
  let latestActivity = null;
  let latestActivityLabel = null;

  allTasks.forEach(t => {
    // Check completed_date
    if (t.completed_date) {
      const d = new Date(t.completed_date);
      if (!isNaN(d.getTime()) && (!latestActivity || d > latestActivity)) {
        latestActivity = d;
        latestActivityLabel = t.name;
      }
    }
    // Check updated_date  
    if (t.updated_date) {
      const d = new Date(t.updated_date);
      if (!isNaN(d.getTime()) && (!latestActivity || d > latestActivity)) {
        latestActivity = d;
        latestActivityLabel = t.name;
      }
    }
  });

  // Also check workflow_resolved_at
  if (project?.workflow_resolved_at) {
    const d = new Date(project.workflow_resolved_at);
    if (!isNaN(d.getTime()) && (!latestActivity || d > latestActivity)) {
      latestActivity = d;
      latestActivityLabel = null;
    }
  }

  if (!latestActivity) {
    return { label: "No Activity", color: "text-gray-600", daysSinceActivity: Infinity, taskName: null };
  }

  const daysSince = Math.floor((today - latestActivity) / (1000 * 60 * 60 * 24));

  if (daysSince <= 0) return { label: "Active Today", color: "text-emerald-400", daysSinceActivity: 0, taskName: latestActivityLabel };
  if (daysSince === 1) return { label: "Updated Yesterday", color: "text-emerald-400/70", daysSinceActivity: 1, taskName: latestActivityLabel };
  if (daysSince <= 3) return { label: `Updated ${daysSince}d ago`, color: "text-gray-400", daysSinceActivity: daysSince, taskName: latestActivityLabel };
  if (daysSince <= 7) return { label: `No Activity ${daysSince} Days`, color: "text-amber-400", daysSinceActivity: daysSince, taskName: null };
  if (daysSince <= 21) return { label: `No Activity ${daysSince} Days`, color: "text-orange-400", daysSinceActivity: daysSince, taskName: null };
  return { label: `No Activity ${daysSince} Days`, color: "text-red-400", daysSinceActivity: daysSince, taskName: null };
}

export default function ProjectMomentum({ momentum }) {
  if (!momentum) return null;
  const isIdle = momentum.daysSinceActivity > 7;

  return (
    <span className={cn("text-[10px] flex items-center gap-1", momentum.color)}>
      {isIdle ? <Pause className="w-2.5 h-2.5" /> : <Activity className="w-2.5 h-2.5" />}
      {momentum.label}
    </span>
  );
}