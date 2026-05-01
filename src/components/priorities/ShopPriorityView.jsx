import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Flame, AlertTriangle, Zap, Clock, User, ChevronDown, ChevronRight, FolderKanban, Plus, Users, Layers, Printer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import TaskCard from "@/components/project/TaskCard";
import TaskQuickPreview from "./TaskQuickPreview";
import { computeChecklistProgress } from "@/components/tasks/checklistHelpers";
import ShopTeamSummaryBar from "./ShopTeamSummaryBar";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import ProjectFirstView from "./ProjectFirstView";

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

// ── shared task row ──
function ShopTaskRow({ task, sp, showProject }) {
  return (
    <TaskQuickPreview
      task={task}
      projectName={showProject ? sp.projectMap?.[task.project_id] : null}
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
        checklistProgress={sp.checklistProgressByTaskId?.[task.id]}
        partsProgress={sp.partsProgressByTaskId?.[task.id]}
        onUpdateDueDate={sp.onUpdateDueDate}
        onUpdateStartDate={sp.onUpdateStartDate}
        onTogglePriority={sp.onTogglePriority}
        showInlineControls={true}
        compact={true}
      />
    </TaskQuickPreview>
  );
}

// ── urgency label + rows ──
const URGENCY_LABEL = {
  overdue: { icon: AlertTriangle, text: "text-red-400", label: "OVERDUE" },
  today:   { icon: Zap,           text: "text-orange-300", label: "TODAY" },
  ready:   { icon: Clock,         text: "text-gray-500", label: "READY" },
};

function UrgencyRows({ bucket, tasks, sp, showProject }) {
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
          <ShopTaskRow key={task.id} task={task} sp={sp} showProject={showProject} />
        ))}
      </div>
    </>
  );
}

