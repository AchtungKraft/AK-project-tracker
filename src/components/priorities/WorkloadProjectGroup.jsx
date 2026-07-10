import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronRight,
  Flame,
  Ban,
  User,
  Plus,
  Printer,
  Timer,
} from "lucide-react";
import { format, startOfDay, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";

const INITIAL_VISIBLE = 8;

// ── Parse a date-only string as local (no UTC shift) ──
function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatHours(h) {
  if (!h || h === 0) return "0h";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

// ── Compact task row (no project label — it's in the group header) ──
function WorkloadTaskRow({
  task,
  assignee,
  status,
  blocked,
  onToggleComplete,
  onTaskClick,
}) {
  const due = parseLocalDate(task.due_date);
  const todayStart = startOfDay(new Date());
  const isOverdue = due && isBefore(due, todayStart);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800/40 transition-colors group border-b border-gray-800/20 last:border-b-0",
        blocked && "opacity-60"
      )}
    >
      <Checkbox
        checked={false}
        onCheckedChange={() => onToggleComplete(task)}
        className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 shrink-0"
      />

      {task.is_priority && (
        <Flame className="w-3 h-3 text-red-400 shrink-0" />
      )}

      <button
        onClick={() => onTaskClick(task)}
        className="flex-1 min-w-0 text-left text-sm text-gray-200 hover:text-white truncate font-medium"
      >
        {task.name}
      </button>

      {blocked && (
        <Badge
          variant="outline"
          className="text-[10px] px-1 py-0 border-red-700 text-red-500 bg-red-900/20 shrink-0 gap-0.5"
        >
          <Ban className="w-2.5 h-2.5" />
          Blocked
        </Badge>
      )}

      {status && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 shrink-0 hidden sm:inline-flex"
          style={{ borderColor: status.color, color: status.color }}
        >
          {status.label}
        </Badge>
      )}

      <span className="text-xs text-gray-500 w-16 truncate shrink-0 hidden md:block text-right">
        {assignee?.full_name?.split(" ")[0] || "—"}
      </span>

      <span
        className={cn(
          "text-xs w-14 shrink-0 text-right hidden sm:block tabular-nums",
          isOverdue ? "text-red-400 font-semibold" : "text-gray-500"
        )}
      >
        {due ? format(due, "MMM d") : "—"}
      </span>

      {task.estimated_hours ? (
        <span className="text-[11px] text-gray-500 w-10 shrink-0 text-right hidden lg:block tabular-nums">
          {task.estimated_hours}h
        </span>
      ) : (
        <span className="w-10 shrink-0 hidden lg:block" />
      )}
    </div>
  );
}

// ── Project group with collapse + progressive disclosure ──
export default function WorkloadProjectGroup({
  project,
  label,
  tasks,
  teamMemberMap,
  statusMap,
  blockedSet,
  defaultExpanded,
  onToggleComplete,
  onTaskClick,
  onAddTask,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  // Group stats
  const stats = useMemo(() => {
    let est = 0;
    let missingEst = 0;
    let unassigned = 0;
    let blocked = 0;
    tasks.forEach((t) => {
      if (t.estimated_hours && t.estimated_hours > 0) est += t.estimated_hours;
      else missingEst++;
      if (!t.assigned_team_member_id) unassigned++;
      if (blockedSet.has(t.id)) blocked++;
    });
    return { est, missingEst, unassigned, blocked };
  }, [tasks, blockedSet]);

  const visibleTasks = showAll ? tasks : tasks.slice(0, INITIAL_VISIBLE);
  const remaining = tasks.length - INITIAL_VISIBLE;

  return (
    <div>
      {/* Project header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-800/20 hover:bg-gray-800/40 cursor-pointer transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        )}

        <span className="text-xs font-semibold text-gray-200 truncate flex-1 min-w-0">
          {label}
        </span>

        {/* Meta badges */}
        {stats.est > 0 && (
          <span className="text-[10px] text-gray-500 tabular-nums hidden sm:flex items-center gap-0.5">
            <Timer className="w-3 h-3" />
            {formatHours(stats.est)}
          </span>
        )}
        {stats.unassigned > 0 && (
          <span className="text-[10px] text-yellow-500 tabular-nums hidden sm:flex items-center gap-0.5">
            <User className="w-3 h-3" />
            {stats.unassigned}
          </span>
        )}
        {stats.blocked > 0 && (
          <span className="text-[10px] text-red-500 tabular-nums hidden sm:flex items-center gap-0.5">
            <Ban className="w-3 h-3" />
            {stats.blocked}
          </span>
        )}

        <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[10px] px-1.5 py-0 shrink-0">
          {tasks.length}
        </Badge>

        {/* Actions */}
        {project && (
          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Link
              to={buildProjectDetailUrl(project.id, { source: SOURCES.PRIORITIES })}
              className="text-[10px] text-gray-500 hover:text-white px-1 py-0.5 rounded hover:bg-gray-700 transition-colors"
              title="Open project"
            >
              Open
            </Link>
            <button
              onClick={() => onAddTask(project.id)}
              className="text-[10px] text-green-500 hover:text-green-300 px-1 py-0.5 rounded hover:bg-green-900/20 transition-colors flex items-center gap-0.5"
              title="Add task"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() =>
                window.open(`/projectprintview?id=${project.id}`, "_blank")
              }
              className="text-[10px] text-gray-600 hover:text-white px-1 py-0.5 rounded hover:bg-gray-700 transition-colors"
              title="Print"
            >
              <Printer className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Task rows */}
      {expanded && (
        <div>
          {visibleTasks.map((task) => (
            <WorkloadTaskRow
              key={task.id}
              task={task}
              assignee={teamMemberMap.get(task.assigned_team_member_id)}
              status={statusMap.get(task.status_id)}
              blocked={blockedSet.has(task.id)}
              onToggleComplete={onToggleComplete}
              onTaskClick={onTaskClick}
            />
          ))}
          {!showAll && remaining > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2 text-center text-xs text-gray-500 hover:text-white hover:bg-gray-800/40 transition-colors"
            >
              Show remaining {remaining} tasks
            </button>
          )}
          {showAll && remaining > 0 && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full py-1.5 text-center text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Collapse to {INITIAL_VISIBLE}
            </button>
          )}
        </div>
      )}
    </div>
  );
}