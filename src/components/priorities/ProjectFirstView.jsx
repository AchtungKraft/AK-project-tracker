import React, { useState, useMemo } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Plus, User } from "lucide-react";
import TaskCard from "@/components/project/TaskCard";
import TaskQuickPreview from "./TaskQuickPreview";

// ── urgency helpers (same as ShopPriorityView) ──
function getSubBucket(task) {
  if (!task.due_date) return "ready";
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dueStr = task.due_date.slice(0, 10);
  if (dueStr < todayStr) return "overdue";
  if (dueStr === todayStr) return "today";
  return "ready";
}

const dueDateSort = (a, b) => {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return new Date(a.due_date) - new Date(b.due_date);
};

function splitAndSort(tasks) {
  const o = [], t = [], r = [];
  tasks.forEach(tk => {
    const b = getSubBucket(tk);
    if (b === "overdue") o.push(tk);
    else if (b === "today") t.push(tk);
    else r.push(tk);
  });
  [o, t, r].forEach(arr => arr.sort(dueDateSort));
  return { overdue: o, today: t, ready: r };
}

// ── urgency labels ──
import { Zap, Clock } from "lucide-react";

const URGENCY_LABEL = {
  overdue: { icon: AlertTriangle, text: "text-red-400", label: "OVERDUE" },
  today:   { icon: Zap,           text: "text-orange-300", label: "TODAY" },
  ready:   { icon: Clock,         text: "text-gray-500", label: "READY" },
};

function UrgencyRows({ bucket, tasks, sp }) {
  if (!tasks.length) return null;
  const cfg = URGENCY_LABEL[bucket];
  const Icon = cfg.icon;
  return (
    <>
      <div className="flex items-center gap-1 px-0.5 mt-px">
        <Icon className={`w-2.5 h-2.5 ${cfg.text}`} />
        <span className={`text-[8px] font-bold tracking-wider ${cfg.text}`}>{cfg.label}</span>
        <span className={`text-[8px] ${cfg.text} ml-auto`}>{tasks.length}</span>
      </div>
      <div className="space-y-1">
        {tasks.map(task => (
          <ShopTaskRow key={task.id} task={task} sp={sp} />
        ))}
      </div>
    </>
  );
}

function ShopTaskRow({ task, sp }) {
  return (
    <TaskQuickPreview
      task={task}
      projectName={null}
      latestComment={sp.latestCommentByTaskId[task.id]}
      teamMembers={sp.teamMembers}
      onAssign={sp.onAssign}
      onTaskClick={sp.onTaskClick}
    >
      <TaskCard
        task={task}
        categories={sp.categories}
        teamMembers={sp.teamMembers}
        statuses={sp.statuses}
        onToggleComplete={sp.onToggleComplete}
        onClick={() => {}}
        commentCount={sp.commentCountByTaskId[task.id] || 0}
        onUpdateDueDate={sp.onUpdateDueDate}
        onUpdateStartDate={sp.onUpdateStartDate}
        onTogglePriority={sp.onTogglePriority}
        showInlineControls={true}
        compact={true}
      />
    </TaskQuickPreview>
  );
}

// ── Person sub-group inside a project ──
function PersonSubGroup({ name, initials, tasks, sp, bucketsByProjectId, projectId }) {
  const buckets = bucketsByProjectId?.[projectId] || [];
  const hasBuckets = buckets.length > 0;

  const { bucketGroups, unbucketedTasks } = useMemo(() => {
    if (!hasBuckets) return { bucketGroups: [], unbucketedTasks: tasks };
    const byBucket = {};
    const unbucketed = [];
    tasks.forEach(t => {
      if (t.kanban_bucket_id && buckets.find(b => b.id === t.kanban_bucket_id)) {
        if (!byBucket[t.kanban_bucket_id]) byBucket[t.kanban_bucket_id] = [];
        byBucket[t.kanban_bucket_id].push(t);
      } else {
        unbucketed.push(t);
      }
    });
    const groups = buckets
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .filter(b => byBucket[b.id]?.length > 0)
      .map(b => ({ bucket: b, tasks: byBucket[b.id] }));
    return { bucketGroups: groups, unbucketedTasks: unbucketed };
  }, [tasks, hasBuckets, buckets]);

  const { overdue, today, ready } = splitAndSort(unbucketedTasks);

  return (
    <div className="ml-2 mt-1">
      <div className="flex items-center gap-1.5 py-0.5">
        {initials ? (
          <div className="w-4 h-4 rounded-full bg-blue-600/20 flex items-center justify-center text-[8px] font-bold text-blue-400">
            {initials}
          </div>
        ) : (
          <User className="w-3.5 h-3.5 text-yellow-500/60" />
        )}
        <span className="text-[10px] font-semibold text-gray-300">{name}</span>
        <span className="text-[9px] text-gray-600 ml-auto">{tasks.length}</span>
      </div>
      <div className="ml-4">
        {bucketGroups.map(({ bucket, tasks: bTasks }) => {
          const { overdue: bo, today: bt, ready: br } = splitAndSort(bTasks);
          return (
            <div key={bucket.id} className="ml-2 mt-px">
              <div className="text-[8px] text-gray-600 tracking-wider uppercase pl-1 py-px">{bucket.name}</div>
              <div className="ml-2">
                <UrgencyRows bucket="overdue" tasks={bo} sp={sp} />
                <UrgencyRows bucket="today" tasks={bt} sp={sp} />
                <UrgencyRows bucket="ready" tasks={br} sp={sp} />
              </div>
            </div>
          );
        })}
        <UrgencyRows bucket="overdue" tasks={overdue} sp={sp} />
        <UrgencyRows bucket="today" tasks={today} sp={sp} />
        <UrgencyRows bucket="ready" tasks={ready} sp={sp} />
      </div>
    </div>
  );
}

