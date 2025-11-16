import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Calendar, User, FolderKanban, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function TasksListView({ 
  tasks, 
  projects,
  categories,
  selectedNodeId,
  onTaskClick,
  showGrouping
}) {
  const [expandedGroups, setExpandedGroups] = useState({});

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

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Group tasks hierarchically
  const buildHierarchicalGroups = () => {
    if (!showGrouping) {
      return [{ label: 'All Tasks', tasks, color: '#6B7280', children: [] }];
    }

    const groups = [];

    // Group by project
    const projectGroups = new Map();
    const noProjectTasks = [];

    tasks.forEach(task => {
      if (task.project_id) {
        if (!projectGroups.has(task.project_id)) {
          projectGroups.set(task.project_id, []);
        }
        projectGroups.get(task.project_id).push(task);
      } else {
        noProjectTasks.push(task);
      }
    });

    // Add no-project group
    if (noProjectTasks.length > 0) {
      groups.push({
        label: 'No Project',
        tasks: noProjectTasks,
        color: '#6B7280',
        children: []
      });
    }

    // Add project groups
    projectGroups.forEach((projectTasks, projectId) => {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        groups.push({
          label: project.name,
          tasks: projectTasks,
          color: '#3B82F6',
          children: []
        });
      }
    });

    return groups;
  };

  const hierarchicalGroups = buildHierarchicalGroups();

  const TaskRow = ({ task }) => {
    const project = projects.find(p => p.id === task.project_id);
    const status = taskStatuses.find(s => s.id === task.status_id);
    const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);
    const categoryPath = getCategoryPath(task.category_id);
    const category = categories.find(c => c.id === task.category_id);
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && status?.label !== 'Completed';

    return (
      <div
        onClick={() => onTaskClick(task)}
        className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group"
      >
        {/* Task Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <h4 className="text-white text-sm font-medium truncate flex-1 group-hover:text-red-400 transition-colors">
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
          
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            {task.description && (
              <span className="truncate max-w-xs">{task.description}</span>
            )}
            {project && (
              <span className="flex items-center gap-1 text-blue-400">
                <FolderKanban className="w-3 h-3" />
                {project.name}
              </span>
            )}
            {categoryPath && (
              <span style={{ color: category?.color || '#9CA3AF' }}>
                {categoryPath}
              </span>
            )}
            {assignedMember && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {assignedMember.full_name}
              </span>
            )}
          </div>
        </div>

        {/* Due Date */}
        {task.due_date && (
          <div className={cn(
            "flex items-center gap-2 text-xs shrink-0",
            isOverdue ? "text-red-400 font-medium" : "text-gray-400"
          )}>
            <Calendar className="w-3 h-3" />
            {format(new Date(task.due_date), 'MMM d')}
          </div>
        )}

        {/* Priority Badge */}
        {task.is_priority && (
          <Badge variant="outline" className="border-red-500 text-red-400 text-xs shrink-0">
            Priority
          </Badge>
        )}
      </div>
    );
  };

  const renderGroup = (group, level = 0) => {
    const groupKey = `${level}-${group.label}`;
    const isExpanded = expandedGroups[groupKey] !== false;
    const totalTasks = group.tasks.length;

    return (
      <div key={groupKey} className={level > 0 ? 'ml-4' : ''}>
        {showGrouping && (
          <button
            onClick={() => toggleGroup(groupKey)}
            className="flex items-center gap-2 w-full p-2 mb-2 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/30 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
            <div 
              className="w-3 h-3 rounded"
              style={{ backgroundColor: group.color }}
            />
            <span className="text-sm font-medium text-white flex-1 text-left">
              {group.label}
            </span>
            <span className="text-xs text-gray-400">
              {totalTasks} task{totalTasks !== 1 ? 's' : ''}
            </span>
          </button>
        )}

        {isExpanded && (
          <div className="space-y-2 mb-3">
            {group.tasks.map(task => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {hierarchicalGroups.map(group => renderGroup(group))}
    </div>
  );
}