// ── unassigned queue (full-width, above people board) ──
function UnassignedQueue({ tasks, sp }) {
  const { overdue, today, ready } = useMemo(() => splitAndSort(tasks), [tasks]);
  const overdueCount = overdue.length;
  if (!tasks.length) return null;

  return (
    <div className="mb-3 border border-yellow-800/30 rounded bg-yellow-950/5 px-2 pb-1.5">
      <div className="flex items-center gap-1.5 py-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
        <span className="text-xs font-semibold text-yellow-400">UNASSIGNED / SHOP</span>
        <span className="text-[10px] text-yellow-500/70 ml-auto">{tasks.length}</span>
        {overdueCount > 0 && (
          <span className="text-[9px] font-semibold text-red-400 bg-red-900/30 px-1 py-px rounded">
            {overdueCount} overdue
          </span>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto space-y-0">
        <UrgencyRows bucket="overdue" tasks={overdue} sp={sp} showProject />
        <UrgencyRows bucket="today" tasks={today} sp={sp} showProject />
        <UrgencyRows bucket="ready" tasks={ready} sp={sp} showProject />
      </div>
    </div>
  );
}

// ── bucket sub-group inside a project ──
function BucketGroup({ bucketName, tasks, sp }) {
  if (!tasks.length) return null;
  const { overdue, today, ready } = splitAndSort(tasks);
  return (
    <div className="ml-2 mt-px">
      <div className="text-[8px] text-gray-600 tracking-wider uppercase pl-1 py-px">{bucketName}</div>
      <div className="ml-2">
        <UrgencyRows bucket="overdue" tasks={overdue} sp={sp} />
        <UrgencyRows bucket="today" tasks={today} sp={sp} />
        <UrgencyRows bucket="ready" tasks={ready} sp={sp} />
      </div>
    </div>
  );
}

// ── project group inside a person column ──
function ProjectGroup({ project, tasks, sp, memberId }) {
  const [collapsed, setCollapsed] = useState(false);
  const buckets = sp.bucketsByProjectId?.[project.id] || [];
  const hasBuckets = buckets.length > 0;

  // Group tasks by bucket
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
  const overdueCount = tasks.filter(t => getSubBucket(t) === "overdue").length;

  const handleAddTask = (e) => {
    e.stopPropagation();
    sp.onAddTask?.(project.id, memberId);
  };

  const hasOverdue = overdueCount > 0;

  return (
    <div className="mt-4 first:mt-1">
      {/* Top divider */}
      <div className="border-t border-white/10" />
      {/* Project block with subtle background */}
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
            <span className="text-xs font-bold text-gray-200 truncate break-words">{project.name}</span>
          </button>
          <span className="text-[9px] text-gray-600 shrink-0">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            {hasOverdue && <span className="text-red-500 ml-1">• {overdueCount} overdue</span>}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); window.open(`/projectprintview?id=${project.id}`, '_blank'); }}
            className="text-[9px] text-gray-600 hover:text-white transition-colors shrink-0 px-1 py-0.5 rounded hover:bg-gray-800"
            title="Print checklist"
          >
            <Printer className="w-2.5 h-2.5" />
          </button>
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
            {bucketGroups.map(({ bucket, tasks: bTasks }) => (
              <BucketGroup key={bucket.id} bucketName={bucket.name} tasks={bTasks} sp={sp} />
            ))}
            <div className="ml-4">
              <UrgencyRows bucket="overdue" tasks={overdue} sp={sp} />
              <UrgencyRows bucket="today" tasks={today} sp={sp} />
              <UrgencyRows bucket="ready" tasks={ready} sp={sp} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── person column (primary board column) ──
function PersonColumn({ name, initials, tasks, projects, sp, memberId }) {
  // Group tasks by project
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

  const overdueCount = tasks.filter(t => getSubBucket(t) === "overdue").length;

  return (
    <div className="min-w-0 max-w-full flex flex-col overflow-hidden">
      {/* Person header */}
      <div className="flex items-center gap-1.5 px-1.5 py-1 border-b border-gray-700/40">
        <div className="w-5 h-5 rounded-full bg-blue-600/20 flex items-center justify-center text-[9px] font-bold text-blue-400">
          {initials}
        </div>
        <span className="text-xs font-semibold text-white truncate">{name}</span>
        <span className="text-[10px] text-gray-500 ml-auto shrink-0">{tasks.length}</span>
        {overdueCount > 0 && (
          <span className="text-[9px] text-red-400 shrink-0">{overdueCount} overdue</span>
        )}
        <button
          onClick={() => window.open(`/personprintview?memberId=${memberId}`, '_blank')}
          className="text-[9px] text-gray-600 hover:text-white transition-colors shrink-0 px-1 py-0.5 rounded hover:bg-gray-800"
          title="Print checklist"
        >
          <Printer className="w-3 h-3" />
        </button>
      </div>
      {/* Project groups */}
      <div className="flex-1 overflow-y-auto px-0.5 py-0.5">
        {projectGroups.map(({ project, tasks: ptasks }) => (
          <ProjectGroup key={project.id} project={project} tasks={ptasks} sp={sp} memberId={memberId} />
        ))}
        {tasks.length === 0 && (
          <p className="text-[10px] text-gray-700 text-center py-4">No tasks</p>
        )}
      </div>
    </div>
  );
}

// ── main view ──
export default function ShopPriorityView({
  tasks, projects, categories, teamMembers, statuses,
  commentCountByTaskId, allTaskComments, partsProgressByTaskId,
  updateTaskMutation,
  onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
}) {
  const [filterByMemberId, setFilterByMemberId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showMine, setShowMine] = useState(false);
  const [createTaskContext, setCreateTaskContext] = useState(null); // { projectId, memberId }
  const [groupMode, setGroupMode] = useState("assigned"); // "assigned" | "project"

  // Load checklist items for progress indicators
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);
  const { data: allChecklistItems = [] } = useQuery({
    queryKey: ['taskChecklistItems', 'shop'],
    queryFn: () => base44.entities.TaskChecklistItem.list(),
    enabled: taskIds.length > 0,
  });
  const checklistProgressByTaskId = useMemo(() => {
    const taskIdSet = new Set(taskIds);
    return computeChecklistProgress(allChecklistItems, taskIdSet);
  }, [allChecklistItems, taskIds]);

  // Load all buckets for projects that have tasks
  const projectIds = useMemo(() => [...new Set(tasks.map(t => t.project_id))], [tasks]);
  const { data: allBuckets = [] } = useQuery({
    queryKey: ['shopBuckets', projectIds],
    queryFn: () => base44.entities.ProjectKanbanBucket.list(),
    enabled: projectIds.length > 0,
  });
  const bucketsByProjectId = useMemo(() => {
    const m = {};
    allBuckets.forEach(b => {
      if (!m[b.project_id]) m[b.project_id] = [];
      m[b.project_id].push(b);
    });
    return m;
  }, [allBuckets]);

  useEffect(() => {
    let cancelled = false;
    base44.auth.me().then(user => {
      if (cancelled) return;
      const myTm = teamMembers.find(tm => tm.user_id === user.id);
      setCurrentUserId(myTm?.id || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [teamMembers]);

  const projectMap = useMemo(() => {
    const m = {};
    projects.forEach(p => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  const latestCommentByTaskId = useMemo(() => {
    const m = {};
    if (!allTaskComments) return m;
    allTaskComments.forEach(c => {
      const existing = m[c.task_id];
      if (!existing || new Date(c.created_date) > new Date(existing.created_date)) m[c.task_id] = c;
    });
    return m;
  }, [allTaskComments]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (showMine && currentUserId) result = result.filter(t => t.assigned_team_member_id === currentUserId);
    if (filterByMemberId) {
      result = filterByMemberId === "unassigned"
        ? result.filter(t => !t.assigned_team_member_id)
        : result.filter(t => t.assigned_team_member_id === filterByMemberId);
    }
    return result;
  }, [tasks, showMine, currentUserId, filterByMemberId]);

  // Split into unassigned vs assigned, build person columns
  const { unassignedTasks, peopleColumns } = useMemo(() => {
    const unassigned = [];
    const byMember = {};

    filteredTasks.forEach(t => {
      if (!t.assigned_team_member_id) {
        unassigned.push(t);
      } else {
        if (!byMember[t.assigned_team_member_id]) byMember[t.assigned_team_member_id] = [];
        byMember[t.assigned_team_member_id].push(t);
      }
    });

    const cols = Object.entries(byMember)
      .map(([id, memberTasks]) => {
        const tm = teamMembers.find(m => m.id === id);
        const name = tm?.full_name || "Unknown";
        const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
        return { id, name, initials, tasks: memberTasks };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);

    return { unassignedTasks: unassigned, peopleColumns: cols };
  }, [filteredTasks, teamMembers]);

  const handleAssign = useCallback(async (task, memberId) => {
    if (!updateTaskMutation) return;
    await updateTaskMutation.mutateAsync({ id: task.id, data: { assigned_team_member_id: memberId } });
    toast.success(memberId ? "Assigned" : "Unassigned");
  }, [updateTaskMutation]);

  const handleFilterByMember = useCallback((memberId) => {
    setFilterByMemberId(prev => prev === memberId ? null : memberId);
    setShowMine(false);
  }, []);

  const handleAddTask = useCallback((projectId, memberId) => {
    setCreateTaskContext({ projectId, memberId: memberId || null });
  }, []);

  const sp = {
    categories, teamMembers, statuses, commentCountByTaskId, latestCommentByTaskId, projectMap, bucketsByProjectId,
    checklistProgressByTaskId, partsProgressByTaskId,
    onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
    onAssign: handleAssign, onAddTask: handleAddTask,
  };

  return (
    <div className="space-y-2">
      <ShopTeamSummaryBar tasks={tasks} teamMembers={teamMembers} onFilterByMember={handleFilterByMember} activeFilterId={filterByMemberId} />

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => { setShowMine(v => !v); setFilterByMemberId(null); }}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            showMine ? "bg-red-600/30 border border-red-500/50 text-white" : "bg-gray-800/60 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
          }`}
        >
          <span className="flex items-center gap-1"><User className="w-3 h-3" /> Mine</span>
        </button>
        {filterByMemberId && (
          <button onClick={() => setFilterByMemberId(null)} className="px-2 py-0.5 rounded text-[11px] text-red-400 hover:text-red-300 bg-red-900/20 border border-red-700/30">
            ✕ Clear
          </button>
        )}

        {/* Grouping toggle */}
        <div className="ml-auto flex items-center bg-gray-800/60 border border-gray-700 rounded overflow-hidden">
          <button
            onClick={() => setGroupMode("assigned")}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
              groupMode === "assigned" ? "bg-blue-600/30 text-blue-300" : "text-gray-400 hover:text-white"
            }`}
          >
            <Users className="w-3 h-3" /> Assigned
          </button>
          <button
            onClick={() => setGroupMode("project")}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
              groupMode === "project" ? "bg-blue-600/30 text-blue-300" : "text-gray-400 hover:text-white"
            }`}
          >
            <Layers className="w-3 h-3" /> Project
          </button>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-8">
          <Flame className="w-7 h-7 text-red-500/20 mx-auto mb-1.5" />
          <p className="text-gray-600 text-xs">No priority tasks.</p>
        </div>
      ) : groupMode === "assigned" ? (
        <>
          {/* Unassigned queue — full width */}
          <UnassignedQueue tasks={unassignedTasks} sp={sp} />

          {/* People board — horizontal scroll, min 3 columns visible */}
          {peopleColumns.length > 0 && (
            <div className="overflow-x-auto overflow-y-hidden">
              <div
                className="grid gap-3"
                style={{
                  gridAutoFlow: 'column',
                  gridAutoColumns: `minmax(300px, 1fr)`,
                  gridTemplateColumns: peopleColumns.length <= 3
                    ? `repeat(${peopleColumns.length}, minmax(0, 1fr))`
                    : undefined,
                }}
              >
                {peopleColumns.map(col => (
                  <PersonColumn
                    key={col.id}
                    name={col.name}
                    initials={col.initials}
                    tasks={col.tasks}
                    projects={projects}
                    sp={sp}
                    memberId={col.id}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <ProjectFirstView
          tasks={filteredTasks}
          projects={projects}
          sp={sp}
          teamMembers={teamMembers}
        />
      )}

      {createTaskContext && (
        <CreateTaskModal
          projectId={createTaskContext.projectId}
          defaultAssigneeId={createTaskContext.memberId}
          defaultIsPriority={true}
          onClose={() => setCreateTaskContext(null)}
        />
      )}
    </div>
  );
}