import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Calendar } from "lucide-react";
import { format } from "date-fns";
import CreateTaskModal from "../tasks/CreateTaskModal";
import TaskDetailModal from "../tasks/TaskDetailModal";

export default function ProjectTasks({ projectId }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

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

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
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

  const completedCount = tasks.filter(t => {
    const status = statuses.find(s => s.id === t.status_id);
    return status?.label?.toLowerCase() === 'completed' || status?.label?.toLowerCase() === 'done';
  }).length;

  const completionPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const handleTaskClick = (task) => {
    console.log('Task clicked:', task);
    setSelectedTask(task);
  };

  console.log('ProjectTasks render - selectedTask:', selectedTask);
  console.log('ProjectTasks render - showCreateModal:', showCreateModal);

  return (
    <>
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-white">Project Tasks</CardTitle>
              <p className="text-sm text-gray-400 mt-1">
                {tasks.length} total tasks • {completionPercent}% complete
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
            <div className="text-center py-12 text-gray-500">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No tasks yet. Add one to get started.
            </div>
          ) : (
            <div className="divide-y divide-red-900/10">
              {Object.entries(groupedTasks).map(([statusLabel, statusTasks]) => {
                const status = statuses.find(s => s.label === statusLabel);
                return (
                  <div key={statusLabel}>
                    <div className="px-6 py-3 bg-gray-900/50">
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
                          const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
                          const isOverdue = task.due_date && new Date(task.due_date) < new Date();

                          return (
                            <TableRow 
                              key={task.id}
                              onClick={() => handleTaskClick(task)}
                              className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors cursor-pointer"
                            >
                              <TableCell className="font-medium text-white">
                                {task.name}
                              </TableCell>
                              <TableCell className="text-gray-300 hidden md:table-cell">
                                {category?.name || '-'}
                              </TableCell>
                              <TableCell className="text-gray-300 hidden lg:table-cell">
                                {member?.full_name || 'Unassigned'}
                              </TableCell>
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

      {showCreateModal && (
        <CreateTaskModal 
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          projectId={projectId}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}