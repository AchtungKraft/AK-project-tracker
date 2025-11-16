import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Calendar, User, FolderKanban } from "lucide-react";
import { format } from "date-fns";

export default function TasksGrid({ 
  tasks, 
  projects,
  categories,
  selectedNodeId,
  onTaskClick,
}) {
  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const taskStatuses = statuses.filter(s => s.scope === 'Task');

  const getCategoryPath = (categoryId) => {
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

  return (
    <div className="h-full">
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <ListChecks className="w-16 h-16 text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">
            {selectedNodeId ? 'No tasks in this selection' : 'No tasks found'}
          </h3>
          <p className="text-sm text-gray-600">
            {selectedNodeId ? 'This selection is empty' : 'Add tasks to get started'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {tasks.map(task => {
            const project = projects.find(p => p.id === task.project_id);
            const status = taskStatuses.find(s => s.id === task.status_id);
            const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);
            const categoryPath = getCategoryPath(task.category_id);
            const category = categories.find(c => c.id === task.category_id);
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && status?.label !== 'Completed';

            return (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group"
              >
                {/* Header */}
                <div className="p-3 border-b border-gray-800">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-white text-sm font-semibold line-clamp-2 flex-1 group-hover:text-red-400 transition-colors">
                      {task.name}
                    </h4>
                    {status && (
                      <Badge 
                        style={{ backgroundColor: status.color }}
                        className="text-white text-xs shrink-0"
                      >
                        {status.label}
                      </Badge>
                    )}
                  </div>

                  {task.is_priority && (
                    <Badge variant="outline" className="border-red-500 text-red-400 text-xs">
                      Priority
                    </Badge>
                  )}
                </div>

                {/* Content */}
                <div className="p-3 space-y-2">
                  {task.description && (
                    <p className="text-xs text-gray-400 line-clamp-2">
                      {task.description}
                    </p>
                  )}

                  {project && (
                    <div className="flex items-center gap-2 text-xs text-blue-400">
                      <FolderKanban className="w-3 h-3" />
                      <span className="truncate">{project.name}</span>
                    </div>
                  )}

                  {categoryPath && (
                    <div className="text-xs" style={{ color: category?.color || '#9CA3AF' }}>
                      {categoryPath}
                    </div>
                  )}

                  {assignedMember && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <User className="w-3 h-3" />
                      <span className="truncate">{assignedMember.full_name}</span>
                    </div>
                  )}

                  {task.due_date && (
                    <div className={`flex items-center gap-2 text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-gray-400'}`}>
                      <Calendar className="w-3 h-3" />
                      {format(new Date(task.due_date), 'MMM d, yyyy')}
                      {isOverdue && <span className="text-xs">(Overdue)</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}