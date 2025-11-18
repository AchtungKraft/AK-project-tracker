import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, CheckCircle2, Circle, User, Tag } from "lucide-react";
import TaskDetailDrawer from "../components/tasks/TaskDetailDrawer";

export default function MyPriorities() {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [groupBy, setGroupBy] = useState('status');
  const [currentUser, setCurrentUser] = useState(null);
  const [currentTeamMember, setCurrentTeamMember] = useState(null);

  // Get current user and team member
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
        
        // Find team member associated with this user
        const teamMembers = await base44.entities.TeamMember.list();
        const userTeamMember = teamMembers.find(tm => tm.user_id === user.id);
        
        // Check if Achtung Kraft member is viewing as a company
        const viewAsCompany = localStorage.getItem('achtung_view_as_company');
        if (userTeamMember?.is_achtung_kraft_member && viewAsCompany) {
          // Create a virtual team member with the selected company
          setCurrentTeamMember({
            ...userTeamMember,
            company: viewAsCompany,
            is_achtung_kraft_member: false // Temporarily disable full access
          });
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
    queryFn: () => base44.entities.Task.filter({ is_priority: true }, '-created_date'),
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

  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const taskStatuses = statuses.filter(s => s.scope === 'Task');
  const completedStatuses = taskStatuses.filter(s => 
    s.label.toLowerCase().includes('complete') || s.label.toLowerCase().includes('done')
  );
  const completedStatusIds = completedStatuses.map(s => s.id);

  // Filter projects based on user's company and team assignments
  const projects = allProjects.filter(project => {
    if (!currentTeamMember) return false;

    // If user is Achtung Kraft member, show all projects
    if (currentTeamMember.is_achtung_kraft_member) {
      return true;
    }

    // Otherwise, show only projects where ANY assigned team member has the same company
    if (!project.assigned_team || project.assigned_team.length === 0) {
      return false;
    }

    const projectTeamMembers = project.assigned_team
      .map(tmId => teamMembers.find(tm => tm.id === tmId))
      .filter(Boolean);

    return projectTeamMembers.some(tm => tm.company === currentTeamMember.company);
  });

  const projectIds = new Set(projects.map(p => p.id));

  // Filter tasks to only those in allowed projects and not completed
  const tasks = allTasks.filter(task => {
    if (!projectIds.has(task.project_id)) return false;
    if (completedStatusIds.includes(task.status_id)) return false;
    return true;
  });

  // Group tasks by project and then by selected criteria
  const groupedByProject = {};
  tasks.forEach(task => {
    const project = projects.find(p => p.id === task.project_id);
    if (!project) return;

    if (!groupedByProject[project.id]) {
      groupedByProject[project.id] = {
        project,
        subGroups: {}
      };
    }

    let subGroupKey = 'Ungrouped';
    if (groupBy === 'status') {
      const status = statuses.find(s => s.id === task.status_id);
      subGroupKey = status?.label || 'No Status';
    } else if (groupBy === 'assigned') {
      const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
      subGroupKey = member?.full_name || 'Unassigned';
    } else if (groupBy === 'category') {
      const category = categories.find(c => c.id === task.category_id);
      subGroupKey = category?.name || 'No Category';
    }

    if (!groupedByProject[project.id].subGroups[subGroupKey]) {
      groupedByProject[project.id].subGroups[subGroupKey] = [];
    }
    groupedByProject[project.id].subGroups[subGroupKey].push(task);
  });

  const handleToggleComplete = (task) => {
    const isCompleted = completedStatusIds.includes(task.status_id);
    
    if (isCompleted) {
      const firstNonCompletedStatus = taskStatuses.find(s => !completedStatusIds.includes(s.id));
      updateTaskMutation.mutate({
        id: task.id,
        data: {
          ...task,
          status_id: firstNonCompletedStatus?.id || task.status_id,
          completed_date: null
        }
      });
    } else {
      const firstCompletedStatus = completedStatuses[0];
      updateTaskMutation.mutate({
        id: task.id,
        data: {
          ...task,
          status_id: firstCompletedStatus?.id || task.status_id,
          completed_date: new Date().toISOString()
        }
      });
    }
  };

  if (!currentTeamMember || teamMembersLoading || tasksLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg p-8 text-center">
            <p className="text-gray-500 text-lg">Loading priorities...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="w-8 h-8 text-orange-500" />
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  MY PRIORITIES
                </h1>
              </div>
              <p className="text-sm text-gray-400 mt-1">
                {currentTeamMember.is_achtung_kraft_member 
                  ? 'High-priority tasks across all projects' 
                  : `Priority tasks for ${currentTeamMember.company || 'your company'}`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="outline" className="border-orange-500 text-orange-400 text-base px-3 py-1">
                {tasks.length} Priority Task{tasks.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>

          {/* Group By Control */}
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Group by:</span>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">
                      <div className="flex items-center gap-2">
                        <Circle className="w-4 h-4" />
                        Status
                      </div>
                    </SelectItem>
                    <SelectItem value="assigned">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Assigned To
                      </div>
                    </SelectItem>
                    <SelectItem value="category">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Category
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Tasks by Project */}
          {Object.keys(groupedByProject).length === 0 ? (
            <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
              <CardContent className="p-8 text-center">
                <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No priority tasks found</p>
                <p className="text-gray-600 mt-2">
                  {currentTeamMember.is_achtung_kraft_member 
                    ? 'Mark tasks as priority to see them here'
                    : 'No priority tasks have been assigned to your company projects'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedByProject).map(([projectId, { project, subGroups }]) => (
                <Card key={projectId} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
                  <CardHeader className="border-b border-red-900/30">
                    <CardTitle className="text-white flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                      {project.name}
                      <Badge variant="outline" className="ml-2 border-gray-600 text-gray-400">
                        {Object.values(subGroups).flat().length} task{Object.values(subGroups).flat().length !== 1 ? 's' : ''}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="space-y-4">
                      {Object.entries(subGroups).map(([subGroupKey, groupTasks]) => (
                        <div key={subGroupKey}>
                          <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                            {subGroupKey} ({groupTasks.length})
                          </h3>
                          <div className="space-y-2">
                            {groupTasks.map(task => {
                              const status = statuses.find(s => s.id === task.status_id);
                              const category = categories.find(c => c.id === task.category_id);
                              const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);
                              const isCompleted = completedStatusIds.includes(task.status_id);

                              return (
                                <div
                                  key={task.id}
                                  className="bg-gray-900/50 rounded-lg p-3 hover:bg-gray-900/70 transition-colors cursor-pointer border border-gray-800"
                                  onClick={() => setSelectedTaskId(task.id)}
                                >
                                  <div className="flex items-start gap-3">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleComplete(task);
                                      }}
                                      className="mt-1 text-gray-400 hover:text-green-400 transition-colors"
                                    >
                                      {isCompleted ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                                      ) : (
                                        <Circle className="w-5 h-5" />
                                      )}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <h4 className={`font-medium ${isCompleted ? 'line-through text-gray-500' : 'text-white'}`}>
                                        {task.name}
                                      </h4>
                                      {task.description && (
                                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                          {task.description}
                                        </p>
                                      )}
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {status && (
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                            style={{
                                              borderColor: status.color,
                                              color: status.color
                                            }}
                                          >
                                            {status.label}
                                          </Badge>
                                        )}
                                        {category && (
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                            style={{
                                              borderColor: category.color,
                                              color: category.color
                                            }}
                                          >
                                            {category.name}
                                          </Badge>
                                        )}
                                        {assignedMember && (
                                          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                                            {assignedMember.full_name}
                                          </Badge>
                                        )}
                                        {task.due_date && (
                                          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                                            Due: {new Date(task.due_date).toLocaleDateString()}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedTaskId && (
        <TaskDetailDrawer
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </>
  );
}