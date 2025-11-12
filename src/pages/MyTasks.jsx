import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Calendar, AlertCircle, User, CheckCircle, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import CreateTaskModal from "../components/tasks/CreateTaskModal";

const FILTER_STORAGE_KEY = 'achtung_mytasks_filters';

export default function MyTasks() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState([]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Load filters from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const filters = JSON.parse(saved);
        setSearchTerm(filters.searchTerm || '');
        setStatusFilter(filters.statusFilter || 'all');
      }
    } catch (e) {}
  }, []);

  // Save filters
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        searchTerm,
        statusFilter,
      }));
    } catch (e) {}
  }, [searchTerm, statusFilter]);

  const { data: userTeamMember } = useQuery({
    queryKey: ['userTeamMember', user?.id],
    queryFn: () => base44.entities.TeamMember.filter({ user_id: user?.id }),
    select: (data) => data[0],
    enabled: !!user?.id,
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['myTasks', userTeamMember?.id],
    queryFn: () => base44.entities.Task.filter({ assigned_team_member_id: userTeamMember?.id }),
    enabled: !!userTeamMember?.id,
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

  const batchCompleteMutation = useMutation({
    mutationFn: async (taskIds) => {
      const completedStatus = statuses.find(s => 
        s.scope === 'Task' && (s.label.toLowerCase() === 'completed' || s.label.toLowerCase() === 'done')
      );
      if (!completedStatus) throw new Error('Completed status not found');
      
      const promises = taskIds.map(id => 
        base44.entities.Task.update(id, { status_id: completedStatus.id })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSelectedTasks([]);
      toast.success('Tasks marked as complete');
    },
  });

  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status_id === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const overdueTasks = filteredTasks.filter(t => {
    if (!t.due_date) return false;
    const status = statuses.find(s => s.id === t.status_id);
    const isCompleted = status?.label?.toLowerCase() === 'completed' || status?.label?.toLowerCase() === 'done';
    return new Date(t.due_date) < new Date() && !isCompleted;
  });

  const todayTasks = filteredTasks.filter(t => {
    if (!t.due_date) return false;
    const today = new Date();
    const dueDate = new Date(t.due_date);
    return dueDate.toDateString() === today.toDateString();
  });

  const groupedTasks = {};
  filteredTasks.forEach(task => {
    const status = statuses.find(s => s.id === task.status_id);
    const statusLabel = status?.label || 'No Status';
    if (!groupedTasks[statusLabel]) {
      groupedTasks[statusLabel] = [];
    }
    groupedTasks[statusLabel].push(task);
  });

  const toggleTaskSelection = (taskId) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const toggleAllTasks = () => {
    if (selectedTasks.length === filteredTasks.length) {
      setSelectedTasks([]);
    } else {
      setSelectedTasks(filteredTasks.map(t => t.id));
    }
  };

  const handleBatchComplete = () => {
    if (selectedTasks.length === 0) return;
    if (confirm(`Mark ${selectedTasks.length} task(s) as complete?`)) {
      batchCompleteMutation.mutate(selectedTasks);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              My Tasks
            </h1>
            <p className="text-gray-400">Your assigned work items</p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Total Tasks</p>
                  <p className="text-2xl font-bold text-white">{filteredTasks.length}</p>
                </div>
                <Calendar className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Due Today</p>
                  <p className="text-2xl font-bold text-white">{todayTasks.length}</p>
                </div>
                <Calendar className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Overdue</p>
                  <p className="text-2xl font-bold text-white">{overdueTasks.length}</p>
                </div>
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Batch Actions */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search tasks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-48 bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {taskStatuses.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTasks.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg">
                  <span className="text-sm text-white">
                    {selectedTasks.length} task(s) selected
                  </span>
                  <Button
                    size="sm"
                    onClick={handleBatchComplete}
                    className="bg-green-600 hover:bg-green-700 gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Mark Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedTasks([])}
                    className="border-gray-600"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-center text-gray-500">Loading tasks...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                No tasks assigned to you yet.
              </div>
            ) : (
              <div className="divide-y divide-red-900/10">
                {Object.entries(groupedTasks).map(([statusLabel, statusTasks]) => {
                  const status = statuses.find(s => s.label === statusLabel);
                  return (
                    <div key={statusLabel}>
                      <div className="px-6 py-3 bg-gray-900/50 flex items-center gap-3">
                        <Checkbox
                          checked={statusTasks.every(t => selectedTasks.includes(t.id))}
                          onCheckedChange={() => {
                            const allSelected = statusTasks.every(t => selectedTasks.includes(t.id));
                            if (allSelected) {
                              setSelectedTasks(prev => prev.filter(id => !statusTasks.find(t => t.id === id)));
                            } else {
                              setSelectedTasks(prev => [...new Set([...prev, ...statusTasks.map(t => t.id)])]);
                            }
                          }}
                        />
                        <Badge 
                          style={{ backgroundColor: status?.color || '#EF4444' }}
                          className="text-white"
                        >
                          {statusLabel} ({statusTasks.length})
                        </Badge>
                      </div>
                      <div className="divide-y divide-red-900/10">
                        {statusTasks.map(task => {
                          const project = projects.find(p => p.id === task.project_id);
                          const category = categories.find(c => c.id === task.category_id);
                          const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                          const isDueToday = task.due_date && new Date(task.due_date).toDateString() === new Date().toDateString();

                          return (
                            <div
                              key={task.id}
                              className="flex items-start gap-4 p-6 hover:bg-red-950/20 transition-colors"
                            >
                              <Checkbox
                                checked={selectedTasks.includes(task.id)}
                                onCheckedChange={() => toggleTaskSelection(task.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div 
                                className="flex-1 cursor-pointer"
                                onClick={() => setSelectedTask(task)}
                              >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                  <div className="flex-1">
                                    <h3 className="text-lg font-medium text-white mb-1">
                                      {task.name}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                                      <span className="flex items-center gap-1">
                                        Project: <span className="text-red-400">{project?.name || 'Unknown'}</span>
                                      </span>
                                      {category && (
                                        <>
                                          <span>•</span>
                                          <span>{category.name}</span>
                                        </>
                                      )}
                                    </div>
                                    {task.description && (
                                      <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                                        {task.description}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4">
                                    {task.due_date && (
                                      <div className={`text-sm ${isOverdue ? 'text-red-400 font-medium' : isDueToday ? 'text-yellow-400' : 'text-gray-400'}`}>
                                        <Calendar className="w-4 h-4 inline mr-1" />
                                        {format(new Date(task.due_date), 'MMM d')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}