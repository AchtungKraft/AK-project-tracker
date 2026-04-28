import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Flame, AlertTriangle, Zap, Clock, User, ChevronDown, ChevronRight, FolderKanban } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import TaskCard from "@/components/project/TaskCard";
import TaskQuickPreview from "./TaskQuickPreview";
import ShopTeamSummaryBar from "./ShopTeamSummaryBar";

// ── urgency ──
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

// ── task row (shared by queue + columns) ──
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
        onUpdateDueDate={sp.onUpdateDueDate}
        onUpdateStartDate={sp.onUpdateStartDate}
        onTogglePriority={sp.onTogglePriority}
        showInlineControls={true}
        compact={true}
      />
    </TaskQuickPreview>
  );
}

// ── urgency label ──
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
      <div className="flex items-center gap-1 px-1 mt-1 mb-px">
        <Icon className={`w-2.5 h-2.5 ${cfg.text}`} />
        <span className={`text-[9px] font-bold tracking-wide ${cfg.text}`}>{cfg.label}</span>
        <span className={`text-[9px] ${cfg.text} ml-auto`}>{tasks.length}</span>
      </div>
      {tasks.map(task => (
        <div key={task.id} className="py-px px-0.5">
          <ShopTaskRow task={task} sp={sp} showProject={showProject} />
        </div>
      ))}
    </>
  );
}

// ── unassigned queue (full-width, above columns) ──
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
      <div className="max-h-48 overflow-y-auto space-y-0">
        <UrgencyRows bucket="overdue" tasks={overdue} sp={sp} showProject />
        <UrgencyRows bucket="today" tasks={today} sp={sp} showProject />
        <UrgencyRows bucket="ready" tasks={ready} sp={sp} showProject />
      </div>
    </div>
  );
}

// ── person column ──
function PersonColumn({ name, initials, tasks, sp }) {
  const { overdue, today, ready } = useMemo(() => splitAndSort(tasks), [tasks]);
  const overdueCount = overdue.length;

  return (
    <div className="w-[280px] min-w-[280px] shrink-0 flex flex-col">
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-1.5 py-1 border-b border-gray-800/50">
        <div className="w-5 h-5 rounded-full bg-blue-600/20 flex items-center justify-center text-[9px] font-bold text-blue-400">
          {initials}
        </div>
        <span className="text-xs font-medium text-gray-200 truncate">{name}</span>
        <span className="text-[10px] text-gray-600 ml-auto">{tasks.length}</span>
        {overdueCount > 0 && (
          <span className="text-[9px] text-red-400 font-semibold">{overdueCount}!</span>
        )}
      </div>
      {/* Tasks */}
      <div className="flex-1 overflow-y-auto px-0.5 pb-1">
        <UrgencyRows bucket="overdue" tasks={overdue} sp={sp} />
        <UrgencyRows bucket="today" tasks={today} sp={sp} />
        <UrgencyRows bucket="ready" tasks={ready} sp={sp} />
        {tasks.length === 0 && (
          <p className="text-[10px] text-gray-700 text-center py-3">No tasks</p>
        )}
      </div>
    </div>
  );
}

// ── project section ──
function ProjectSection({ project, projectTasks, teamMembers, sp }) {
  const [collapsed, setCollapsed] = useState(false);

  const { unassigned, memberColumns } = useMemo(() => {
    const ua = [];
    const byMember = {};
    projectTasks.forEach(t => {
      if (!t.assigned_team_member_id) { ua.push(t); return; }
      if (!byMember[t.assigned_team_member_id]) byMember[t.assigned_team_member_id] = [];
      byMember[t.assigned_team_member_id].push(t);
    });
    const cols = Object.entries(byMember)
      .map(([id, tks]) => {
        const tm = teamMembers.find(m => m.id === id);
        const name = tm?.full_name || "Unknown";
        return { id, name, initials: name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(), tasks: tks };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);
    return { unassigned: ua, memberColumns: cols };
  }, [projectTasks, teamMembers]);

  const overdueTotal = projectTasks.filter(t => getSubBucket(t) === "overdue").length;

  return (
    <div>
      {/* Project header — minimal */}
      <button onClick={() => setCollapsed(v => !v)} className="flex items-center gap-1.5 w-full py-1 text-left">
        {collapsed ? <ChevronRight className="w-3 h-3 text-gray-600" /> : <ChevronDown className="w-3 h-3 text-gray-600" />}
        <FolderKanban className="w-3.5 h-3.5 text-red-500/70" />
        <span className="text-sm font-semibold text-white truncate">{project.name}</span>
        {project.client_name && <span className="text-[11px] text-gray-500 truncate">— {project.client_name}</span>}
        <span className="text-[11px] text-gray-600 ml-auto shrink-0">{projectTasks.length} tasks</span>
        {overdueTotal > 0 && <span className="text-[10px] text-red-400 shrink-0">{overdueTotal} overdue</span>}
      </button>

      {!collapsed && (
        <div className="mt-0.5 mb-3">
          {/* Unassigned queue for this project */}
          <UnassignedQueue tasks={unassigned} sp={{...sp, projectMap: null}} />

          {/* Horizontal people columns */}
          {memberColumns.length > 0 && (
            <div className="overflow-x-auto">
              <div className="flex gap-px min-w-min bg-gray-800/20 rounded">
                {memberColumns.map(col => (
                  <PersonColumn key={col.id} name={col.name} initials={col.initials} tasks={col.tasks} sp={sp} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main view ──
export default function ShopPriorityView({
  tasks, projects, categories, teamMembers, statuses,
  commentCountByTaskId, allTaskComments, updateTaskMutation,
  onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
}) {
  const [filterByMemberId, setFilterByMemberId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showMine, setShowMine] = useState(false);

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

  const projectGroups = useMemo(() => {
    const byProject = {};
    filteredTasks.forEach(t => {
      if (!byProject[t.project_id]) byProject[t.project_id] = [];
      byProject[t.project_id].push(t);
    });
    return Object.entries(byProject)
      .map(([pid, ptasks]) => {
        const project = projects.find(p => p.id === pid) || { id: pid, name: "Unknown Project" };
        return { project, tasks: ptasks };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [filteredTasks, projects]);

  const handleAssign = useCallback(async (task, memberId) => {
    if (!updateTaskMutation) return;
    await updateTaskMutation.mutateAsync({ id: task.id, data: { assigned_team_member_id: memberId } });
    toast.success(memberId ? "Assigned" : "Unassigned");
  }, [updateTaskMutation]);

  const handleFilterByMember = useCallback((memberId) => {
    setFilterByMemberId(prev => prev === memberId ? null : memberId);
    setShowMine(false);
  }, []);

  const sp = {
    categories, teamMembers, statuses, commentCountByTaskId, latestCommentByTaskId, projectMap,
    onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
    onAssign: handleAssign,
  };

  return (
    <div className="space-y-2">
      <ShopTeamSummaryBar tasks={tasks} teamMembers={teamMembers} onFilterByMember={handleFilterByMember} activeFilterId={filterByMemberId} />

      <div className="flex items-center gap-1.5">
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
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-8">
          <Flame className="w-7 h-7 text-red-500/20 mx-auto mb-1.5" />
          <p className="text-gray-600 text-xs">No priority tasks.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-800/40">
          {projectGroups.map(({ project, tasks: ptasks }) => (
            <ProjectSection key={project.id} project={project} projectTasks={ptasks} teamMembers={teamMembers} sp={sp} />
          ))}
        </div>
      )}
    </div>
  );
}