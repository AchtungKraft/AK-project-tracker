import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Flame, Clock, AlertTriangle, Timer, HelpCircle, User, UserX, Zap, ArrowDown as ArrowDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import TaskCard from "@/components/project/TaskCard";
import TaskQuickPreview from "./TaskQuickPreview";
import ShopTeamSummaryBar from "./ShopTeamSummaryBar";

// Sub-buckets for NOW
const NOW_SUB_CONFIG = {
  overdue: { label: "OVERDUE", icon: AlertTriangle, border: "border-l-red-600", bg: "bg-red-600/10", text: "text-red-400" },
  today: { label: "TODAY", icon: Zap, border: "border-l-red-400", bg: "bg-red-500/8", text: "text-red-300" },
  ready: { label: "READY", icon: ArrowDownIcon, border: "border-l-orange-500", bg: "bg-orange-500/8", text: "text-orange-300" },
};

const BUCKET_CONFIG = {
  next: { label: "NEXT", icon: Timer, border: "border-l-orange-500", bg: "bg-orange-500/10", text: "text-orange-400" },
  queued: { label: "QUEUED", icon: Clock, border: "border-l-yellow-500", bg: "bg-yellow-500/10", text: "text-yellow-400" },
  undefined: { label: "NO DUE DATE", icon: HelpCircle, border: "border-l-gray-600", bg: "bg-gray-600/10", text: "text-gray-400" },
};

const getUrgencyBucket = (task) => {
  if (!task.due_date) return "undefined";
  const now = new Date();
  const due = new Date(task.due_date);
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "now";
  if (diffDays <= 3) return "next";
  return "queued";
};

// Sort: unassigned first, then due date asc
const shopSort = (a, b) => {
  const aUnassigned = !a.assigned_team_member_id ? 0 : 1;
  const bUnassigned = !b.assigned_team_member_id ? 0 : 1;
  if (aUnassigned !== bUnassigned) return aUnassigned - bUnassigned;
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return new Date(a.due_date) - new Date(b.due_date);
};