// ── Project column in project-first mode ──
function ProjectColumn({ project, tasksByPerson, sp, teamMembers }) {
  const [collapsed, setCollapsed] = useState(false);
  const totalTasks = Object.values(tasksByPerson).reduce((s, arr) => s + arr.length, 0);
  const overdueCount = Object.values(tasksByPerson).flat().filter(t => getSubBucket(t) === "overdue").length;
  const hasOverdue = overdueCount > 0;

  // Sort: Unassigned first, then by task count desc
  const sortedPeople = useMemo(() => {
    return Object.entries(tasksByPerson)
      .map(([personId, tasks]) => {
        if (personId === "__unassigned__") {
          return { id: personId, name: "Unassigned", initials: null, tasks, sortKey: -1 };
        }
        const tm = teamMembers.find(m => m.id === personId);
        const name = tm?.full_name || "Unknown";
        const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
        return { id: personId, name, initials, tasks, sortKey: 0 };
      })
      .sort((a, b) => a.sortKey - b.sortKey || b.tasks.length - a.tasks.length);
  }, [tasksByPerson, teamMembers]);

  const handleAddTask = (e) => {
    e.stopPropagation();
    sp.onAddTask?.(project.id, null);
  };

  return (
    <div className="mt-4 first:mt-1">
      <div className="border-t border-white/10" />
      <div className={`rounded-md px-2 py-1.5 mt-0.5 ${hasOverdue ? "bg-red-500/5" : "bg-white/[0.03]"}`}>
        <div className="flex items-center gap-1.5 w-full">
          <button
            onClick={() => setCollapsed(v => !v)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          >
            {collapsed
              ? <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
              : <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />}
            <span className="text-xs font-bold text-gray-200 truncate">{project.name}</span>
          </button>
          <span className="text-[9px] text-gray-600 shrink-0">
            {totalTasks} task{totalTasks !== 1 ? "s" : ""}
            {hasOverdue && <span className="text-red-500 ml-1">• {overdueCount} overdue</span>}
          </span>
          <button
            onClick={handleAddTask}
            className="flex items-center gap-0.5 text-[9px] text-gray-500 hover:text-green-400 transition-colors shrink-0 px-1 py-0.5 rounded hover:bg-green-900/20"
            title="Add task to this project"
          >
            <Plus className="w-2.5 h-2.5" />
            <span className="hidden sm:inline">Task</span>
          </button>
        </div>
        <div className="border-b border-white/10 mt-0.5 mb-1" />
        {!collapsed && (
          <div>
            {sortedPeople.map(person => (
              <PersonSubGroup
                key={person.id}
                name={person.name}
                initials={person.initials}
                tasks={person.tasks}
                sp={sp}
                bucketsByProjectId={sp.bucketsByProjectId}
                projectId={project.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ProjectFirstView ──
export default function ProjectFirstView({ tasks, projects, sp, teamMembers }) {
  // Group: project → person → tasks
  const projectGroups = useMemo(() => {
    const byProject = {};
    tasks.forEach(t => {
      const pid = t.project_id;
      if (!byProject[pid]) byProject[pid] = {};
      const personKey = t.assigned_team_member_id || "__unassigned__";
      if (!byProject[pid][personKey]) byProject[pid][personKey] = [];
      byProject[pid][personKey].push(t);
    });

    return Object.entries(byProject)
      .map(([pid, people]) => {
        const project = projects.find(p => p.id === pid) || { id: pid, name: "Unknown" };
        const totalTasks = Object.values(people).reduce((s, arr) => s + arr.length, 0);
        return { project, tasksByPerson: people, totalTasks };
      })
      .sort((a, b) => b.totalTasks - a.totalTasks);
  }, [tasks, projects]);

  return (
    <div className="space-y-0">
      {projectGroups.map(({ project, tasksByPerson }) => (
        <ProjectColumn
          key={project.id}
          project={project}
          tasksByPerson={tasksByPerson}
          sp={sp}
          teamMembers={teamMembers}
        />
      ))}
    </div>
  );
}