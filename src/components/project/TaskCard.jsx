import React, { useState } from "react";
import { User, CheckCircle2, Circle, MessageSquare, CalendarIcon, AlertCircle, PlayCircle, Flag, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { Button } from "@/components/ui/button";
import PriorityRemoveConfirm from "@/components/tasks/PriorityRemoveConfirm";

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

export default function TaskCard({ task, teamMembers = [], categories = [], statuses = [], onToggleComplete, onClick, onUpdateDueDate, onUpdateStartDate, onTogglePriority, commentCount = 0, compact = false, showInlineControls = true }) {
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

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    if (onToggleComplete) {
      onToggleComplete(task);
    }
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

  return (
    <div
      className={cn(
        "bg-gray-800/50 rounded-lg border hover:bg-gray-800/70 transition-all cursor-pointer group",
        task.is_priority 
          ? 'border-red-500 border-2 shadow-lg shadow-red-500/20' 
          : 'border-gray-700 hover:border-red-700/50',
        isCompact ? "p-1.5" : "p-2"
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
          <div className={cn("flex items-start gap-1.5", isCompact ? "mb-0.5" : "mb-1")}>
            <h4 className={cn(
              "text-white font-medium leading-tight group-hover:text-red-400 transition-colors flex-1",
              isCompact ? "text-xs line-clamp-1" : "text-sm line-clamp-2",
              isCompleted && "line-through opacity-60"
            )}>
              {task.name}
            </h4>
            {hasComments && (
              <MessageSquare className={cn("text-blue-400 flex-shrink-0 mt-0.5", isCompact ? "w-3 h-3" : "w-3.5 h-3.5")} />
            )}
          </div>
          
          {categoryPath && !isCompact && (
            <div className="flex items-center gap-1 text-xs mb-0.5">
              <span style={{ color: categoryColor || '#9CA3AF' }}>
                {categoryPath}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between gap-1">
            {assignedMember && (
              <div className={cn("flex items-center gap-1 text-gray-400", isCompact ? "text-[10px]" : "text-xs")}>
                <User className={isCompact ? "w-2.5 h-2.5 text-gray-500" : "w-3 h-3 text-gray-500"} />
                <span className={isCompact ? "truncate max-w-16" : ""}>{assignedMember.full_name}</span>
              </div>
            )}
            
            {/* Inline Edit Controls - ALWAYS render when handlers provided */}
            {hasInlineControls && (
              <div className={cn("flex items-center", isCompact ? "gap-0" : "gap-1")}>
                {/* Priority Toggle */}
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
                
                {/* Start Date */}
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
                    <PopoverContent 
                      className="w-auto p-0 bg-gray-900 border-gray-700" 
                      onClick={(e) => e.stopPropagation()}
                      side={isMobile ? "top" : "bottom"}
                      align={isMobile ? "center" : "start"}
                    >
                      <div className="p-2 border-b border-gray-700">
                        <p className="text-xs text-gray-400">Start Date</p>
                        {task.start_date && (
                          <p className="text-sm text-white">{format(new Date(task.start_date), 'MMM d, yyyy')}</p>
                        )}
                      </div>
                      <Calendar
                        mode="single"
                        selected={task.start_date ? new Date(task.start_date) : undefined}
                        onSelect={handleStartDateSelect}
                        defaultMonth={task.start_date ? new Date(task.start_date) : new Date()}
                        className="bg-gray-900"
                      />
                      {task.start_date && (
                        <div className="p-2 border-t border-gray-700">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartDateSelect(null)}
                            className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            Clear Start Date
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
                
                {/* Due Date */}
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
                    <PopoverContent 
                      className="w-auto p-0 bg-gray-900 border-gray-700" 
                      onClick={(e) => e.stopPropagation()}
                      side={isMobile ? "top" : "bottom"}
                      align={isMobile ? "center" : "start"}
                    >
                      <div className="p-2 border-b border-gray-700">
                        <p className="text-xs text-gray-400">Due Date</p>
                        {task.due_date && (
                          <p className="text-sm text-white">{format(new Date(task.due_date), 'MMM d, yyyy')}</p>
                        )}
                      </div>
                      <Calendar
                        mode="single"
                        selected={task.due_date ? new Date(task.due_date) : undefined}
                        onSelect={handleDueDateSelect}
                        defaultMonth={task.due_date ? new Date(task.due_date) : new Date()}
                        className="bg-gray-900"
                      />
                      {task.due_date && (
                        <div className="p-2 border-t border-gray-700">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDueDateSelect(null)}
                            className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            Clear Due Date
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}
          </div>
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