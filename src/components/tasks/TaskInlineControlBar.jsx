import React, { useState } from 'react';
import { Flag, PlayCircle, CalendarIcon, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/components/mobile/useIsMobile';

/**
 * TaskInlineControlBar - Standard inline controls for task cards
 * 
 * ENFORCEMENT RULE: TaskCard must NOT contain inline control logic.
 * It must only render: <TaskInlineControlBar task={task} {...handlers} />
 * 
 * Responsibilities:
 * - Priority toggle
 * - Start date picker
 * - Due date picker
 */
export default function TaskInlineControlBar({
  task,
  onTogglePriority,
  onUpdateStartDate,
  onUpdateDueDate,
  compact = false,
}) {
  const isMobile = useIsMobile();
  const isCompact = compact || isMobile;
  
  const [dueDateCalendarOpen, setDueDateCalendarOpen] = useState(false);
  const [startDateCalendarOpen, setStartDateCalendarOpen] = useState(false);
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false);
  const [isUpdatingDueDate, setIsUpdatingDueDate] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);

  const hasAnyControl = onTogglePriority || onUpdateStartDate || onUpdateDueDate;
  
  if (!hasAnyControl) return null;

  const handleTogglePriority = async (e) => {
    e.stopPropagation();
    if (!onTogglePriority) return;
    
    setIsUpdatingPriority(true);
    try {
      await onTogglePriority(task);
    } finally {
      setIsUpdatingPriority(false);
    }
  };

  const handleStartDateSelect = async (date) => {
    if (!onUpdateStartDate) return;
    
    setIsUpdatingStartDate(true);
    try {
      await onUpdateStartDate(task, date ? format(date, 'yyyy-MM-dd') : null);
    } finally {
      setIsUpdatingStartDate(false);
      setStartDateCalendarOpen(false);
    }
  };

  const handleDueDateSelect = async (date) => {
    if (!onUpdateDueDate) return;
    
    setIsUpdatingDueDate(true);
    try {
      await onUpdateDueDate(task, date ? format(date, 'yyyy-MM-dd') : null);
    } finally {
      setIsUpdatingDueDate(false);
      setDueDateCalendarOpen(false);
    }
  };

  return (
    <div className={cn("flex items-center", isCompact ? "gap-0" : "gap-1")}>
      {/* Priority Toggle */}
      {onTogglePriority && (
        <button
          onClick={handleTogglePriority}
          disabled={isUpdatingPriority}
          className={cn(
            "rounded hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center",
            task.is_priority ? 'text-orange-500' : 'text-gray-500 hover:text-orange-400',
            isCompact ? "p-0.5" : "p-1"
          )}
          title={task.is_priority ? 'Remove from priority' : 'Mark as priority'}
          aria-label={task.is_priority ? 'Remove from priority' : 'Mark as priority'}
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
                "rounded hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center",
                task.start_date ? 'text-blue-400' : 'text-gray-500 hover:text-blue-300',
                isCompact ? "p-0.5" : "p-1"
              )}
              title={task.start_date ? `Start: ${format(new Date(task.start_date), 'MMM d, yyyy')}` : 'Set start date'}
              aria-label={task.start_date ? `Start date: ${format(new Date(task.start_date), 'MMM d, yyyy')}` : 'Set start date'}
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
                  className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20 min-h-[44px]"
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
                "rounded hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center",
                task.due_date ? 'text-red-400' : 'text-gray-500 hover:text-red-300',
                isCompact ? "p-0.5" : "p-1"
              )}
              title={task.due_date ? `Due: ${format(new Date(task.due_date), 'MMM d, yyyy')}` : 'Set due date'}
              aria-label={task.due_date ? `Due date: ${format(new Date(task.due_date), 'MMM d, yyyy')}` : 'Set due date'}
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
                  className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20 min-h-[44px]"
                >
                  Clear Due Date
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}