import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Flame, AlertTriangle, Zap, Clock, User, UserX, ChevronDown, ChevronRight, FolderKanban } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import TaskCard from "@/components/project/TaskCard";
import TaskQuickPreview from "./TaskQuickPreview";
import ShopTeamSummaryBar from "./ShopTeamSummaryBar";

// ── urgency helpers ──
const URGENCY = {
  overdue: { label: "OVERDUE", icon: AlertTriangle, text: "text-red-400", bg: "bg-red-600/10", border: "border-l-red-600" },
  today:   { label: "TODAY",   icon: Zap,           text: "text-orange-300", bg: "bg-orange-500/8", border: "border-l-orange-500" },
  ready:   { label: "READY",   icon: Clock,         text: "text-gray-400", bg: "bg-gray-700/10", border: "border-l-gray-700" },
};

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

// ── tiny urgency section inside a column ──
function UrgencyBlock({ config, tasks, sp }) {
  if (!tasks.length) return null;
  const Icon = config.icon;
  return (
    <div className="mt-1">
      <div className={`flex items-center gap-1 px-1 py-px rounded ${config.bg}`}>
        <Icon className={`w-3 h-3 ${config.text}`} />
        <span className={`text-[10px] font-bold ${config.text}`}>{config.label}</span>
        <span className={`text-[10px] ${config.text} ml-auto`}>{tasks.length}</span>
      </div>
      <div className="mt-px space-y-px">
        {tasks.map(task => (
          <div key={task.id} className={`border-l ${config.border} pl-1.5 py-px`}>
            <TaskQuickPreview
              task={task}
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
          </div>
        ))}
      </div>
    </div>
  );
}

// ── single column (person or unassigned) ──
function PersonColumn({ name, initials, tasks, isShop, sp }) {
  const { overdue, today, ready } = useMemo(() => splitAndSort(tasks), [tasks]);
  const overdueCount = overdue.length;

  return (
    <div className={`w-[290px] min-w-[290px] shrink-0 rounded-lg border flex flex-col ${
      isShop ? "border-yellow-700/40 bg-yellow-950/10" : "border-gray-800 bg-gray-900/30"
    }`}>
      {/* Column header */}
      <div className={`px-2.5 py-1.5 border-b ${isShop ? "border-yellow-800/30" : "border-gray-800"} flex items-center gap-1.5`}>
        {isShop ? (
          <UserX className="w-3.5 h-3.5 text-yellow-500" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-blue-600/30 flex items-center justify-center text-[9px] font-bold text-blue-400">
            {initials}
          </div>
        )}
        <span className={`text-xs font-semibold truncate ${isShop ? "text-yellow-400" : "text-white"}`}>
          {isShop ? "UNASSIGNED / SHOP" : name}
        </span>
        <span className="text-[10px] text-gray-500 ml-auto shrink-0">{tasks.length}</span>
        {overdueCount > 0 && (
          <span className="text-[9px] font-semibold text-red-400 bg-red-900/30 px-1 py-px rounded shrink-0">
            {overdueCount}!
          </span>
        )}
      </div>
      {/* Tasks */}
      <div className="px-1.5 pb-1.5 overflow-y-auto flex-1">
        <UrgencyBlock config={URGENCY.overdue} tasks={overdue} sp={sp} />
        <UrgencyBlock config={URGENCY.today} tasks={today} sp={sp} />
        <UrgencyBlock config={URGENCY.ready} tasks={ready} sp={sp} />
        {tasks.length === 0 && (
          <p className="text-[10px] text-gray-600 text-center py-4">No tasks</p>
        )}
      </div>
    </div>
  );
}

// ── project section with horizontal columns ──
function ProjectSection({ project, projectTasks, allTeamMembers, sp }) {
  const [collapsed, setCollapsed] = useState(false);

  // Build columns: unassigned + each member who has tasks
  const { shopTasks, memberColumns } = useMemo(() => {
    const shop = [];
    const byMember = {};

    projectTasks.forEach(t => {
      if (!t.assigned_team_member_id) {
        shop.push(t);
      } else {
        if (!byMember[t.assigned_team_member_id]) byMember[t.assigned_team_member_id] = [];
        byMember[t.assigned_team_member_id].push(t);
      }
    });

    const cols = Object.entries(byMember)
      .map(([id, tasks]) => {
        const tm = allTeamMembers.find(m => m.id === id);
        const name = tm?.full_name || "Unknown";
        const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
        return { id, name, initials, tasks };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);

    return { shopTasks: shop, memberColumns: cols };
  }, [projectTasks, allTeamMembers]);

  const overdueTotal = projectTasks.filter(t => getSubBucket(t) === "overdue").length;

  return (
    <div className="rounded-lg border border-gray-800 bg-black/20">
      {/* Project header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        <FolderKanban className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold text-white truncate">{project.name}</span>
        {project.client_name && (
          <span className="text-xs text-gray-500 truncate">— {project.client_name}</span>
        )}
        <span className="text-xs text-gray-500 ml-auto shrink-0">{projectTasks.length} tasks</span>
        {overdueTotal > 0 && (
          <span className="text-[10px] font-semibold text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded shrink-0">
            {overdueTotal} overdue
          </span>
        )}
      </button>

      {/* Horizontal columns */}
      {!collapsed && (
        <div className="px-2 pb-2 overflow-x-auto">
          <div className="flex gap-2 min-w-min">
            {/* Unassigned / Shop first */}
            {shopTasks.length > 0 && (
              <PersonColumn name="" tasks={shopTasks} isShop sp={sp} />
            )}
            {/* Team member columns */}
            {memberColumns.map(col => (
              <PersonColumn
                key={col.id}
                name={col.name}
                initials={col.initials}
                tasks={col.tasks}
                isShop={false}
                sp={sp}
              />
            ))}
            {shopTasks.length === 0 && memberColumns.length === 0 && (
              <p className="text-xs text-gray-600 py-4 px-2">No tasks in this project.</p>
            )}
          </div>
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

  const latestCommentByTaskId = useMemo(() => {
    const m = {};
    if (!allTaskComments) return m;
    allTaskComments.forEach(c => {
      const existing = m[c.task_id];
      if (!existing || new Date(c.created_date) > new Date(existing.created_date)) m[c.task_id] = c;
    });
    return m;
  }, [allTaskComments]);

  // Filter
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

  // Group by project — only projects that have tasks
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
    categories, teamMembers, statuses, commentCountByTaskId, latestCommentByTaskId,
    onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
    onAssign: handleAssign,
  };

  return (
    <div className="space-y-3">
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
            ✕ Clear filter
          </button>
        )}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-10">
          <Flame className="w-8 h-8 text-red-500/20 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No priority tasks.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projectGroups.map(({ project, tasks: ptasks }) => (
            <ProjectSection
              key={project.id}
              project={project}
              projectTasks={ptasks}
              allTeamMembers={teamMembers}
              sp={sp}
            />
          ))}
        </div>
      )}
    </div>
  );
}