import React, { useState, useMemo, useEffect } from "react";
import { Flame, Clock, AlertTriangle, Timer, HelpCircle, User, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import TaskCard from "@/components/project/TaskCard";

const BUCKET_CONFIG = {
  now: { label: "NOW", icon: AlertTriangle, color: "#EF4444", border: "border-l-red-500", bg: "bg-red-500/10", text: "text-red-400" },
  next: { label: "NEXT", icon: Timer, color: "#F97316", border: "border-l-orange-500", bg: "bg-orange-500/10", text: "text-orange-400" },
  queued: { label: "QUEUED", icon: Clock, color: "#EAB308", border: "border-l-yellow-500", bg: "bg-yellow-500/10", text: "text-yellow-400" },
  undefined: { label: "NO DUE DATE", icon: HelpCircle, color: "#6B7280", border: "border-l-gray-500", bg: "bg-gray-500/10", text: "text-gray-400" },
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

function QuickFilterBar({ showMine, setShowMine, showUnassigned, setShowUnassigned, showOverdueOnly, setShowOverdueOnly }) {
  const Toggle = ({ active, onClick, children }) => (
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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Toggle active={showMine} onClick={() => setShowMine(v => !v)}>
        <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> My Tasks</span>
      </Toggle>
      <Toggle active={showUnassigned} onClick={() => setShowUnassigned(v => !v)}>
        <span className="flex items-center gap-1.5"><UserX className="w-3.5 h-3.5" /> Unassigned</span>
      </Toggle>
      <Toggle active={showOverdueOnly} onClick={() => setShowOverdueOnly(v => !v)}>
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Overdue</span>
      </Toggle>
    </div>
  );
}

function BucketSection({ bucketKey, tasks, categories, teamMembers, statuses, commentCountByTaskId, onTaskClick, onToggleComplete, onUpdateDueDate, onUpdateStartDate, onTogglePriority }) {
  const config = BUCKET_CONFIG[bucketKey];
  const Icon = config.icon;

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${config.bg}`}>
        <Icon className={`w-4 h-4 ${config.text}`} />
        <span className={`text-sm font-bold tracking-wide ${config.text}`}>{config.label}</span>
        <Badge variant="outline" className={`ml-auto text-xs ${config.text} border-current`}>
          {tasks.length}
        </Badge>
      </div>
      <div className="space-y-1.5">
        {tasks.map(task => (
          <div key={task.id} className={`border-l-3 ${config.border} pl-2`}>
            <TaskCard
              task={task}
              categories={categories}
              teamMembers={teamMembers}
              statuses={statuses}
              onToggleComplete={onToggleComplete}
              onClick={() => onTaskClick(task)}
              commentCount={commentCountByTaskId[task.id] || 0}
              onUpdateDueDate={onUpdateDueDate}
              onUpdateStartDate={onUpdateStartDate}
              onTogglePriority={onTogglePriority}
              showInlineControls={true}
              compact={false}
            />
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
  onTaskClick,
  onToggleComplete,
  onUpdateDueDate,
  onUpdateStartDate,
  onTogglePriority,
}) {
  const [showMine, setShowMine] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Resolve current user's team member ID for "My Tasks" filter
  useEffect(() => {
    if (!showMine) return;
    let cancelled = false;
    base44.auth.me().then(user => {
      if (cancelled) return;
      const myTm = teamMembers.find(tm => tm.user_id === user.id);
      setCurrentUserId(myTm?.id || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [showMine, teamMembers]);

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
    return result;
  }, [tasks, showMine, showUnassigned, showOverdueOnly, currentUserId]);

  const buckets = useMemo(() => {
    const b = { now: [], next: [], queued: [], undefined: [] };
    filteredTasks.forEach(task => {
      b[getUrgencyBucket(task)].push(task);
    });
    // Sort each bucket: due_date ascending, no-date last
    const sortFn = (a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    };
    Object.values(b).forEach(arr => arr.sort(sortFn));
    return b;
  }, [filteredTasks]);

  const totalCount = filteredTasks.length;
  const bucketOrder = ["now", "next", "queued", "undefined"];

  return (
    <div className="space-y-4">
      <QuickFilterBar
        showMine={showMine}
        setShowMine={setShowMine}
        showUnassigned={showUnassigned}
        setShowUnassigned={setShowUnassigned}
        showOverdueOnly={showOverdueOnly}
        setShowOverdueOnly={setShowOverdueOnly}
      />

      {totalCount === 0 ? (
        <div className="text-center py-12">
          <Flame className="w-10 h-10 text-red-500/30 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No tasks match the current filters.</p>
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
              onTaskClick={onTaskClick}
              onToggleComplete={onToggleComplete}
              onUpdateDueDate={onUpdateDueDate}
              onUpdateStartDate={onUpdateStartDate}
              onTogglePriority={onTogglePriority}
            />
          ))}
        </div>
      )}
    </div>
  );
}