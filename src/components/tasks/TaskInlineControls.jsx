import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Flag, PlayCircle, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/mobile/useIsMobile";

/**
 * TaskInlineControls
 * Reusable inline task editing controls for due date, start date, and priority
 * Used by both PriorityDashboard and ProjectDetail
 */
export default function TaskInlineControls({
  task,
  onUpdateDueDate,
  onUpdateStartDate,
  onTogglePriority,
  showDueDate = true,
  showStartDate = true,
  showPriority = true,
  compact = false,
  disabled = false,
}) {
  const isMobile = useIsMobile();
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(null); // 'due' | 'start' | 'priority'

  const handleDueDateChange = async (date) => {
    if (!onUpdateDueDate) return;
    setIsUpdating('due');
    try {
      await onUpdateDueDate(task, date ? format(date, 'yyyy-MM-dd') : null);
    } finally {
      setIsUpdating(null);
      setDueDateOpen(false);
    }
  };

  const handleStartDateChange = async (date) => {
    if (!onUpdateStartDate) return;
    setIsUpdating('start');
    try {
      await onUpdateStartDate(task, date ? format(date, 'yyyy-MM-dd') : null);
    } finally {
      setIsUpdating(null);
      setStartDateOpen(false);
    }
  };

  const handleTogglePriority = async (e) => {
    e.stopPropagation();
    if (!onTogglePriority) return;
    setIsUpdating('priority');
    try {
      await onTogglePriority(task);
    } finally {
      setIsUpdating(null);
    }
  };

  const buttonSize = compact || isMobile ? 'h-7 w-7' : 'h-8 w-8';
  const iconSize = compact || isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div className={cn(
      "flex items-center gap-1",
      isMobile ? "gap-0.5" : "gap-1"
    )}>
      {/* Due Date */}
      {showDueDate && onUpdateDueDate && (
        <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || isUpdating === 'due'}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                buttonSize,
                "p-0",
                task.due_date ? "text-red-400 hover:text-red-300" : "text-gray-500 hover:text-gray-300"
              )}
              title={task.due_date ? `Due: ${format(parseISO(task.due_date), 'MMM d')}` : 'Set due date'}
            >
              {isUpdating === 'due' ? (
                <Loader2 className={cn(iconSize, "animate-spin")} />
              ) : (
                <CalendarIcon className={iconSize} />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-0 bg-gray-900 border-gray-700" 
            align={isMobile ? "center" : "start"}
            side={isMobile ? "top" : "bottom"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-gray-700">
              <p className="text-xs text-gray-400">Due Date</p>
              {task.due_date && (
                <p className="text-sm text-white">{format(parseISO(task.due_date), 'MMM d, yyyy')}</p>
              )}
            </div>
            <Calendar
              mode="single"
              selected={task.due_date ? parseISO(task.due_date) : undefined}
              onSelect={handleDueDateChange}
              className="bg-gray-900"
            />
            {task.due_date && (
              <div className="p-2 border-t border-gray-700">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDueDateChange(null)}
                  className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  Clear Due Date
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Start Date */}
      {showStartDate && onUpdateStartDate && (
        <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || isUpdating === 'start'}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                buttonSize,
                "p-0",
                task.start_date ? "text-blue-400 hover:text-blue-300" : "text-gray-500 hover:text-gray-300"
              )}
              title={task.start_date ? `Start: ${format(parseISO(task.start_date), 'MMM d')}` : 'Set start date'}
            >
              {isUpdating === 'start' ? (
                <Loader2 className={cn(iconSize, "animate-spin")} />
              ) : (
                <PlayCircle className={iconSize} />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-0 bg-gray-900 border-gray-700" 
            align={isMobile ? "center" : "start"}
            side={isMobile ? "top" : "bottom"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-gray-700">
              <p className="text-xs text-gray-400">Start Date</p>
              {task.start_date && (
                <p className="text-sm text-white">{format(parseISO(task.start_date), 'MMM d, yyyy')}</p>
              )}
            </div>
            <Calendar
              mode="single"
              selected={task.start_date ? parseISO(task.start_date) : undefined}
              onSelect={handleStartDateChange}
              className="bg-gray-900"
            />
            {task.start_date && (
              <div className="p-2 border-t border-gray-700">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartDateChange(null)}
                  className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  Clear Start Date
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Priority Toggle */}
      {showPriority && onTogglePriority && (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || isUpdating === 'priority'}
          onClick={handleTogglePriority}
          className={cn(
            buttonSize,
            "p-0",
            task.is_priority ? "text-orange-400 hover:text-orange-300" : "text-gray-500 hover:text-orange-400"
          )}
          title={task.is_priority ? 'Remove from priority' : 'Mark as priority'}
        >
          {isUpdating === 'priority' ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : (
            <Flag className={cn(iconSize, task.is_priority && "fill-current")} />
          )}
        </Button>
      )}
    </div>
  );
}