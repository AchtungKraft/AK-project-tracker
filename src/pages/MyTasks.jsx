import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Calendar, Filter } from "lucide-react";
import { format } from "date-fns";
import TaskDetailDrawer from "../components/tasks/TaskDetailDrawer";

const FILTER_STORAGE_KEY = 'achtung_all_tasks_filters';

export default function MyTasks() {
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('status'); // status, project, assigned, category
  const [selectedTask, setSelectedTask] = useState(null);

  // Load filters from localStorage
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

  // Save filters
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
    queryFn: () => base44.entities.StatusList.list(),
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

  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject = projectFilter === 'all' || t.project_id === projectFilter;
    const matchesStatus = statusFilter === 'all' || t.status_id === statusFilter;
    const matchesCategory = categoryFilter === 'all' || t.category_id === categoryFilter;
    const matchesAssigned = assignedFilter === 'all' || t.assigned_team_member_id === assignedFilter;
    
    return matchesSearch && matchesProject && matchesStatus && matchesCategory && matchesAssigned;
  });

  // Group tasks
  const groupedTasks = {};
  filteredTasks.forEach(task => {
    let groupKey = 'Ungrouped';
    
    if (groupBy === 'status') {
      const status = statuses.find(s => s.id === task.status_id);
      groupKey = status?.label || 'No Status';
    } else if (groupBy === 'project') {
      const project = projects.find(p => p.id === task.project_id);
      groupKey = project?.name || 'No Project';
    } else if (groupBy === 'assigned') {
      const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
      groupKey = member?.full_name || 'Unassigned';
    } else if (groupBy === 'category') {
      const category = categories.find(c => c.id === task.category_id);
      groupKey = category?.name || 'No Category';
    }
    
    if (!groupedTasks[groupKey]) {
      groupedTasks[groupKey] = [];
    }
    groupedTasks[groupKey].push(task);
  });

  const getTaskProject = (taskProjectId) => {
    return projects.find(p => p.id === taskProjectId)?.name || '-';
  };

  const getTaskStatus = (taskStatusId) => {
    return statuses.find(s => s.id === taskStatusId);
  };

  const getTaskCategory = (taskCategoryId) => {
    return categories.find(c => c.id === taskCategoryId)?.name || '-';
  };

  const getTaskAssigned = (taskMemberId) => {
    return teamMembers.find(m => m.id === taskMemberId)?.full_name || 'Unassigned';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            All Tasks
          </h1>
          <p className="text-gray-400">View and manage all tasks across projects</p>
        </div>

        {/* Filters */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white">Filters & Grouping</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Search */}
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

              {/* Project Filter */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Project</label>
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

              {/* Status Filter */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Status</label>
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

              {/* Category Filter */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Category</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.filter(c => c.active).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assigned Filter */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Assigned To</label>
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

              {/* Group By */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Group By</label>
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

        {/* Tasks Table */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <CardTitle className="text-white">
              Tasks ({filteredTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tasksLoading ? (
              <div className="p-6 text-center text-gray-500">Loading tasks...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                No tasks found matching your filters.
              </div>
            ) : (
              <div className="divide-y divide-red-900/10">
                {Object.entries(groupedTasks).map(([groupLabel, groupTasks]) => {
                  const status = groupBy === 'status' ? statuses.find(s => s.label === groupLabel) : null;
                  
                  return (
                    <div key={groupLabel}>
                      <div className="px-6 py-3 bg-gray-900/50">
                        <Badge 
                          style={status ? { backgroundColor: status.color } : {}}
                          className={status ? "text-white" : "bg-gray-700 text-white"}
                        >
                          {groupLabel} ({groupTasks.length})
                        </Badge>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                            <TableHead className="text-gray-400">Task</TableHead>
                            <TableHead className="text-gray-400 hidden md:table-cell">Project</TableHead>
                            {groupBy !== 'status' && (
                              <TableHead className="text-gray-400 hidden lg:table-cell">Status</TableHead>
                            )}
                            {groupBy !== 'category' && (
                              <TableHead className="text-gray-400 hidden lg:table-cell">Category</TableHead>
                            )}
                            {groupBy !== 'assigned' && (
                              <TableHead className="text-gray-400 hidden xl:table-cell">Assigned</TableHead>
                            )}
                            <TableHead className="text-gray-400">Due Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupTasks.map(task => {
                            const taskStatus = getTaskStatus(task.status_id);
                            const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                            
                            return (
                              <TableRow 
                                key={task.id}
                                onClick={() => setSelectedTask(task)}
                                className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors cursor-pointer"
                              >
                                <TableCell className="font-medium text-white">
                                  {task.name}
                                </TableCell>
                                <TableCell className="text-gray-300 hidden md:table-cell">
                                  {getTaskProject(task.project_id)}
                                </TableCell>
                                {groupBy !== 'status' && (
                                  <TableCell className="hidden lg:table-cell">
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
                                  <TableCell className="text-gray-300 hidden lg:table-cell">
                                    {getTaskCategory(task.category_id)}
                                  </TableCell>
                                )}
                                {groupBy !== 'assigned' && (
                                  <TableCell className="text-gray-300 hidden xl:table-cell">
                                    {getTaskAssigned(task.assigned_team_member_id)}
                                  </TableCell>
                                )}
                                <TableCell>
                                  {task.due_date ? (
                                    <span className={isOverdue ? 'text-red-400 font-medium' : 'text-gray-400'}>
                                      <Calendar className="w-4 h-4 inline mr-1" />
                                      {format(new Date(task.due_date), 'MMM d')}
                                    </span>
                                  ) : (
                                    <span className="text-gray-600">-</span>
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
  );
}