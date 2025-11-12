import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import CreateTaskModal from "../tasks/CreateTaskModal";

export default function ProjectTasks({ projectId }) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => base44.entities.Task.filter({ project_id: projectId }),
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

  const groupedTasks = {};
  tasks.forEach(task => {
    const status = statuses.find(s => s.id === task.status_id);
    const statusLabel = status?.label || 'No Status';
    if (!groupedTasks[statusLabel]) {
      groupedTasks[statusLabel] = [];
    }
    groupedTasks[statusLabel].push(task);
  });

  const completedTasks = tasks.filter(t => {
    const status = statuses.find(s => s.id === t.status_id);
    return status?.label?.toLowerCase() === 'completed' || status?.label?.toLowerCase() === 'done';
  });

  const completionPercent = tasks.length > 0 
    ? Math.round((completedTasks.length / tasks.length) * 100) 
    : 0;

  return (
    <div>
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle className="text-white mb-2">Tasks</CardTitle>
              <p className="text-sm text-gray-400">
                {completedTasks.length} of {tasks.length} tasks completed ({completionPercent}%)
              </p>
            </div>
            <Button 
              onClick={() => setShowCreateModal(true)}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-gray-500">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No tasks yet. Click "Add Task" to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {Object.entries(groupedTasks).map(([statusLabel, statusTasks]) => {
                const status = statuses.find(s => s.label === statusLabel);
                return (
                  <div key={statusLabel}>
                    <div className="px-6 py-3 bg-gray-900/50 border-b border-red-900/20">
                      <Badge 
                        style={{ backgroundColor: status?.color || '#EF4444' }}
                        className="text-white"
                      >
                        {statusLabel} ({statusTasks.length})
                      </Badge>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                          <TableHead className="text-gray-400">Task</TableHead>
                          <TableHead className="text-gray-400 hidden md:table-cell">Category</TableHead>
                          <TableHead className="text-gray-400 hidden lg:table-cell">Assigned</TableHead>
                          <TableHead className="text-gray-400">Due Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statusTasks.map(task => {
                          const category = categories.find(c => c.id === task.category_id);
                          const assignedUser = users.find(u => u.id === task.assigned_user_id);
                          const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                          
                          return (
                            <TableRow 
                              key={task.id}
                              className="border-b border-red-900/10 hover:bg-red-950/20"
                            >
                              <TableCell className="text-white">
                                <div>
                                  <div className="font-medium">{task.name}</div>
                                  {task.description && (
                                    <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                                      {task.description}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-gray-400 hidden md:table-cell">
                                {category?.name || '-'}
                              </TableCell>
                              <TableCell className="text-gray-400 hidden lg:table-cell">
                                {assignedUser?.full_name || 'Unassigned'}
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

      {showCreateModal && (
        <CreateTaskModal 
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}