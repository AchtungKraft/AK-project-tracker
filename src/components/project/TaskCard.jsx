import React, { useState } from "react";
import { User, CheckCircle2, Circle, MessageSquare, CalendarIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

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

export default function TaskCard({ task, teamMembers, categories, statuses, onToggleComplete, onClick, onUpdateDueDate, onUpdateStartDate }) {
  const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);
  const category = categories.find(c => c.id === task.category_id);
  const categoryPath = getCategoryPath(task.category_id, categories);
  const categoryColor = category?.color;
  
  const taskStatus = statuses.find(s => s.id === task.status_id);
  const isCompleted = taskStatus && (
    taskStatus.label.toLowerCase().includes('complete') || 
    taskStatus.label.toLowerCase().includes('done')
  );

  const { data: comments = [] } = useQuery({
    queryKey: ['taskComments', task.id],
    queryFn: () => base44.entities.TaskComment.filter({ task_id: task.id }),
    enabled: !!task.id,
  });

  const hasComments = comments.length > 0 || task.description;
  const [dueDateCalendarOpen, setDueDateCalendarOpen] = useState(false);
  const [startDateCalendarOpen, setStartDateCalendarOpen] = useState(false);

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    if (onToggleComplete) {
      onToggleComplete(task);
    }
  };

  const handleDueDateSelect = (date) => {
    if (onUpdateDueDate) {
      onUpdateDueDate(task, date ? format(date, 'yyyy-MM-dd') : null);
    }
    setDueDateCalendarOpen(false);
  };

  const handleStartDateSelect = (date) => {
    if (onUpdateStartDate) {
      onUpdateStartDate(task, date ? format(date, 'yyyy-MM-dd') : null);
    }
    setStartDateCalendarOpen(false);
  };

  return (
    <div
      className={`bg-gray-800/50 rounded-lg p-2 border ${
        task.is_priority 
          ? 'border-red-500 border-2 shadow-lg shadow-red-500/20' 
          : 'border-gray-700 hover:border-red-700/50'
      } hover:bg-gray-800/70 transition-all cursor-pointer group`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={handleCheckboxClick}
          className="mt-0.5 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
        >
          {isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>
        
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-start gap-1.5 mb-1">
            <h4 className={`text-white font-medium text-sm leading-tight line-clamp-2 group-hover:text-red-400 transition-colors flex-1 ${isCompleted ? 'line-through opacity-60' : ''}`}>
              {task.name}
            </h4>
            {hasComments && (
              <MessageSquare className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
            )}
          </div>
          
          {categoryPath && (
            <div className="flex items-center gap-1 text-xs mb-0.5">
              <span style={{ color: categoryColor || '#9CA3AF' }}>
                {categoryPath}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between gap-1">
            {assignedMember && (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <User className="w-3 h-3 text-gray-500" />
                <span>{assignedMember.full_name}</span>
              </div>
            )}
            
            <div className="flex items-center gap-1">
              {onUpdateStartDate && (
                <Popover open={startDateCalendarOpen} onOpenChange={setStartDateCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={`p-1 rounded hover:bg-gray-700 transition-colors ${
                        task.start_date ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-300'
                      }`}
                      title={task.start_date ? `Start: ${format(new Date(task.start_date), 'MMM d, yyyy')}` : 'Set start date'}
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" onClick={(e) => e.stopPropagation()}>
                    <Calendar
                      mode="single"
                      selected={task.start_date ? new Date(task.start_date) : undefined}
                      onSelect={handleStartDateSelect}
                      defaultMonth={task.start_date ? new Date(task.start_date) : new Date()}
                      modifiers={{
                        startDate: task.start_date ? [new Date(task.start_date)] : []
                      }}
                      modifiersStyles={{
                        startDate: { backgroundColor: '#EAB308', color: 'white', borderRadius: '50%' }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {onUpdateDueDate && (
                <Popover open={dueDateCalendarOpen} onOpenChange={setDueDateCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={`p-1 rounded hover:bg-gray-700 transition-colors ${
                        task.due_date ? 'text-green-400' : 'text-gray-500 hover:text-green-300'
                      }`}
                      title={task.due_date ? `Due: ${format(new Date(task.due_date), 'MMM d, yyyy')}` : 'Set due date'}
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" onClick={(e) => e.stopPropagation()}>
                    <Calendar
                      mode="single"
                      selected={task.due_date ? new Date(task.due_date) : undefined}
                      onSelect={handleDueDateSelect}
                      defaultMonth={task.due_date ? new Date(task.due_date) : new Date()}
                      modifiers={{
                        dueDate: task.due_date ? [new Date(task.due_date)] : []
                      }}
                      modifiersStyles={{
                        dueDate: { backgroundColor: '#22C55E', color: 'white', borderRadius: '50%' }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}