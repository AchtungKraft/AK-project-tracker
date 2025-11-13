import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Calendar, Filter, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import TaskDetailDrawer from "../components/tasks/TaskDetailDrawer";

const FILTER_STORAGE_KEY = 'achtung_all_tasks_filters';

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

export default function MyTasks() {
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('status');
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const filters = JSON.parse(saved);
        setSearchTerm(filters.searchTerm || '');
        setProjectFilter(filters.projectFilter || 'all');
        setStatusFilter(filters.statusFilter || 'all');
        setCategoryFilter(filters.categoryFilter || 'all');
        setAssignedFilter(filters.assignedFilter || 'all');
        setGroupBy(filters.groupBy || 'status');
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        searchTerm,
        projectFilter,
        statusFilter,
        categoryFilter,
        assignedFilter,
        groupBy,
      }));
    } catch (e) {}
  }, [searchTerm, projectFilter, statusFilter, categoryFilter, assignedFilter, groupBy]);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['allTasks'],
    queryFn: () => base44.entities.Task.list('-created_date'),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: async () => {
      const list = await base44.entities.StatusList.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: async () => {
      const list = await base44.entities.TaskCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: async () => {
      const list = await base44.entities.TeamMember.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const parentCategories = categories.filter(c => !c.parent_id && c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Find completed status
  const completedStatus = taskStatuses.find(s => {
    const label = s.label.toLowerCase();
    return label.includes('complete') || label.includes('done');
  });

  // Separate active and completed tasks
  const activeTasks = tasks.filter(t => t.status_id !== completedStatus?.id);
  const completedTasks = tasks.filter(t => t.status_id === completedStatus?.id);

  // Filter active tasks
  const filteredActiveTasks = activeTasks.filter(t => {
    const matchesSearch = t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject = projectFilter === 'all' || t.project_id === projectFilter;
    const matchesStatus = statusFilter === 'all' || t.status_id === statusFilter;
    const matchesCategory = categoryFilter === 'all' || t.category_id === categoryFilter;
    const matchesAssigned = assignedFilter === 'all' || t.assigned_team_member_id === assignedFilter;
    
    return matchesSearch && matchesProject && matchesStatus && matchesCategory && matchesAssigned;
  });

  const filteredCompletedTasks = completedTasks.filter(t => {
    const matchesSearch = t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject = projectFilter === 'all' || t.project_id === projectFilter;
    const matchesCategory = categoryFilter === 'all' || t.category_id === categoryFilter;
    const matchesAssigned = assignedFilter === 'all' || t.assigned_team_member_id === assignedFilter;
    
    return matchesSearch && matchesProject && matchesCategory && matchesAssigned;
  });

  const groupedActiveTasks = {};
  filteredActiveTasks.forEach(task => {
    let groupKey = 'Ungrouped';
    let groupColor = '#6B7280';
    
    if (groupBy === 'status') {
      const status = statuses.find(s => s.id === task.status_id);
      groupKey = status?.label || 'No Status';
      groupColor = status?.color || '#6B7280';
    } else if (groupBy === 'project') {
      const project = projects.find(p => p.id === task.project_id);
      groupKey = project?.name || 'No Project';
    } else if (groupBy === 'assigned') {
      const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
      groupKey = member?.full_name || 'Unassigned';
    } else if (groupBy === 'category') {
      const category = categories.find(c => c.id === task.category_id);
      groupKey = getCategoryPath(task.category_id, categories) || 'No Category';
      groupColor = category?.color || '#6B7280';
    }
    
    if (!groupedActiveTasks[groupKey]) {
      groupedActiveTasks[groupKey] = { tasks: [], color: groupColor };
    }
    groupedActiveTasks[groupKey].tasks.push(task);
  });

  const groupedCompletedTasks = {};
  filteredCompletedTasks.forEach(task => {
    let groupKey = 'Ungrouped';
    let groupColor = '#6B7280';
    
    if (groupBy === 'status') {
      const status = statuses.find(s => s.id === task.status_id);
      groupKey = status?.label || 'No Status';
      groupColor = status?.color || '#6B7280';
    } else if (groupBy === 'project') {
      const project = projects.find(p => p.id === task.project_id);
      groupKey = project?.name || 'No Project';
    } else if (groupBy === 'assigned') {
      const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
      groupKey = member?.full_name || 'Unassigned';
    } else if (groupBy === 'category') {
      const category = categories.find(c => c.id === task.category_id);
      groupKey = getCategoryPath(task.category_id, categories) || 'No Category';
      groupColor = category?.color || '#6B7280';
    }
    
    if (!groupedCompletedTasks[groupKey]) {
      groupedCompletedTasks[groupKey] = { tasks: [], color: groupColor };
    }
    groupedCompletedTasks[groupKey].tasks.push(task);
  });

  const getTaskProject = (taskProjectId) => {
    return projects.find(p => p.id === taskProjectId)?.name || '-';
  };

  const getTaskStatus = (taskStatusId) => {
    return statuses.find(s => s.id === taskStatusId);
  };

  const getTaskCategory = (taskCategoryId) => {
    return getCategoryPath(taskCategoryId, categories) || '-';
  };

  const getTaskCategoryColor = (taskCategoryId) => {
    const category = categories.find(c => c.id === taskCategoryId);
    return category?.color;
  };

  const getTaskAssigned = (taskMemberId) => {
    return teamMembers.find(m => m.id === taskMemberId)?.full_name || 'Unassigned';
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
              All Tasks
            </h1>
            <p className="text-sm text-gray-400">View and manage all tasks across projects</p>
          </div>

          {/* Filters */}
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30 p-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <CardTitle className="text-white text-base">Filters & Grouping</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                      placeholder="Search tasks..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Project</label>
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                      <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {taskStatuses.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Category</label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {parentCategories.map(parent => {
                        const children = categories.filter(c => c.parent_id === parent.id && c.active);
                        return (
                          <React.Fragment key={parent.id}>
                            <SelectItem value={parent.id}>
                              <span style={{ color: parent.color }}>{parent.name}</span>
                            </SelectItem>
                            {children.map(child => (
                              <SelectItem key={child.id} value={child.id}>
                                <span className="ml-4" style={{ color: child.color }}>
                                  → {child.name}
                                </span>
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Assigned To</label>
                  <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                    <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                      <SelectValue placeholder="All Members" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Members</SelectItem>
                      {teamMembers.filter(m => m.active).map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Group By</label>
                  <Select value={groupBy} onValueChange={setGroupBy}>
                    <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="assigned">Assigned To</SelectItem>
                      <SelectItem value="category">Category</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Tasks Table */}
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30 p-4">
              <CardTitle className="text-white text-base">
                Active Tasks ({filteredActiveTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tasksLoading ? (
                <div className="p-4 text-center text-gray-500 text-sm">Loading tasks...</div>
              ) : filteredActiveTasks.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No active tasks found matching your filters.
                </div>
              ) : (
                <div className="divide-y divide-red-900/10">
                  {Object.entries(groupedActiveTasks).map(([groupLabel, groupData]) => {
                    const { tasks: groupTasks, color: groupColor } = groupData;
                    
                    return (
                      <div key={groupLabel}>
                        <div 
                          className="px-4 py-2 bg-gray-900/50 border-l-4 border-b-2"
                          style={{ 
                            borderLeftColor: groupColor,
                            borderBottomColor: groupColor
                          }}
                        >
                          <span 
                            className="text-sm font-medium"
                            style={{ color: groupColor }}
                          >
                            {groupLabel} ({groupTasks.length})
                          </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                              <TableHead className="text-gray-400 text-xs py-2">Task</TableHead>
                              <TableHead className="text-gray-400 text-xs py-2 hidden md:table-cell">Project</TableHead>
                              {groupBy !== 'status' && (
                                <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Status</TableHead>
                              )}
                              {groupBy !== 'category' && (
                                <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Category</TableHead>
                              )}
                              {groupBy !== 'assigned' && (
                                <TableHead className="text-gray-400 text-xs py-2 hidden xl:table-cell">Assigned</TableHead>
                              )}
                              <TableHead className="text-gray-400 text-xs py-2">Due Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupTasks.map(task => {
                              const taskStatus = getTaskStatus(task.status_id);
                              const categoryColor = getTaskCategoryColor(task.category_id);
                              const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                              
                              return (
                                <TableRow 
                                  key={task.id}
                                  onClick={() => setSelectedTask(task)}
                                  className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors cursor-pointer"
                                >
                                  <TableCell className="font-medium text-white text-sm py-2">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-help">{task.name}</span>
                                      </TooltipTrigger>
                                      {task.description && (
                                        <TooltipContent side="right" className="max-w-md bg-gray-800 border-gray-700">
                                          <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell className="text-gray-300 text-sm hidden md:table-cell py-2">
                                    {getTaskProject(task.project_id)}
                                  </TableCell>
                                  {groupBy !== 'status' && (
                                    <TableCell className="hidden lg:table-cell py-2">
                                      {taskStatus && (
                                        <Badge 
                                          style={{ backgroundColor: taskStatus.color }}
                                          className="text-white text-xs"
                                        >
                                          {taskStatus.label}
                                        </Badge>
                                      )}
                                    </TableCell>
                                  )}
                                  {groupBy !== 'category' && (
                                    <TableCell className="text-sm hidden lg:table-cell py-2">
                                      <span style={{ color: categoryColor || '#D1D5DB' }}>
                                        {getTaskCategory(task.category_id)}
                                      </span>
                                    </TableCell>
                                  )}
                                  {groupBy !== 'assigned' && (
                                    <TableCell className="text-gray-300 text-sm hidden xl:table-cell py-2">
                                      {getTaskAssigned(task.assigned_team_member_id)}
                                    </TableCell>
                                  )}
                                  <TableCell className="py-2">
                                    {task.due_date ? (
                                      <span className={`text-sm ${isOverdue ? 'text-red-400 font-medium' : 'text-gray-400'}`}>
                                        <Calendar className="w-3 h-3 inline mr-1" />
                                        {format(new Date(task.due_date), 'MMM d')}
                                      </span>
                                    ) : (
                                      <span className="text-gray-600 text-sm">-</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Completed Tasks Section */}
          <Card className="bg-black/40 backdrop-blur-xl border border-green-900/30">
            <CardHeader className="border-b border-green-900/30 p-4">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                Completed Tasks ({filteredCompletedTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredCompletedTasks.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No completed tasks found matching your filters.
                </div>
              ) : (
                <div className="divide-y divide-green-900/10">
                  {Object.entries(groupedCompletedTasks).map(([groupLabel, groupData]) => {
                    const { tasks: groupTasks, color: groupColor } = groupData;
                    
                    return (
                      <div key={groupLabel}>
                        <div 
                          className="px-4 py-2 bg-gray-900/50 border-l-4 border-b-2"
                          style={{ 
                            borderLeftColor: groupColor,
                            borderBottomColor: groupColor
                          }}
                        >
                          <span 
                            className="text-sm font-medium"
                            style={{ color: groupColor }}
                          >
                            {groupLabel} ({groupTasks.length})
                          </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-b border-green-900/20 hover:bg-transparent">
                              <TableHead className="text-gray-400 text-xs py-2">Task</TableHead>
                              <TableHead className="text-gray-400 text-xs py-2 hidden md:table-cell">Project</TableHead>
                              {groupBy !== 'status' && (
                                <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Status</TableHead>
                              )}
                              {groupBy !== 'category' && (
                                <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Category</TableHead>
                              )}
                              {groupBy !== 'assigned' && (
                                <TableHead className="text-gray-400 text-xs py-2 hidden xl:table-cell">Assigned</TableHead>
                              )}
                              <TableHead className="text-gray-400 text-xs py-2">Completed</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupTasks.map(task => {
                              const taskStatus = getTaskStatus(task.status_id);
                              const categoryColor = getTaskCategoryColor(task.category_id);
                              
                              return (
                                <TableRow 
                                  key={task.id}
                                  onClick={() => setSelectedTask(task)}
                                  className="border-b border-green-900/10 hover:bg-green-950/20 transition-colors cursor-pointer"
                                >
                                  <TableCell className="font-medium text-white text-sm py-2 line-through opacity-70">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-help">{task.name}</span>
                                      </TooltipTrigger>
                                      {task.description && (
                                        <TooltipContent side="right" className="max-w-md bg-gray-800 border-gray-700">
                                          <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell className="text-gray-300 text-sm hidden md:table-cell py-2">
                                    {getTaskProject(task.project_id)}
                                  </TableCell>
                                  {groupBy !== 'status' && (
                                    <TableCell className="hidden lg:table-cell py-2">
                                      {taskStatus && (
                                        <Badge 
                                          style={{ backgroundColor: taskStatus.color }}
                                          className="text-white text-xs"
                                        >
                                          {taskStatus.label}
                                        </Badge>
                                      )}
                                    </TableCell>
                                  )}
                                  {groupBy !== 'category' && (
                                    <TableCell className="text-sm hidden lg:table-cell py-2">
                                      <span style={{ color: categoryColor || '#D1D5DB' }}>
                                        {getTaskCategory(task.category_id)}
                                      </span>
                                    </TableCell>
                                  )}
                                  {groupBy !== 'assigned' && (
                                    <TableCell className="text-gray-300 text-sm hidden xl:table-cell py-2">
                                      {getTaskAssigned(task.assigned_team_member_id)}
                                    </TableCell>
                                  )}
                                  <TableCell className="py-2">
                                    {task.completed_date ? (
                                      <span className="text-sm text-green-400">
                                        <Calendar className="w-3 h-3 inline mr-1" />
                                        {format(new Date(task.completed_date), 'MMM d')}
                                      </span>
                                    ) : (
                                      <span className="text-gray-600 text-sm">-</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {selectedTask && (
          <TaskDetailDrawer
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}