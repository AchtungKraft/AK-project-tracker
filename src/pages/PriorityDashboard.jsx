import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, Loader2, FolderKanban, RefreshCw } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import TaskCard from "../components/project/TaskCard";
import TaskDetailDrawer from "../components/tasks/TaskDetailDrawer";

export default function PriorityDashboard() {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState(null);
  const [primaryGroupBy, setPrimaryGroupBy] = useState('project');
  const [secondaryGroupBy, setSecondaryGroupBy] = useState('status');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['priorityTasks'],
    queryFn: () => base44.entities.Task.filter({ is_priority: true }),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priorityTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  // Filter out completed tasks
  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
  const completedStatus = taskStatuses.find(s => {
    const label = s.label.toLowerCase();
    return label.includes('complete') || label.includes('done');
  });
  const activePriorityTasks = allTasks.filter(t => {
    if (t.status_id === completedStatus?.id) return false;
    if (assignedToFilter !== 'all' && t.assigned_team_member_id !== assignedToFilter) return false;
    return true;
  });

  // Group tasks by primary grouping, then sub-group by secondary grouping
  const groupedTasks = useMemo(() => {
    const primaryGroups = {};

    activePriorityTasks.forEach(task => {
      let primaryKey, primaryLabel, primaryColor;

      if (primaryGroupBy === 'project') {
        const project = projects.find(p => p.id === task.project_id);
        primaryKey = task.project_id;
        primaryLabel = project?.name || 'No Project';
        primaryColor = '#EF4444';
      } else if (primaryGroupBy === 'category') {
        const category = categories.find(c => c.id === task.category_id);
        primaryKey = task.category_id || 'no-category';
        primaryLabel = category?.name || 'No Category';
        primaryColor = category?.color || '#6B7280';
      }

      if (!primaryGroups[primaryKey]) {
        primaryGroups[primaryKey] = {
          id: primaryKey,
          label: primaryLabel,
          color: primaryColor,
          tasks: [],
          secondaryGroups: {},
        };
      }
      primaryGroups[primaryKey].tasks.push(task);
    });

    // Sub-group tasks within each primary group
    Object.values(primaryGroups).forEach(primaryGroup => {
      const secondaryGroups = {};

      primaryGroup.tasks.forEach(task => {
        let secondaryKey, secondaryLabel, secondaryColor;

        if (secondaryGroupBy === 'status') {
          const status = statuses.find(s => s.id === task.status_id);
          secondaryKey = task.status_id || 'no-status';
          secondaryLabel = status?.label || 'No Status';
          secondaryColor = status?.color || '#6B7280';
        } else if (secondaryGroupBy === 'assigned') {
          const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
          secondaryKey = task.assigned_team_member_id || 'unassigned';
          secondaryLabel = member?.full_name || 'Unassigned';
          secondaryColor = '#6B7280';
        } else if (secondaryGroupBy === 'category') {
          const category = categories.find(c => c.id === task.category_id);
          secondaryKey = task.category_id || 'no-category';
          secondaryLabel = category?.name || 'No Category';
          secondaryColor = category?.color || '#6B7280';
        } else if (secondaryGroupBy === 'project') {
          const project = projects.find(p => p.id === task.project_id);
          secondaryKey = task.project_id;
          secondaryLabel = project?.name || 'No Project';
          secondaryColor = '#6B7280';
        }

        if (!secondaryGroups[secondaryKey]) {
          secondaryGroups[secondaryKey] = { label: secondaryLabel, color: secondaryColor, tasks: [] };
        }
        secondaryGroups[secondaryKey].tasks.push(task);
      });

      primaryGroup.secondaryGroups = secondaryGroups;
    });

    return primaryGroups;
  }, [activePriorityTasks, primaryGroupBy, secondaryGroupBy, projects, categories, statuses, teamMembers]);

  const handleToggleComplete = async (task) => {
    const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
    const completedStatus = taskStatuses.find(s => {
      const label = s.label.toLowerCase();
      return label.includes('complete') || label.includes('done');
    });

    const isCurrentlyComplete = task.status_id === completedStatus?.id;
    
    if (isCurrentlyComplete) {
      // Reopen task - set to first non-complete status
      const firstStatus = taskStatuses.find(s => s.id !== completedStatus?.id);
      if (firstStatus) {
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: {
            status_id: firstStatus.id,
            completed_date: null,
          }
        });
        toast.success('Task reopened');
      }
    } else {
      // Complete task
      if (completedStatus) {
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: {
            status_id: completedStatus.id,
            completed_date: new Date().toISOString(),
          }
        });
        toast.success('Task completed');
      }
    }
  };

  if (tasksLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 bg-red-600/20 rounded-lg border-2 border-red-600">
                <Flame className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">PRIORITY DASHBOARD</h1>
                <p className="text-sm text-gray-400">
                  {activePriorityTasks.length} high-priority {activePriorityTasks.length === 1 ? 'task' : 'tasks'} across {Object.keys(groupedTasks).length} {primaryGroupBy === 'project' ? (Object.keys(groupedTasks).length === 1 ? 'project' : 'projects') : (Object.keys(groupedTasks).length === 1 ? 'category' : 'categories')}
                </p>
              </div>
            </div>
            <Button
              onClick={async () => {
                setIsRefreshing(true);
                await queryClient.invalidateQueries();
                setIsRefreshing(false);
              }}
              variant="outline"
              size="sm"
              className="border-gray-700 text-white gap-2"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          {/* Filters */}
          {allTasks.length > 0 && (
            <div className="flex justify-end gap-3 flex-wrap">
              <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="Filter by Assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Team Members</SelectItem>
                  {teamMembers.filter(tm => tm.active).map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={primaryGroupBy} onValueChange={setPrimaryGroupBy}>
                <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="Primary Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Group by Project</SelectItem>
                  <SelectItem value="category">Group by Category</SelectItem>
                </SelectContent>
              </Select>
              <Select value={secondaryGroupBy} onValueChange={setSecondaryGroupBy}>
                <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="Secondary Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Then by Status</SelectItem>
                  <SelectItem value="assigned">Then by Assigned</SelectItem>
                  {primaryGroupBy !== 'category' && <SelectItem value="category">Then by Category</SelectItem>}
                  {primaryGroupBy !== 'project' && <SelectItem value="project">Then by Project</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Priority Tasks Grouped */}
          {activePriorityTasks.length === 0 ? (
            <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
              <CardContent className="p-8 md:p-12 text-center">
                <div className="flex items-center justify-center w-16 h-16 bg-red-600/10 rounded-full border-2 border-red-600/30 mx-auto mb-4">
                  <Flame className="w-8 h-8 text-red-500/50" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No Priority Tasks</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Drag tasks into the PRIORITY bucket on project boards to focus on what matters most.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTasks).map(([primaryKey, primaryGroup]) => {
                const { tasks, secondaryGroups } = primaryGroup;
                const project = primaryGroupBy === 'project' ? projects.find(p => p.id === primaryKey) : null;

                return (
                  <Card 
                    key={primaryKey} 
                    className="bg-black/40 backdrop-blur-xl border-2 shadow-lg"
                    style={{ 
                      borderColor: `${primaryGroup.color}80`,
                      boxShadow: `0 10px 15px -3px ${primaryGroup.color}20`
                    }}
                  >
                    <CardHeader 
                      className="border-b p-4"
                      style={{ borderBottomColor: `${primaryGroup.color}50` }}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          {primaryGroupBy === 'project' && <FolderKanban className="w-5 h-5" style={{ color: primaryGroup.color }} />}
                          <div>
                            {primaryGroupBy === 'project' && project ? (
                              <Link 
                                to={createPageUrl("ProjectDetail") + "?id=" + project.id}
                                className="hover:opacity-80 transition-opacity"
                              >
                                <CardTitle className="text-lg hover:underline" style={{ color: primaryGroup.color }}>{primaryGroup.label}</CardTitle>
                              </Link>
                            ) : (
                              <CardTitle className="text-lg" style={{ color: primaryGroup.color }}>{primaryGroup.label}</CardTitle>
                            )}
                            {primaryGroupBy === 'project' && project?.client_name && (
                              <p className="text-sm text-gray-400">{project.client_name}</p>
                            )}
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          style={{ borderColor: primaryGroup.color, color: primaryGroup.color, backgroundColor: `${primaryGroup.color}15` }}
                        >
                          {tasks.length} priority {tasks.length === 1 ? 'task' : 'tasks'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(secondaryGroups).map(([secondaryKey, secondaryGroup]) => (
                          <div key={secondaryKey} className="col-span-1">
                            <div 
                              className="bg-black/40 rounded-lg border-2 overflow-hidden"
                              style={{ borderColor: secondaryGroup.color }}
                            >
                              <div 
                                className="p-3 border-b-2"
                                style={{ 
                                  borderBottomColor: secondaryGroup.color,
                                  backgroundColor: `${secondaryGroup.color}15`
                                }}
                              >
                                <h3 
                                  className="font-semibold text-sm"
                                  style={{ color: secondaryGroup.color }}
                                >
                                  {secondaryGroup.label}
                                </h3>
                                <span className="text-xs text-gray-400">
                                  {secondaryGroup.tasks.length} {secondaryGroup.tasks.length === 1 ? 'task' : 'tasks'}
                                </span>
                              </div>
                              <div className="p-3 space-y-2">
                                {secondaryGroup.tasks.map(task => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    categories={categories}
                                    teamMembers={teamMembers}
                                    statuses={statuses}
                                    onToggleComplete={handleToggleComplete}
                                    onClick={() => setSelectedTask(task)}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}