function FilterToggle({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-red-600/30 border border-red-500/50 text-white"
          : "bg-gray-800/60 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeader({ config, count }) {
  const Icon = config.icon;
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${config.bg}`}>
      <Icon className={`w-3.5 h-3.5 ${config.text}`} />
      <span className={`text-xs font-bold tracking-wide ${config.text}`}>{config.label}</span>
      <span className={`ml-auto text-[10px] font-semibold ${config.text}`}>{count}</span>
    </div>
  );
}

function TaskRow({
  task, config, categories, teamMembers, statuses,
  commentCountByTaskId, latestCommentByTaskId, projectMap,
  onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority, onAssign,
}) {
  return (
    <div className={`border-l-2 ${config.border} pl-2 py-0.5`}>
      <TaskQuickPreview
        task={task}
        projectName={projectMap[task.project_id]}
        latestComment={latestCommentByTaskId[task.id]}
        teamMembers={teamMembers}
        onAssign={onAssign}
        onTaskClick={onTaskClick}
        onUpdateDueDate={onUpdateDueDate}
      >
        <TaskCard
          task={task}
          categories={categories}
          teamMembers={teamMembers}
          statuses={statuses}
          onToggleComplete={onToggleComplete}
          onClick={() => {}}
          commentCount={commentCountByTaskId[task.id] || 0}
          onUpdateDueDate={onUpdateDueDate}
          onUpdateStartDate={onUpdateStartDate}
          onTogglePriority={onTogglePriority}
          showInlineControls={true}
          compact={true}
        />
      </TaskQuickPreview>
    </div>
  );
}

function TaskList({ tasks, config, sharedProps }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <SectionHeader config={config} count={tasks.length} />
      <div className="space-y-0.5 mt-1">
        {tasks.map(task => (
          <TaskRow key={task.id} task={task} config={config} {...sharedProps} />
        ))}
      </div>
    </div>
  );
}

export default function ShopPriorityView({
  tasks, projects, categories, teamMembers, statuses,
  commentCountByTaskId, allTaskComments, updateTaskMutation,
  onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
}) {
  const [showMine, setShowMine] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [filterByMemberId, setFilterByMemberId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

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
      if (!existing || new Date(c.created_date) > new Date(existing.created_date)) {
        m[c.task_id] = c;
      }
    });
    return m;
  }, [allTaskComments]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (showMine && currentUserId) result = result.filter(t => t.assigned_team_member_id === currentUserId);
    if (showUnassigned) result = result.filter(t => !t.assigned_team_member_id);
    if (showOverdueOnly) {
      const now = new Date();
      result = result.filter(t => t.due_date && new Date(t.due_date) <= now);
    }
    if (filterByMemberId) {
      result = filterByMemberId === "unassigned"
        ? result.filter(t => !t.assigned_team_member_id)
        : result.filter(t => t.assigned_team_member_id === filterByMemberId);
    }
    return result;
  }, [tasks, showMine, showUnassigned, showOverdueOnly, filterByMemberId, currentUserId]);

  // Split NOW into overdue / today / ready, plus standard buckets
  const sections = useMemo(() => {
    const nowTasks = [];
    const nextTasks = [];
    const queuedTasks = [];
    const undefinedTasks = [];

    filteredTasks.forEach(task => {
      const bucket = getUrgencyBucket(task);
      if (bucket === "now") nowTasks.push(task);
      else if (bucket === "next") nextTasks.push(task);
      else if (bucket === "queued") queuedTasks.push(task);
      else undefinedTasks.push(task);
    });

    // Split NOW into sub-buckets
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const overdue = [];
    const todayBucket = [];
    const ready = [];

    nowTasks.forEach(t => {
      const dueStr = t.due_date ? t.due_date.slice(0, 10) : "";
      if (dueStr < todayStr) overdue.push(t);
      else if (dueStr === todayStr) todayBucket.push(t);
      else ready.push(t);
    });

    // Sort all
    [overdue, todayBucket, ready, nextTasks, queuedTasks, undefinedTasks].forEach(arr => arr.sort(shopSort));

    return { overdue, today: todayBucket, ready, next: nextTasks, queued: queuedTasks, undefined: undefinedTasks };
  }, [filteredTasks]);

  const handleAssign = useCallback(async (task, memberId) => {
    if (!updateTaskMutation) return;
    await updateTaskMutation.mutateAsync({ id: task.id, data: { assigned_team_member_id: memberId } });
    toast.success(memberId ? "Assigned" : "Unassigned");
  }, [updateTaskMutation]);

  const handleFilterByMember = useCallback((memberId) => {
    setFilterByMemberId(prev => prev === memberId ? null : memberId);
    setShowMine(false);
    setShowUnassigned(false);
  }, []);

  const totalCount = filteredTasks.length;
  const hasActiveFilter = showMine || showUnassigned || showOverdueOnly || filterByMemberId;

  const sharedProps = {
    categories, teamMembers, statuses, commentCountByTaskId, latestCommentByTaskId, projectMap,
    onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
    onAssign: handleAssign,
  };

  return (
    <div className="space-y-3">
      <ShopTeamSummaryBar tasks={tasks} teamMembers={teamMembers} onFilterByMember={handleFilterByMember} activeFilterId={filterByMemberId} />

      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterToggle active={showMine} onClick={() => { setShowMine(v => !v); setFilterByMemberId(null); }}>
          <span className="flex items-center gap-1"><User className="w-3 h-3" /> Mine</span>
        </FilterToggle>
        <FilterToggle active={showUnassigned} onClick={() => { setShowUnassigned(v => !v); setFilterByMemberId(null); }}>
          <span className="flex items-center gap-1"><UserX className="w-3 h-3" /> Unassigned</span>
        </FilterToggle>
        <FilterToggle active={showOverdueOnly} onClick={() => setShowOverdueOnly(v => !v)}>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Overdue</span>
        </FilterToggle>
        {filterByMemberId && (
          <button onClick={() => setFilterByMemberId(null)} className="px-2 py-0.5 rounded text-[11px] text-red-400 hover:text-red-300 bg-red-900/20 border border-red-700/30">
            ✕ Clear
          </button>
        )}
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-10">
          <Flame className="w-8 h-8 text-red-500/20 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">{hasActiveFilter ? "No tasks match filters." : "No priority tasks."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <TaskList tasks={sections.overdue} config={NOW_SUB_CONFIG.overdue} sharedProps={sharedProps} />
          <TaskList tasks={sections.today} config={NOW_SUB_CONFIG.today} sharedProps={sharedProps} />
          <TaskList tasks={sections.ready} config={NOW_SUB_CONFIG.ready} sharedProps={sharedProps} />
          <TaskList tasks={sections.next} config={BUCKET_CONFIG.next} sharedProps={sharedProps} />
          <TaskList tasks={sections.queued} config={BUCKET_CONFIG.queued} sharedProps={sharedProps} />
          <TaskList tasks={sections.undefined} config={BUCKET_CONFIG.undefined} sharedProps={sharedProps} />
        </div>
      )}
    </div>
  );
}