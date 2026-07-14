import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Flag, Clock, Package, Truck, Users,
  ClipboardCheck, Wrench, Activity, Target, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPhaseColors } from "@/components/workload/phaseColorConfig";

/**
 * Expanded briefing section — shown before task lists.
 * Frames the management discussion for this project.
 * 
 * Order:
 * 1. Current Issue
 * 2. Next Milestone
 * 3. Operational Actions
 * 4. Critical Risks / Timeline
 * 5. Meeting Notes placeholder
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
}) {
  const wh = project?.workflow_health || {};
  const currentPhaseName = project?.current_phase_name;
  const nextPhaseName = project?.next_phase_name;
  const nextMilestone = project?.next_milestone_name;
  const phaseColors = currentPhaseName ? getPhaseColors(currentPhaseName) : null;

  // Critical risks
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

  const hasRisks = risks.length > 0 || reopenedMs.length > 0;
  const hasActions = operationalActions.length > 0 || pendingCustomerActions.length > 0;

  return (
    <div className="px-4 py-3 space-y-3 bg-gray-900/20">
      {/* ── CURRENT ISSUE — the #1 discussion topic ── */}
      <div className="flex items-start gap-3">
        <div className="w-5 flex justify-center pt-0.5">
          <AlertTriangle className={cn("w-4 h-4", currentIssue ? issueColor.text : "text-emerald-400")} />
        </div>
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Current Issue</span>
          <p className={cn("text-[14px] font-semibold leading-tight mt-0.5", currentIssue ? issueColor.text : "text-emerald-400")}>
            {currentIssue || "No Current Blockers"}
          </p>
        </div>
      </div>

      {/* ── PHASE + NEXT MILESTONE ── */}
      <div className="flex gap-6 flex-wrap">
        {/* Current Phase */}
        {currentPhaseName && (
          <div className="flex items-start gap-3">
            <div className="w-5 flex justify-center pt-0.5">
              <Activity className="w-4 h-4" style={{ color: phaseColors?.dot || "#6B7280" }} />
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Current Phase</span>
              <p className="text-[14px] font-bold leading-tight mt-0.5" style={{ color: phaseColors?.dot || "#6B7280" }}>
                {currentPhaseName}
              </p>
              {nextPhaseName && (
                <span className="text-[10px] text-gray-600 flex items-center gap-1 mt-0.5">
                  <ArrowRight className="w-2.5 h-2.5" /> Next: {nextPhaseName}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Next Milestone */}
        {nextMilestone && (
          <div className="flex items-start gap-3">
            <div className="w-5 flex justify-center pt-0.5">
              <Flag className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Next Milestone</span>
              <p className="text-[14px] font-semibold text-amber-300 leading-tight mt-0.5">{nextMilestone}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── OPERATIONAL ACTIONS — what people leave the meeting to do ── */}
      {hasActions && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium block mb-1.5">Operational Actions</span>
          <div className="space-y-1">
            {operationalActions.map(action => {
              const Icon = action.icon;
              return (
                <div key={action.key} className="flex items-center gap-2">
                  <Icon className={cn("w-3.5 h-3.5", action.color)} />
                  <span className={cn("text-[12px] font-medium", action.color)}>
                    {action.label}
                  </span>
                  <span className={cn("text-[12px] font-semibold tabular-nums", action.color)}>
                    ({action.count})
                  </span>
                </div>
              );
            })}
            {pendingCustomerActions.map(fr => (
              <div key={fr.id} className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[12px] text-blue-300 truncate">{fr.title}</span>
                <Badge className="text-[9px] px-1 py-0 bg-blue-900/20 text-blue-400 border-0 shrink-0">
                  {fr.request_type?.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CRITICAL RISKS / TIMELINE ── */}
      {hasRisks && (
        <div>
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

      {/* ── MEETING NOTES placeholder ── */}
      <div className="border-t border-gray-800/20 pt-2">
        <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">Meeting Notes</span>
        <p className="text-[11px] text-gray-600 mt-0.5 italic">No meeting notes recorded.</p>
      </div>
    </div>
  );
}