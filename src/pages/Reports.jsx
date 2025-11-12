import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Filter } from "lucide-react";
import { format } from "date-fns";

export default function Reports() {
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['allTasks'],
    queryFn: () => base44.entities.Task.list('-due_date'),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject = projectFilter === 'all' || t.project_id === projectFilter;
    const matchesStatus = statusFilter === 'all' || t.status_id === statusFilter;
    const matchesCategory = categoryFilter === 'all' || t.category_id === categoryFilter;
    const matchesUser = userFilter === 'all' || t.assigned_user_id === userFilter;
    return matchesSearch && matchesProject && matchesStatus && matchesCategory && matchesUser;
  });

  const openTasks = filteredTasks.filter(t => {
    const status = statuses.find(s => s.id === t.status_id);
    return status?.label?.toLowerCase() !== 'completed' && status?.label?.toLowerCase() !== 'done';
  });

  const overdueTasks = openTasks.filter(t => 
    t.due_date && new Date(t.due_date) < new Date()
  );

  const statusCounts = {};
  filteredTasks.forEach(task => {
    const status = statuses.find(s => s.id === task.status_id);
    const label = status?.label || 'No Status';
    statusCounts[label] = (statusCounts[label] || 0) + 1;
  });

  const exportToCSV = () => {
    const headers = ['Project', 'Task', 'Category', 'Status', 'Assigned', 'Due Date', 'Created Date'];
    const rows = filteredTasks.map(task => {
      const project = projects.find(p => p.id === task.project_id);
      const status = statuses.find(s => s.id === task.status_id);
      const category = categories.find(c => c.id === task.category_id);
      const user = users.find(u => u.id === task.assigned_user_id);
      return [
        project?.name || '',
        task.name,
        category?.name || '',
        status?.label || '',
        user?.full_name || 'Unassigned',
        task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '',
        format(new Date(task.created_date), 'yyyy-MM-dd'),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tasks-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Task Reports
            </h1>
            <p className="text-gray-400">Cross-project task overview and analytics</p>
          </div>
          <Button 
            onClick={exportToCSV}
            variant="outline"
            className="border-gray-700 text-white gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-6">
              <p className="text-sm text-gray-400 mb-1">Open Tasks</p>
              <p className="text-3xl font-bold text-white">{openTasks.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-6">
              <p className="text-sm text-gray-400 mb-1">Overdue Tasks</p>
              <p className="text-3xl font-bold text-red-400">{overdueTasks.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-6">
              <p className="text-sm text-gray-400 mb-1">Total Tasks</p>
              <p className="text-3xl font-bold text-white">{filteredTasks.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <CardTitle className="text-white flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {taskStatuses.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.filter(c => c.active).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tasks Table */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-red-900/20">
                    <TableHead className="text-gray-400">Project</TableHead>
                    <TableHead className="text-gray-400">Task</TableHead>
                    <TableHead className="text-gray-400 hidden md:table-cell">Status</TableHead>
                    <TableHead className="text-gray-400 hidden lg:table-cell">Category</TableHead>
                    <TableHead className="text-gray-400 hidden lg:table-cell">Assigned</TableHead>
                    <TableHead className="text-gray-400">Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredTasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                        No tasks found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTasks.map(task => {
                      const project = projects.find(p => p.id === task.project_id);
                      const status = statuses.find(s => s.id === task.status_id);
                      const category = categories.find(c => c.id === task.category_id);
                      const user = users.find(u => u.id === task.assigned_user_id);
                      const isOverdue = task.due_date && new Date(task.due_date) < new Date();

                      return (
                        <TableRow 
                          key={task.id}
                          className="border-b border-red-900/10 hover:bg-red-950/20"
                        >
                          <TableCell className="text-gray-300">
                            {project?.name || '-'}
                          </TableCell>
                          <TableCell className="text-white font-medium">
                            {task.name}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {status && (
                              <Badge 
                                style={{ backgroundColor: status.color }}
                                className="text-white text-xs"
                              >
                                {status.label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-gray-400 hidden lg:table-cell">
                            {category?.name || '-'}
                          </TableCell>
                          <TableCell className="text-gray-400 hidden lg:table-cell">
                            {user?.full_name || 'Unassigned'}
                          </TableCell>
                          <TableCell>
                            {task.due_date ? (
                              <span className={isOverdue ? 'text-red-400 font-medium' : 'text-gray-400'}>
                                {format(new Date(task.due_date), 'MMM d, yyyy')}
                              </span>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        {Object.keys(statusCounts).length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30">
              <CardTitle className="text-white">Tasks by Status</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-wrap gap-4">
                {Object.entries(statusCounts).map(([label, count]) => {
                  const status = statuses.find(s => s.label === label);
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <Badge 
                        style={{ backgroundColor: status?.color || '#EF4444' }}
                        className="text-white"
                      >
                        {label}
                      </Badge>
                      <span className="text-white font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}