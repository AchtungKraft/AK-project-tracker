import React, { useState, useEffect, useMemo } from "react";
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

export default function MyPriorities() {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState(null);
  const [groupBy, setGroupBy] = useState('category');
  const [currentUser, setCurrentUser] = useState(null);
  const [currentTeamMember, setCurrentTeamMember] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get current user and team member
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
        
        const teamMembers = await base44.entities.TeamMember.list();
        const userTeamMember = teamMembers.find(tm => tm.user_id === user.id);
        
        // Check if Achtung Kraft member is viewing as a company
        const viewAsCompany = localStorage.getItem('achtung_view_as_company');
        
        if (userTeamMember?.is_achtung_kraft_member && viewAsCompany) {
          const virtualMember = {
            ...userTeamMember,
            company: viewAsCompany,
            is_achtung_kraft_member: false
          };
          setCurrentTeamMember(virtualMember);
        } else {
          setCurrentTeamMember(userTeamMember);
        }
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    };
    fetchUser();
  }, []);

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['priorityTasks'],
    queryFn: () => base44.entities.Task.filter({ is_priority: true }),
    enabled: !!currentTeamMember,
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priorityTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const { data: allProjects = [] } = useQuery({
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

  // Filter projects to only those where currentTeamMember is assigned
  const projects = useMemo(() => {
    if (!currentTeamMember) {
      return [];
    }

    // If user is Achtung Kraft member (not viewing as company), show all projects
    if (currentTeamMember.is_achtung_kraft_member) {
      return allProjects;
    }

    // If user has no company assigned, show all projects
    if (!currentTeamMember.company) {
      return allProjects;
    }

    const filteredProjects = allProjects.filter(project => {
      let assignedTeam = project.assigned_team;
      if (typeof assignedTeam === 'string') {
        try {
          assignedTeam = JSON.parse(assignedTeam);
        } catch (e) {
          assignedTeam = [];
        }
      }
      assignedTeam = Array.isArray(assignedTeam) ? assignedTeam : [];
      
      // If project has no team assigned, show it (fallback for unassigned projects)
      if (assignedTeam.length === 0) {
        return true;
      }
      
      // Find team members
      const projectTeamMembers = assignedTeam
        .map(tmId => teamMembers.find(tm => tm.id === tmId))
        .filter(Boolean);

      // Check company match
      const hasCompanyTeamMember = projectTeamMembers.some(tm => {
        return tm.company && tm.company === currentTeamMember.company;
      });
      
      // Check client match
      const isClientCompany = project.client_name === currentTeamMember.company;
      
      return hasCompanyTeamMember || isClientCompany;
    });

    return filteredProjects;
  }, [allProjects, currentTeamMember, teamMembers]);

  // Filter out completed tasks and only include tasks from user's projects
  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
  const completedStatus = taskStatuses.find(s => {
    const label = s.label.toLowerCase();
    return label.includes('complete') || label.includes('done');
  });
  
  const projectIds = new Set(projects.map(p => p.id));
  const activePriorityTasks = allTasks.filter(t => {
    return projectIds.has(t.project_id) && t.status_id !== completedStatus?.id;
  });

  // Group tasks by project, then sub-group by selected filter
  const tasksByProject = useMemo(() => {
    const grouped = {};
    
    activePriorityTasks.forEach(task => {
      const projectId = task.project_id;
      if (!grouped[projectId]) {
        grouped[projectId] = { tasks: [], groups: {} };
      }
      grouped[projectId].tasks.push(task);
    });
    
    // Sub-group tasks within each project
    Object.keys(grouped).forEach(projectId => {
      const projectTasks = grouped[projectId].tasks;
      const groups = {};
      
      projectTasks.forEach(task => {
        let groupKey, groupLabel, groupColor;
        
        if (groupBy === 'status') {
          const status = statuses.find(s => s.id === task.status_id);
          groupKey = task.status_id || 'no-status';
          groupLabel = status?.label || 'No Status';
          groupColor = status?.color || '#6B7280';
        } else if (groupBy === 'assigned') {
          const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
          groupKey = task.assigned_team_member_id || 'unassigned';
          groupLabel = member?.full_name || 'Unassigned';
          groupColor = '#6B7280';
        } else if (groupBy === 'category') {
          const category = categories.find(c => c.id === task.category_id);
          groupKey = task.category_id || 'no-category';
          groupLabel = category?.name || 'No Category';
          groupColor = category?.color || '#6B7280';
        }
        
        if (!groups[groupKey]) {
          groups[groupKey] = {
            label: groupLabel,
            color: groupColor,
            tasks: []
          };
        }
        
        groups[groupKey].tasks.push(task);
      });
      
      grouped[projectId].groups = groups;
    });
    
    return grouped;
  }, [activePriorityTasks, groupBy, statuses, teamMembers, categories]);

  const handleToggleComplete = async (task) => {
    const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
    const completedStatus = taskStatuses.find(s => {
      const label = s.label.toLowerCase();
      return label.includes('complete') || label.includes('done');
    });

    const isCurrentlyComplete = task.status_id === completedStatus?.id;
    
    if (isCurrentlyComplete) {
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

  if (!currentTeamMember || tasksLoading) {
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
                <h1 className="text-2xl md:text-3xl font-bold text-white">MY PRIORITIES</h1>
                <p className="text-sm text-gray-400">
                  {activePriorityTasks.length} high-priority {activePriorityTasks.length === 1 ? 'task' : 'tasks'} across {Object.keys(tasksByProject).length} {Object.keys(tasksByProject).length === 1 ? 'project' : 'projects'}
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

          {/* Group By Filter */}
          {activePriorityTasks.length > 0 && (
            <div className="flex justify-end">
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Group by Status</SelectItem>
                  <SelectItem value="assigned">Group by Assigned</SelectItem>
                  <SelectItem value="category">Group by Category</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Priority Tasks by Project */}
          {activePriorityTasks.length === 0 ? (
            <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
              <CardContent className="p-8 md:p-12 text-center">
                <div className="flex items-center justify-center w-16 h-16 bg-red-600/10 rounded-full border-2 border-red-600/30 mx-auto mb-4">
                  <Flame className="w-8 h-8 text-red-500/50" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No Priority Tasks</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  No priority tasks found in your assigned projects. Drag tasks into the PRIORITY bucket on project boards to focus on what matters most.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(tasksByProject).map(([projectId, projectData]) => {
                const project = projects.find(p => p.id === projectId);
                if (!project) return null;
                
                const { tasks, groups } = projectData;

                return (
                  <Card key={projectId} className="bg-black/40 backdrop-blur-xl border-2 border-red-600/50 shadow-lg shadow-red-600/10">
                    <CardHeader className="border-b border-red-900/30 p-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <FolderKanban className="w-5 h-5 text-red-400" />
                          <div>
                            <Link 
                              to={createPageUrl("ProjectDetail") + "?id=" + project.id}
                              className="hover:text-red-400 transition-colors"
                            >
                              <CardTitle className="text-white text-lg hover:underline">{project.name}</CardTitle>
                            </Link>
                            {project.client_name && (
                              <p className="text-sm text-gray-400">{project.client_name}</p>
                            )}
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className="border-red-600 text-red-400 bg-red-600/10"
                        >
                          {tasks.length} priority {tasks.length === 1 ? 'task' : 'tasks'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(groups).map(([groupKey, groupData]) => (
                          <div key={groupKey} className="col-span-1">
                            <div 
                              className="bg-black/40 rounded-lg border-2 overflow-hidden"
                              style={{ borderColor: groupData.color }}
                            >
                              <div 
                                className="p-3 border-b-2"
                                style={{ 
                                  borderBottomColor: groupData.color,
                                  backgroundColor: `${groupData.color}15`
                                }}
                              >
                                <h3 
                                  className="font-semibold text-sm"
                                  style={{ color: groupData.color }}
                                >
                                  {groupData.label}
                                </h3>
                                <span className="text-xs text-gray-400">
                                  {groupData.tasks.length} {groupData.tasks.length === 1 ? 'task' : 'tasks'}
                                </span>
                              </div>
                              <div className="p-3 space-y-2">
                                {groupData.tasks.map(task => (
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