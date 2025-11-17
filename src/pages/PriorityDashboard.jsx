import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Loader2, FolderKanban, LayoutGrid, List } from "lucide-react";
import { createPageUrl } from "@/utils";
import TaskCard from "../components/project/TaskCard";
import TaskDetailDrawer from "../components/tasks/TaskDetailDrawer";
import PriorityTaskList from "../components/priority/PriorityTaskList";

export default function PriorityDashboard() {
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const [listGroupBy, setListGroupBy] = useState('category');

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['priorityTasks'],
    queryFn: () => base44.entities.Task.filter({ is_priority: true }),
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
  const activePriorityTasks = allTasks.filter(t => t.status_id !== completedStatus?.id);

  // Group tasks by project
  const tasksByProject = useMemo(() => {
    const grouped = {};
    
    activePriorityTasks.forEach(task => {
      const projectId = task.project_id;
      if (!grouped[projectId]) {
        grouped[projectId] = [];
      }
      grouped[projectId].push(task);
    });
    
    return grouped;
  }, [activePriorityTasks]);

  const handleToggleComplete = (task) => {
    // This function is passed to TaskCard but we'll handle it via TaskDetailDrawer
    // since we want to maintain consistency
    setSelectedTask(task);
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 bg-red-600/20 rounded-lg border-2 border-red-600">
                <Flame className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">PRIORITY DASHBOARD</h1>
                <p className="text-sm text-gray-400">
                  {activePriorityTasks.length} high-priority {activePriorityTasks.length === 1 ? 'task' : 'tasks'} across {Object.keys(tasksByProject).length} {Object.keys(tasksByProject).length === 1 ? 'project' : 'projects'}
                </p>
              </div>
            </div>
            
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-gray-900/50 border border-red-900/30 rounded-lg p-1">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className={viewMode === 'cards' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Priority Tasks by Project */}
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
          ) : viewMode === 'cards' ? (
            <div className="space-y-6">
              {Object.entries(tasksByProject).map(([projectId, tasks]) => {
                const project = projects.find(p => p.id === projectId);
                if (!project) return null;

                return (
                  <Card key={projectId} className="bg-black/40 backdrop-blur-xl border-2 border-red-600/50 shadow-lg shadow-red-600/10">
                    <CardHeader className="border-b border-red-900/30 p-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <FolderKanban className="w-5 h-5 text-red-400" />
                          <div>
                            <Link 
                              to={createPageUrl("ProjectDetail") + `?id=${project.id}`}
                              className="hover:text-red-400 transition-colors"
                            >
                              <CardTitle className="text-white text-lg hover:text-red-400 transition-colors">{project.name}</CardTitle>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {tasks.map(task => (
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
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <PriorityTaskList
              tasks={activePriorityTasks}
              projects={projects}
              categories={categories}
              teamMembers={teamMembers}
              statuses={statuses}
              groupBy={listGroupBy}
              onGroupByChange={setListGroupBy}
              onTaskClick={setSelectedTask}
            />
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