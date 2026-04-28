import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Flame, Clock, AlertTriangle, Timer, HelpCircle, User, UserX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import TaskCard from "@/components/project/TaskCard";
import TaskQuickPreview from "./TaskQuickPreview";
import ShopTeamSummaryBar from "./ShopTeamSummaryBar";

const BUCKET_CONFIG = {
  now: { label: "NOW", icon: AlertTriangle, border: "border-l-red-500", bg: "bg-red-500/10", text: "text-red-400" },
  next: { label: "NEXT", icon: Timer, border: "border-l-orange-500", bg: "bg-orange-500/10", text: "text-orange-400" },
  queued: { label: "QUEUED", icon: Clock, border: "border-l-yellow-500", bg: "bg-yellow-500/10", text: "text-yellow-400" },
  undefined: { label: "NO DUE DATE", icon: HelpCircle, border: "border-l-gray-500", bg: "bg-gray-500/10", text: "text-gray-400" },
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

// Toggle button reused across filters
function FilterToggle({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-red-600/30 border border-red-500/50 text-white"
          : "bg-gray-800/60 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
      }`}
    >
      {children}
    </button>
  );
}

function BucketSection({
  bucketKey, tasks, categories, teamMembers, statuses,
  commentCountByTaskId, latestCommentByTaskId, projectMap,
  onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority,
  assignmentMode, onAssign, updateTaskMutation,
}) {
  const config = BUCKET_CONFIG[bucketKey];
  const Icon = config.icon;

  if (tasks.length === 0) return null;

  const unassignedInBucket = tasks.filter(t => !t.assigned_team_member_id);

  const handleAssignAllUnassigned = async (memberId) => {
    if (!updateTaskMutation || unassignedInBucket.length === 0) return;
    for (const t of unassignedInBucket) {
      await updateTaskMutation.mutateAsync({ id: t.id, data: { assigned_team_member_id: memberId } });
    }
    toast.success(`Assigned ${unassignedInBucket.length} tasks`);
  };

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${config.bg}`}>
        <Icon className={`w-4 h-4 ${config.text}`} />
        <span className={`text-sm font-bold tracking-wide ${config.text}`}>{config.label}</span>
        <Badge variant="outline" className={`ml-auto text-xs ${config.text} border-current`}>
          {tasks.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {tasks.map(task => (
          <div key={task.id} className={`border-l-3 ${config.border} pl-2`}>
            <TaskQuickPreview
              task={task}
              projectName={projectMap[task.project_id]}
              latestComment={latestCommentByTaskId[task.id]}
              teamMembers={teamMembers}
              assignmentMode={assignmentMode}
              onAssign={onAssign}
              onTaskClick={onTaskClick}
            >
              <TaskCard
                task={task}
                categories={categories}
                teamMembers={teamMembers}
                statuses={statuses}
                onToggleComplete={onToggleComplete}
                onClick={() => {}} // handled by TaskQuickPreview wrapper
                commentCount={commentCountByTaskId[task.id] || 0}
                onUpdateDueDate={onUpdateDueDate}
                onUpdateStartDate={onUpdateStartDate}
                onTogglePriority={onTogglePriority}
                showInlineControls={true}
                compact={false}
              />
            </TaskQuickPreview>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ShopPriorityView({
  tasks,
  projects,
  categories,
  teamMembers,
  statuses,
  commentCountByTaskId,
  allTaskComments,
  updateTaskMutation,
  onTaskClick,
  onToggleComplete,
  onUpdateDueDate,
  onUpdateStartDate,
  onTogglePriority,
}) {
  const [showMine, setShowMine] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [filterByMemberId, setFilterByMemberId] = useState(null);
  const [assignmentMode, setAssignmentMode] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Resolve current user's team member ID once
  useEffect(() => {
    let cancelled = false;
    base44.auth.me().then(user => {
      if (cancelled) return;
      const myTm = teamMembers.find(tm => tm.user_id === user.id);
      setCurrentUserId(myTm?.id || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [teamMembers]);

  // Memoized project map
  const projectMap = useMemo(() => {
    const m = {};
    projects.forEach(p => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  // Memoized latest comment per task
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

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (showMine && currentUserId) {
      result = result.filter(t => t.assigned_team_member_id === currentUserId);
    }
    if (showUnassigned) {
      result = result.filter(t => !t.assigned_team_member_id);
    }
    if (showOverdueOnly) {
      const now = new Date();
      result = result.filter(t => t.due_date && new Date(t.due_date) <= now);
    }
    if (filterByMemberId) {
      if (filterByMemberId === "unassigned") {
        result = result.filter(t => !t.assigned_team_member_id);
      } else {
        result = result.filter(t => t.assigned_team_member_id === filterByMemberId);
      }
    }
    return result;
  }, [tasks, showMine, showUnassigned, showOverdueOnly, filterByMemberId, currentUserId]);

  // Bucket tasks
  const buckets = useMemo(() => {
    const b = { now: [], next: [], queued: [], undefined: [] };
    filteredTasks.forEach(task => { b[getUrgencyBucket(task)].push(task); });
    const sortFn = (a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    };
    Object.values(b).forEach(arr => arr.sort(sortFn));
    return b;
  }, [filteredTasks]);

  // Assignment handler using same mutation pattern
  const handleAssign = useCallback(async (task, memberId) => {
    if (!updateTaskMutation) return;
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { assigned_team_member_id: memberId },
    });
    toast.success(memberId ? "Task assigned" : "Task unassigned");
  }, [updateTaskMutation]);

  // Team summary bar click handler
  const handleFilterByMember = useCallback((memberId) => {
    setFilterByMemberId(prev => prev === memberId ? null : memberId);
    // Clear conflicting quick filters
    setShowMine(false);
    setShowUnassigned(false);
  }, []);

  const totalCount = filteredTasks.length;
  const bucketOrder = ["now", "next", "queued", "undefined"];
  const hasActiveFilter = showMine || showUnassigned || showOverdueOnly || filterByMemberId;

  return (
    <div className="space-y-4">
      {/* Team Summary Bar */}
      <ShopTeamSummaryBar
        tasks={tasks}
        teamMembers={teamMembers}
        onFilterByMember={handleFilterByMember}
      />

      {/* Filter + Mode Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterToggle active={showMine} onClick={() => { setShowMine(v => !v); setFilterByMemberId(null); }}>
            <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> My Tasks</span>
          </FilterToggle>
          <FilterToggle active={showUnassigned} onClick={() => { setShowUnassigned(v => !v); setFilterByMemberId(null); }}>
            <span className="flex items-center gap-1.5"><UserX className="w-3.5 h-3.5" /> Unassigned</span>
          </FilterToggle>
          <FilterToggle active={showOverdueOnly} onClick={() => setShowOverdueOnly(v => !v)}>
            <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Overdue</span>
          </FilterToggle>
          {filterByMemberId && (
            <button
              onClick={() => setFilterByMemberId(null)}
              className="px-2 py-1 rounded-md text-xs text-red-400 hover:text-red-300 bg-red-900/20 border border-red-700/30"
            >
              ✕ Clear member filter
            </button>
          )}
        </div>
        <FilterToggle active={assignmentMode} onClick={() => setAssignmentMode(v => !v)}>
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Assign Mode</span>
        </FilterToggle>
      </div>

      {/* Bucket Lanes */}
      {totalCount === 0 ? (
        <div className="text-center py-12">
          <Flame className="w-10 h-10 text-red-500/30 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {hasActiveFilter ? "No tasks match the current filters." : "No priority tasks."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {bucketOrder.map(key => (
            <BucketSection
              key={key}
              bucketKey={key}
              tasks={buckets[key]}
              categories={categories}
              teamMembers={teamMembers}
              statuses={statuses}
              commentCountByTaskId={commentCountByTaskId}
              latestCommentByTaskId={latestCommentByTaskId}
              projectMap={projectMap}
              onTaskClick={onTaskClick}
              onToggleComplete={onToggleComplete}
              onUpdateDueDate={onUpdateDueDate}
              onUpdateStartDate={onUpdateStartDate}
              onTogglePriority={onTogglePriority}
              assignmentMode={assignmentMode}
              onAssign={handleAssign}
              updateTaskMutation={updateTaskMutation}
            />
          ))}
        </div>
      )}
    </div>
  );
}