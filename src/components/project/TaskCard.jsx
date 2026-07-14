import React, { useState } from "react";
import { User, CheckCircle2, Circle, MessageSquare, CalendarIcon, AlertCircle, PlayCircle, Flag, Loader2, Package } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { Button } from "@/components/ui/button";
import PriorityRemoveConfirm from "@/components/tasks/PriorityRemoveConfirm";
import { getChecklistProgressColor } from "@/components/tasks/checklistHelpers";
import DependencySummaryBadge from "@/components/workflow/DependencySummaryBadge";

// Helper to get full category path
const getCategoryPath = (categoryId, categories) => {
  if (!categoryId) return null;
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;
  
  if (category.parent_id) {
    const parent = categories.find(c => c.id === category.parent_id);
    if (parent) {
      return `${parent.name} > ${category.name}`;
    }
  }
  return category.name;
};

export default function TaskCard({ task, teamMembers = [], categories = [], statuses = [], allTasks = [], onToggleComplete, onClick, onUpdateDueDate, onUpdateStartDate, onTogglePriority, commentCount = 0, checklistProgress, partsProgress, compact = false, showInlineControls = true, titleRef, onTitleMouseEnter, onTitleMouseLeave }) {
  const isMobile = useIsMobile();
  const isCompact = compact || isMobile;
  const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);
  const category = categories.find(c => c.id === task.category_id);
  const categoryPath = getCategoryPath(task.category_id, categories);
  const categoryColor = category?.color;
  
  const taskStatus = statuses.find(s => s.id === task.status_id);
  const isCompleted = taskStatus && (
    taskStatus.label.toLowerCase().includes('complete') || 
    taskStatus.label.toLowerCase().includes('done')
  );

  const hasComments = commentCount > 0 || task.description;
  const [dueDateCalendarOpen, setDueDateCalendarOpen] = useState(false);
  const [startDateCalendarOpen, setStartDateCalendarOpen] = useState(false);
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false);
  const [isUpdatingDueDate, setIsUpdatingDueDate] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);
  const [showPriorityConfirm, setShowPriorityConfirm] = useState(false);
  
  // Determine if inline controls should be shown - require both prop AND handlers
  const hasInlineControls = showInlineControls && (onUpdateDueDate || onUpdateStartDate || onTogglePriority);

  // CANONICAL: Delegate all completion to the provider's toggleComplete
  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    if (!onToggleComplete) return;
    // toggleComplete handles both completion (with full flow) and reopen
    onToggleComplete(task);
  };

  const handleDueDateSelect = async (date) => {
    if (onUpdateDueDate) {
      setIsUpdatingDueDate(true);
      try {
        await onUpdateDueDate(task, date ? format(date, 'yyyy-MM-dd') : null);
      } finally {
        setIsUpdatingDueDate(false);
        setDueDateCalendarOpen(false);
      }
    }
  };

  const handleStartDateSelect = async (date) => {
    if (onUpdateStartDate) {
      setIsUpdatingStartDate(true);
      try {
        await onUpdateStartDate(task, date ? format(date, 'yyyy-MM-dd') : null);
      } finally {
        setIsUpdatingStartDate(false);
        setStartDateCalendarOpen(false);
      }
    }
  };

  const handleTogglePriority = async (e) => {
    e.stopPropagation();
    if (!onTogglePriority) return;
    
    // If removing priority, show confirmation dialog
    if (task.is_priority) {
      console.log("PRIORITY CONFIRM SHOWN", task.name);
      setShowPriorityConfirm(true);
      return;
    }
    
    // Adding priority - execute immediately
    setIsUpdatingPriority(true);
    try {
      await onTogglePriority(task, true); // skipConfirm = true
    } finally {
      setIsUpdatingPriority(false);
    }
  };

  const handleConfirmRemovePriority = async () => {
    setIsUpdatingPriority(true);
    try {
      await onTogglePriority(task, true); // skipConfirm = true, forces the update
    } finally {
      setIsUpdatingPriority(false);
      setShowPriorityConfirm(false);
    }
  };

  const renderInlineControls = () => (
    <>
      {onTogglePriority && (
        <button
          onClick={handleTogglePriority}
          disabled={isUpdatingPriority}
          className={cn(
            "rounded hover:bg-gray-700 transition-colors",
            task.is_priority ? 'text-orange-500' : 'text-gray-500 hover:text-orange-400',
            isCompact ? "p-0.5" : "p-1"
          )}
          title={task.is_priority ? 'Remove from priority' : 'Mark as priority'}
        >
          {isUpdatingPriority ? (
            <Loader2 className={cn(isCompact ? "w-3 h-3" : "w-3.5 h-3.5", "animate-spin")} />
          ) : (
            <Flag className={cn(isCompact ? "w-3 h-3" : "w-3.5 h-3.5", task.is_priority && "fill-current")} />
          )}
        </button>
      )}
      {onUpdateStartDate && (
        <Popover open={startDateCalendarOpen} onOpenChange={setStartDateCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              disabled={isUpdatingStartDate}
              className={cn(
                "rounded hover:bg-gray-700 transition-colors",
                task.start_date ? 'text-blue-400' : 'text-gray-500 hover:text-blue-300',
                isCompact ? "p-0.5" : "p-1"
              )}
              title={task.start_date ? `Start: ${format(new Date(task.start_date), 'MMM d, yyyy')}` : 'Set start date'}
            >
              {isUpdatingStartDate ? (
                <Loader2 className={cn(isCompact ? "w-3 h-3" : "w-3.5 h-3.5", "animate-spin")} />
              ) : (
                <PlayCircle className={isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700" onClick={(e) => e.stopPropagation()} side={isMobile ? "top" : "bottom"} align={isMobile ? "center" : "start"}>
            <div className="p-2 border-b border-gray-700">
              <p className="text-xs text-gray-400">Start Date</p>
              {task.start_date && <p className="text-sm text-white">{format(new Date(task.start_date), 'MMM d, yyyy')}</p>}
            </div>
            <Calendar mode="single" selected={task.start_date ? new Date(task.start_date) : undefined} onSelect={handleStartDateSelect} defaultMonth={task.start_date ? new Date(task.start_date) : new Date()} className="bg-gray-900" />
            {task.start_date && (
              <div className="p-2 border-t border-gray-700">
                <Button variant="ghost" size="sm" onClick={() => handleStartDateSelect(null)} className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20">Clear Start Date</Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
      {onUpdateDueDate && (
        <Popover open={dueDateCalendarOpen} onOpenChange={setDueDateCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              disabled={isUpdatingDueDate}
              className={cn(
                "rounded hover:bg-gray-700 transition-colors",
                task.due_date ? 'text-red-400' : 'text-gray-500 hover:text-red-300',
                isCompact ? "p-0.5" : "p-1"
              )}
              title={task.due_date ? `Due: ${format(new Date(task.due_date), 'MMM d, yyyy')}` : 'Set due date'}
            >
              {isUpdatingDueDate ? (
                <Loader2 className={cn(isCompact ? "w-3 h-3" : "w-3.5 h-3.5", "animate-spin")} />
              ) : (
                <CalendarIcon className={isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700" onClick={(e) => e.stopPropagation()} side={isMobile ? "top" : "bottom"} align={isMobile ? "center" : "start"}>
            <div className="p-2 border-b border-gray-700">
              <p className="text-xs text-gray-400">Due Date</p>
              {task.due_date && <p className="text-sm text-white">{format(new Date(task.due_date), 'MMM d, yyyy')}</p>}
            </div>
            <Calendar mode="single" selected={task.due_date ? new Date(task.due_date) : undefined} onSelect={handleDueDateSelect} defaultMonth={task.due_date ? new Date(task.due_date) : new Date()} className="bg-gray-900" />
            {task.due_date && (
              <div className="p-2 border-t border-gray-700">
                <Button variant="ghost" size="sm" onClick={() => handleDueDateSelect(null)} className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20">Clear Due Date</Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "rounded transition-all cursor-pointer group w-full max-w-full overflow-hidden",
        isCompact
          ? task.is_priority
            ? "border-l-2 border-l-red-500 py-0.5 px-1"
            : "py-0.5 px-1"
          : task.is_priority
            ? "bg-red-950/20 border-l-2 border-l-red-500 p-2"
            : "hover:bg-gray-800/40 p-2"
      )}
    >
      <div className={cn("flex items-start", isCompact ? "gap-1.5" : "gap-2")}>
        <button
          onClick={handleCheckboxClick}
          className="mt-0.5 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
        >
          {isCompleted ? (
            <CheckCircle2 className={cn(isCompact ? "w-3.5 h-3.5" : "w-4 h-4", "text-green-500")} />
          ) : (
            <Circle className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          )}
        </button>
        
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-center gap-1">
            <h4
              ref={titleRef}
              onMouseEnter={onTitleMouseEnter}
              onMouseLeave={onTitleMouseLeave}
              className={cn(
              "text-white font-medium leading-tight group-hover:text-red-400 transition-colors min-w-0 inline",
              isCompact ? "text-xs line-clamp-1" : "text-sm line-clamp-2",
              isCompleted && "line-through opacity-60"
            )}>
              {task.name}
            </h4>
            {/* Parts progress indicator (compact mode) */}
            {isCompact && partsProgress && partsProgress.total > 0 && (
              <span className={cn(
                "text-[10px] shrink-0 tabular-nums font-medium flex items-center gap-0.5",
                partsProgress.installed >= partsProgress.total
                  ? "text-green-500"
                  : partsProgress.installed === 0
                    ? "text-amber-500/70"
                    : "text-blue-400/70"
              )} title={`Parts: ${partsProgress.installed} of ${partsProgress.total} installed`}>
                <Package className="w-2.5 h-2.5" />
                {partsProgress.installed}/{partsProgress.total}
              </span>
            )}
            {/* Dependency summary (compact mode) */}
            {isCompact && task.operational_state && (
              <DependencySummaryBadge task={task} allTasks={allTasks} />
            )}
            {/* Checklist progress indicator (compact mode) */}
            {isCompact && checklistProgress && checklistProgress.total > 0 && (
              <span className={cn(
                "text-[10px] shrink-0 tabular-nums font-medium",
                getChecklistProgressColor(checklistProgress.completed, checklistProgress.total) || "text-gray-500"
              )}>
                {checklistProgress.completed}/{checklistProgress.total}
              </span>
            )}
            {/* Compact: inline controls on same row as name, visible on hover */}
            {isCompact && hasInlineControls && (
              <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">{renderInlineControls()}</div>
            )}
            {hasComments && !isCompact && (
              <MessageSquare className="text-blue-400/60 flex-shrink-0 w-3.5 h-3.5" />
            )}
          </div>
          
          {/* Dependency summary (non-compact mode) */}
          {!isCompact && task.operational_state && (
            <div className="mt-0.5">
              <DependencySummaryBadge task={task} allTasks={allTasks} />
            </div>
          )}
          {categoryPath && !isCompact && (
            <div className="flex items-center gap-1 text-xs mb-0.5">
              <span style={{ color: categoryColor || '#9CA3AF' }}>
                {categoryPath}
              </span>
            </div>
          )}
          
          {/* Parts progress indicator (non-compact) */}
          {!isCompact && partsProgress && partsProgress.total > 0 && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Package className={cn(
                "w-3 h-3",
                partsProgress.installed >= partsProgress.total ? "text-green-500" : partsProgress.installed === 0 ? "text-amber-500/70" : "text-blue-400/70"
              )} />
              <span className={cn(
                "text-xs tabular-nums",
                partsProgress.installed >= partsProgress.total ? "text-green-500" : partsProgress.installed === 0 ? "text-amber-500/70" : "text-blue-400/70"
              )}>
                Parts: {partsProgress.installed}/{partsProgress.total}
              </span>
              <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    partsProgress.installed >= partsProgress.total ? "bg-green-500" : partsProgress.installed === 0 ? "bg-amber-500/50" : "bg-blue-400"
                  )}
                  style={{ width: `${Math.round((partsProgress.installed / partsProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
          
          {/* Non-compact: controls on separate row */}
          {!isCompact && (
          <div className="flex items-center justify-between gap-1">
            {assignedMember && (
              <div className="flex items-center gap-1 text-gray-400 text-xs">
                <User className="w-3 h-3 text-gray-500" />
                <span>{assignedMember.full_name}</span>
              </div>
            )}
            
            {hasInlineControls && (
              <div className="flex items-center gap-1">{renderInlineControls()}</div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Priority Removal Confirmation */}
      <PriorityRemoveConfirm
        isOpen={showPriorityConfirm}
        onClose={() => setShowPriorityConfirm(false)}
        onConfirm={handleConfirmRemovePriority}
        taskName={task.name}
        isLoading={isUpdatingPriority}
      />

    </div>
  );
}