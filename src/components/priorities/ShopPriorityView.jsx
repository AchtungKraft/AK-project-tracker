import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Flame, AlertTriangle, Zap, Clock, User, UserX, ChevronDown, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import TaskCard from "@/components/project/TaskCard";
import TaskQuickPreview from "./TaskQuickPreview";
import ShopTeamSummaryBar from "./ShopTeamSummaryBar";

const URGENCY_CONFIG = {
  overdue: { label: "OVERDUE", icon: AlertTriangle, border: "border-l-red-600", bg: "bg-red-600/10", text: "text-red-400" },
  today:   { label: "TODAY",   icon: Zap,           border: "border-l-orange-500", bg: "bg-orange-500/8", text: "text-orange-300" },
  ready:   { label: "READY",   icon: Clock,         border: "border-l-gray-600", bg: "bg-gray-700/10", text: "text-gray-400" },
};

function getSubBucket(task) {
  if (!task.due_date) return "ready";
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const dueStr = task.due_date.slice(0, 10);
  if (dueStr < todayStr) return "overdue";
  if (dueStr === todayStr) return "today";
  return "ready";
}

// Sort: due date asc within each sub-bucket
const dueDateSort = (a, b) => {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return new Date(a.due_date) - new Date(b.due_date);
};

function UrgencySection({ config, tasks, sharedProps }) {
  if (tasks.length === 0) return null;
  const Icon = config.icon;
  return (
    <div className="mt-1">
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${config.bg}`}>
        <Icon className={`w-3 h-3 ${config.text}`} />
        <span className={`text-[10px] font-bold tracking-wide ${config.text}`}>{config.label}</span>
        <span className={`text-[10px] ${config.text} ml-auto`}>{tasks.length}</span>
      </div>
      <div className="mt-0.5">
        {tasks.map(task => (
          <div key={task.id} className={`border-l ${config.border} pl-2 py-px`}>
            <TaskQuickPreview
              task={task}
              projectName={sharedProps.projectMap[task.project_id]}
              latestComment={sharedProps.latestCommentByTaskId[task.id]}
              teamMembers={sharedProps.teamMembers}
              onAssign={sharedProps.onAssign}
              onTaskClick={sharedProps.onTaskClick}
            >
              <TaskCard
                task={task}
                categories={sharedProps.categories}
                teamMembers={sharedProps.teamMembers}
                statuses={sharedProps.statuses}
                onToggleComplete={sharedProps.onToggleComplete}
                onClick={() => {}}
                commentCount={sharedProps.commentCountByTaskId[task.id] || 0}
                onUpdateDueDate={sharedProps.onUpdateDueDate}
                onUpdateStartDate={sharedProps.onUpdateStartDate}
                onTogglePriority={sharedProps.onTogglePriority}
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

function PersonGroup({ memberId, memberName, tasks, isUnassigned, sharedProps }) {
  const [collapsed, setCollapsed] = useState(false);

  // Split tasks into overdue / today / ready
  const { overdue, today, ready } = useMemo(() => {
    const o = [], t = [], r = [];
    tasks.forEach(task => {
      const b = getSubBucket(task);
      if (b === "overdue") o.push(task);
      else if (b === "today") t.push(task);
      else r.push(task);
    });
    [o, t, r].forEach(arr => arr.sort(dueDateSort));
    return { overdue: o, today: t, ready: r };
  }, [tasks]);

  const overdueCount = overdue.length;

  return (
    <div className={`rounded-lg border ${isUnassigned ? "border-yellow-700/40 bg-yellow-900/5" : "border-gray-800 bg-gray-900/30"}`}>
      {/* Group header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        {isUnassigned ? (
          <UserX className="w-4 h-4 text-yellow-500" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-blue-600/30 flex items-center justify-center text-[10px] font-bold text-blue-400">
            {(memberName || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className={`text-sm font-semibold ${isUnassigned ? "text-yellow-400" : "text-white"}`}>
          {isUnassigned ? "UNASSIGNED" : memberName}
        </span>
        <span className="text-xs text-gray-500 ml-auto">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </span>
        {overdueCount > 0 && (
          <span className="text-[10px] font-semibold text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">
            {overdueCount} overdue
          </span>
        )}
      </button>

      {/* Tasks */}
      {!collapsed && (
        <div className="px-2 pb-2">
          <UrgencySection config={URGENCY_CONFIG.overdue} tasks={overdue} sharedProps={sharedProps} />
          <UrgencySection config={URGENCY_CONFIG.today} tasks={today} sharedProps={sharedProps} />
          <UrgencySection config={URGENCY_CONFIG.ready} tasks={ready} sharedProps={sharedProps} />
        </div>
      )}
    </div>
  );
}

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

  // Apply filters
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

  // Group by assignee
  const groups = useMemo(() => {
    const byMember = {};
    const unassigned = [];

    filteredTasks.forEach(task => {
      if (!task.assigned_team_member_id) {
        unassigned.push(task);
      } else {
        if (!byMember[task.assigned_team_member_id]) byMember[task.assigned_team_member_id] = [];
        byMember[task.assigned_team_member_id].push(task);
      }
    });

    // Build sorted array: most tasks first
    const memberGroups = Object.entries(byMember)
      .map(([id, tasks]) => {
        const tm = teamMembers.find(m => m.id === id);
        return { id, name: tm?.full_name || "Unknown", tasks };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);

    return { unassigned, memberGroups };
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

  const sharedProps = {
    categories, teamMembers, statuses, commentCountByTaskId, latestCommentByTaskId, projectMap,
    onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
    onAssign: handleAssign,
  };

  const totalCount = filteredTasks.length;

  return (
    <div className="space-y-3">
      <ShopTeamSummaryBar tasks={tasks} teamMembers={teamMembers} onFilterByMember={handleFilterByMember} activeFilterId={filterByMemberId} />

      {/* Light filters */}
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

      {totalCount === 0 ? (
        <div className="text-center py-10">
          <Flame className="w-8 h-8 text-red-500/20 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No priority tasks.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Unassigned first */}
          {groups.unassigned.length > 0 && (
            <PersonGroup
              memberId="unassigned"
              memberName="Unassigned"
              tasks={groups.unassigned}
              isUnassigned={true}
              sharedProps={sharedProps}
            />
          )}
          {/* Then by person, most tasks first */}
          {groups.memberGroups.map(g => (
            <PersonGroup
              key={g.id}
              memberId={g.id}
              memberName={g.name}
              tasks={g.tasks}
              isUnassigned={false}
              sharedProps={sharedProps}
            />
          ))}
        </div>
      )}
    </div>
  );
}