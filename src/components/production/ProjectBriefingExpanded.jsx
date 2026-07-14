import React from "react";
import {
  AlertTriangle, Flag, Clock, Activity, ArrowRight, Users,
  Package, Truck, ClipboardCheck, Wrench, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPhaseColors } from "@/components/workload/phaseColorConfig";
import { Progress } from "@/components/ui/progress";
import MeetingNotesSection from "./MeetingNotesSection";
import ProjectMomentum from "./ProjectMomentum";

/**
 * Expanded briefing — conversation-first layout.
 * Order: Issue → Actions → Meeting Notes → Recent Activity → Phase → Milestones
 * Tasks come AFTER this in the parent card.
 */
export default function ProjectBriefingExpanded({
  project,
  tasks,
  milestones,
  phases,
  currentIssue,
  issueColor,
  operationalActions,
  pendingCustomerActions,
  overdueTasks,
  meetingNotes,
  teamMembers,
  momentum,
  allProjectTasks,
}) {
  const wh = project?.workflow_health || {};
  const currentPhaseName = project?.current_phase_name;
  const nextPhaseName = project?.next_phase_name;
  const nextMilestone = project?.next_milestone_name;
  const phaseColors = currentPhaseName ? getPhaseColors(currentPhaseName) : null;

  const completedTasks = wh.tasks_completed || 0;
  const totalTasks = completedTasks + (wh.tasks_ready || 0) + (wh.tasks_in_progress || 0) + (wh.tasks_blocked || 0) + (wh.tasks_waiting || 0);
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const hoursRemaining = wh.hours_remaining ? `${Math.round(wh.hours_remaining * 10) / 10}h` : null;

  // Risks
  const risks = [];
  if (project?.target_completion) {
    const target = new Date(project.target_completion + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!isNaN(target.getTime())) {
      const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 14 && daysLeft >= 0) risks.push(`Target in ${daysLeft} days`);
      else if (daysLeft < 0) risks.push(`Target was ${Math.abs(daysLeft)} days ago`);
    }
  }
  if (overdueTasks > 0) risks.push(`${overdueTasks} overdue task${overdueTasks > 1 ? "s" : ""}`);
  const reopenedMs = (milestones || []).filter(ms => ms.status === "reopened");

  const hasActions = operationalActions.length > 0 || pendingCustomerActions.length > 0;
  const hasRisks = risks.length > 0 || reopenedMs.length > 0;

  return (
    <div className="px-4 py-3 space-y-4 bg-gray-900/20">
      {/* ── 1. CURRENT ISSUE — the #1 discussion topic ── */}
      <div className="flex items-start gap-3">
        <AlertTriangle className={cn("w-4 h-4 shrink-0 mt-0.5", currentIssue ? issueColor.text : "text-emerald-400")} />
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Current Issue</span>
          <p className={cn("text-sm font-bold leading-tight mt-0.5", currentIssue ? issueColor.text : "text-emerald-400")}>
            {currentIssue || "No Blockers — On Track"}
          </p>
        </div>
      </div>

      {/* ── 2. OPERATIONAL ACTIONS — what people leave the meeting to do ── */}
      {hasActions && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-2">Operational Actions</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {operationalActions.map(action => {
              const Icon = action.icon;
              return (
                <div key={action.key} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md border", action.borderClass, action.bgClass)}>
                  <Icon className={cn("w-4 h-4 shrink-0", action.color)} />
                  <span className={cn("text-[12px] font-semibold", action.color)}>{action.label}</span>
                  <span className={cn("text-[12px] font-bold tabular-nums ml-auto", action.color)}>{action.count}</span>
                </div>
              );
            })}
            {pendingCustomerActions.map(fr => (
              <div key={fr.id} className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-blue-800/30 bg-blue-900/15">
                <Users className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-[12px] text-blue-300 truncate flex-1">{fr.title}</span>
                <span className="text-[9px] text-blue-500 shrink-0">{fr.request_type?.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. MEETING NOTES — persistent operational log ── */}
      <div className="border-t border-gray-800/20 pt-3">
        <MeetingNotesSection
          projectId={project.id}
          notes={meetingNotes}
          teamMembers={teamMembers}
        />
      </div>

      {/* ── 4. PROJECT HEALTH — phase + milestone + hours ── */}
      <div className="border-t border-gray-800/20 pt-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Phase */}
          <div>
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium block">Phase</span>
            {currentPhaseName ? (
              <div className="mt-1">
                <span className="text-sm font-bold uppercase" style={{ color: phaseColors?.dot || "#6B7280" }}>
                  {currentPhaseName}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <Progress value={progressPct} className="h-1.5 flex-1 bg-gray-800" />
                  <span className="text-[11px] text-gray-400 tabular-nums font-semibold">{progressPct}%</span>
                </div>
                {nextPhaseName && (
                  <span className="text-[10px] text-gray-600 flex items-center gap-1 mt-0.5">
                    <ArrowRight className="w-2.5 h-2.5" /> {nextPhaseName}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[12px] text-yellow-400 mt-1 block">No Phase Set</span>
            )}
          </div>

          {/* Next Milestone */}
          <div>
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium block">Next Milestone</span>
            {nextMilestone ? (
              <span className="text-sm font-semibold text-amber-300 mt-1 block">{nextMilestone}</span>
            ) : (
              <span className="text-[12px] text-gray-600 mt-1 block">—</span>
            )}
          </div>

          {/* Hours */}
          <div>
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium block">Hours Remaining</span>
            <span className="text-sm font-semibold text-gray-300 mt-1 block tabular-nums">
              {hoursRemaining || "—"}
            </span>
          </div>

          {/* Momentum */}
          <div>
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium block">Last Activity</span>
            <div className="mt-1">
              <ProjectMomentum momentum={momentum} />
              {momentum?.taskName && (
                <p className="text-[10px] text-gray-600 truncate mt-0.5">{momentum.taskName}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. TIMELINE RISKS ── */}
      {hasRisks && (
        <div className="border-t border-gray-800/20 pt-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium block mb-1">Timeline Risks</span>
          <div className="space-y-0.5">
            {risks.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-amber-400" />
                <span className="text-[12px] text-amber-300">{r}</span>
              </div>
            ))}
            {reopenedMs.map(ms => (
              <div key={ms.id} className="flex items-center gap-2">
                <Flag className="w-3 h-3 text-red-400" />
                <span className="text-[12px] text-red-300">Reopened: {ms.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}