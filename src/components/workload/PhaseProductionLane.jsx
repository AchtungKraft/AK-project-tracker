import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPhaseColors } from "./phaseColorConfig";
import PhaseTaskGroup from "./PhaseTaskGroup";

/**
 * Classify operational state into task group keys.
 */
function getTaskGroupKey(opState) {
  if (!opState || opState === "NOT_STARTED") return "NOT_STARTED";
  if (opState === "READY") return "READY";
  if (opState === "IN_PROGRESS") return "WORKING";
  if (opState === "COMPLETED") return "COMPLETED";
  if (opState === "BLOCKED") return "BLOCKED";
  // All waiting states → WAITING
  return "WAITING";
}

const GROUP_ORDER = ["READY", "WORKING", "WAITING", "BLOCKED", "NOT_STARTED", "COMPLETED"];

export default function PhaseProductionLane({ phase, tasks, shared }) {
  const [expanded, setExpanded] = useState(true);

  const colors = getPhaseColors(phase.name, phase.color);
  const blocker = phase.current_blocker;

  // Phase-level stats from visible tasks
  const ready = tasks.filter(t => t.operational_state === "READY").length;
  const inProgress = tasks.filter(t => t.operational_state === "IN_PROGRESS").length;
  const waiting = tasks.filter(t => ["WAITING_ON_PARTS", "WAITING_ON_VENDOR", "WAITING_ON_CUSTOMER"].includes(t.operational_state)).length;
  const blocked = tasks.filter(t => t.operational_state === "BLOCKED").length;
  const requiredTasks = tasks.filter(t => t.is_phase_required !== false);
  const completedRequired = requiredTasks.filter(t => t.operational_state === "COMPLETED").length;
  const totalRequired = requiredTasks.length;
  const completionPct = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;
  const estHours = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);

  // Group tasks by operational intent
  const taskGroups = useMemo(() => {
    const groups = {};
    GROUP_ORDER.forEach(k => { groups[k] = []; });
    tasks.forEach(t => {
      const key = getTaskGroupKey(t.operational_state);
      groups[key].push(t);
    });
    return GROUP_ORDER
      .filter(k => groups[k].length > 0)
      .map(k => ({ key: k, tasks: groups[k] }));
  }, [tasks]);

  if (!tasks.length) return null;

  return (
    <div className={cn("ml-4 border-l-2 mb-0.5", colors.border)}>
      {/* Phase header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:brightness-110",
          colors.bg
        )}
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
        }
        <span
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: colors.dot }}
        />
        <span className={cn("text-xs font-bold uppercase tracking-wide", colors.text)}>
          {phase.name}
        </span>

        {/* Completion */}
        {totalRequired > 0 && (
          <span className="text-[10px] text-gray-500 tabular-nums">
            {completionPct}% · {completedRequired}/{totalRequired}
          </span>
        )}

        {/* Stats — right aligned */}
        <div className="flex items-center gap-2 ml-auto">
          {ready > 0 && <span className="text-[10px] text-green-400 tabular-nums font-medium">R {ready}</span>}
          {inProgress > 0 && <span className="text-[10px] text-amber-400 tabular-nums font-medium">A {inProgress}</span>}
          {waiting > 0 && <span className="text-[10px] text-orange-400 tabular-nums font-medium">W {waiting}</span>}
          {blocked > 0 && <span className="text-[10px] text-red-400 tabular-nums font-medium">B {blocked}</span>}
          {estHours > 0 && <span className="text-[10px] text-gray-600 tabular-nums">{Math.round(estHours)}h</span>}
        </div>
      </button>

      {/* Blocker */}
      {expanded && blocker && (
        <div className="flex items-center gap-1.5 px-5 py-1 text-[10px] text-red-400 border-b border-gray-800/20">
          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
          {blocker}
        </div>
      )}

      {/* Task groups organized by operational intent */}
      {expanded && (
        <div className="py-0.5">
          {taskGroups.map(g => (
            <PhaseTaskGroup
              key={g.key}
              groupKey={g.key}
              tasks={g.tasks}
              shared={shared}
            />
          ))}
        </div>
      )}
    </div>
  );
}