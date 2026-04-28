import React, { useState, useMemo } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Plus, User, Zap, Clock } from "lucide-react";
import TaskCard from "@/components/project/TaskCard";
import TaskQuickPreview from "./TaskQuickPreview";

// ── urgency helpers ──
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

// ── Task row ──
function TaskRow({ task, sp }) {
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

// ── Person group inside a bucket column ──
function PersonGroup({ name, initials, tasks, sp }) {
  // Sort: overdue first, then by due date asc
  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aUrgency = getSubBucket(a) === "overdue" ? 0 : getSubBucket(a) === "today" ? 1 : 2;
      const bUrgency = getSubBucket(b) === "overdue" ? 0 : getSubBucket(b) === "today" ? 1 : 2;
      if (aUrgency !== bUrgency) return aUrgency - bUrgency;
      return dueDateSort(a, b);
    });
  }, [tasks]);

  const overdueCount = tasks.filter(t => getSubBucket(t) === "overdue").length;

  return (
    <div className="mt-1.5 first:mt-0">
      <div className="flex items-center gap-1.5 py-0.5 px-0.5">
        {initials ? (
          <div className="w-4 h-4 rounded-full bg-blue-600/20 flex items-center justify-center text-[8px] font-bold text-blue-400 shrink-0">
            {initials}
          </div>
        ) : (
          <User className="w-3.5 h-3.5 text-yellow-500/60 shrink-0" />
        )}
        <span className="text-[10px] font-semibold text-gray-300 truncate">{name}</span>
        <span className="text-[9px] text-gray-600 ml-auto shrink-0">{tasks.length}</span>
        {overdueCount > 0 && (
          <span className="text-[8px] text-red-400 shrink-0">{overdueCount} late</span>
        )}
      </div>
      <div className="space-y-1 ml-1">
        {sorted.map(task => (
          <TaskRow key={task.id} task={task} sp={sp} />
        ))}
      </div>
    </div>
  );
}

// ── Bucket column ──
function BucketColumn({ bucketName, tasks, sp, teamMembers }) {
  // Group by person, unassigned first
  const personGroups = useMemo(() => {
    const byPerson = {};
    tasks.forEach(t => {
      const key = t.assigned_team_member_id || "__unassigned__";
      if (!byPerson[key]) byPerson[key] = [];
      byPerson[key].push(t);
    });

    return Object.entries(byPerson)
      .map(([personId, personTasks]) => {
        if (personId === "__unassigned__") {
          return { id: personId, name: "Unassigned", initials: null, tasks: personTasks, sortKey: -1 };
        }
        const tm = teamMembers.find(m => m.id === personId);
        const name = tm?.full_name || "Unknown";
        const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
        return { id: personId, name, initials, tasks: personTasks, sortKey: 0 };
      })
      .sort((a, b) => a.sortKey - b.sortKey || b.tasks.length - a.tasks.length);
  }, [tasks, teamMembers]);

  const overdueCount = tasks.filter(t => getSubBucket(t) === "overdue").length;

  return (
    <div className="min-w-[280px] w-[280px] shrink-0 flex flex-col">
      {/* Bucket header */}
      <div className="flex items-center gap-1.5 px-1.5 py-1 border-b border-gray-700/40">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{bucketName}</span>
        <span className="text-[9px] text-gray-600 ml-auto shrink-0">{tasks.length}</span>
        {overdueCount > 0 && (
          <span className="text-[8px] text-red-400 shrink-0">{overdueCount} overdue</span>
        )}
      </div>
      {/* People inside bucket */}
      <div className="flex-1 overflow-y-auto px-0.5 py-1 space-y-2">
        {personGroups.map(person => (
          <PersonGroup
            key={person.id}
            name={person.name}
            initials={person.initials}
            tasks={person.tasks}
            sp={sp}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-[10px] text-gray-700 text-center py-3">No tasks</p>
        )}
      </div>
    </div>
  );
}

// ── Project block with horizontal bucket lanes ──
function ProjectBlock({ project, tasks, sp, teamMembers, buckets }) {
  const [collapsed, setCollapsed] = useState(false);
  const overdueCount = tasks.filter(t => getSubBucket(t) === "overdue").length;
  const hasOverdue = overdueCount > 0;

  // Group tasks by bucket
  const { bucketColumns, unbucketedTasks } = useMemo(() => {
    const hasBuckets = buckets.length > 0;
    if (!hasBuckets) return { bucketColumns: [], unbucketedTasks: tasks };

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

    const cols = buckets
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(b => ({ bucket: b, tasks: byBucket[b.id] || [] }));

    return { bucketColumns: cols, unbucketedTasks: unbucketed };
  }, [tasks, buckets]);

  const hasBucketColumns = bucketColumns.some(c => c.tasks.length > 0);

  const handleAddTask = (e) => {
    e.stopPropagation();
    sp.onAddTask?.(project.id, null);
  };

  return (
    <div className="mt-4 first:mt-1">
      <div className="border-t border-white/10" />
      <div className={`rounded-md px-2 py-1.5 mt-0.5 ${hasOverdue ? "bg-red-500/5" : "bg-white/[0.03]"}`}>
        {/* Project header */}
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
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
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

        {!collapsed && (
          <div className="mt-1">
            {/* Horizontal bucket lanes */}
            {hasBucketColumns && (
              <div className="overflow-x-auto -mx-1">
                <div className="flex gap-3 min-w-max px-1 pb-1">
                  {bucketColumns.filter(c => c.tasks.length > 0).map(({ bucket, tasks: bTasks }) => (
                    <BucketColumn
                      key={bucket.id}
                      bucketName={bucket.name}
                      tasks={bTasks}
                      sp={sp}
                      teamMembers={teamMembers}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Unbucketed tasks */}
            {unbucketedTasks.length > 0 && (
              <div className={hasBucketColumns ? "mt-2 border-t border-white/5 pt-1" : ""}>
                {hasBucketColumns && (
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider px-1 mb-1">Unsorted</div>
                )}
                <BucketColumn
                  bucketName={hasBucketColumns ? "" : "All Tasks"}
                  tasks={unbucketedTasks}
                  sp={sp}
                  teamMembers={teamMembers}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ProjectFirstView ──
export default function ProjectFirstView({ tasks, projects, sp, teamMembers }) {
  const bucketsByProjectId = sp.bucketsByProjectId || {};

  const projectGroups = useMemo(() => {
    const byProject = {};
    tasks.forEach(t => {
      if (!byProject[t.project_id]) byProject[t.project_id] = [];
      byProject[t.project_id].push(t);
    });

    return Object.entries(byProject)
      .map(([pid, ptasks]) => {
        const project = projects.find(p => p.id === pid) || { id: pid, name: "Unknown" };
        return { project, tasks: ptasks };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [tasks, projects]);

  return (
    <div className="space-y-0">
      {projectGroups.map(({ project, tasks: ptasks }) => (
        <ProjectBlock
          key={project.id}
          project={project}
          tasks={ptasks}
          sp={sp}
          teamMembers={teamMembers}
          buckets={bucketsByProjectId[project.id] || []}
        />
      ))}
    </div>
  );
}