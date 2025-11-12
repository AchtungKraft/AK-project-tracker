import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Settings, Plus, Loader2 } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
import ManageBucketsModal from "./ManageBucketsModal";
import TaskCard from "./TaskCard";
import TaskDetailDrawer from "../tasks/TaskDetailDrawer";
import CreateTaskModal from "../tasks/CreateTaskModal";

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

export default function ProjectKanban({ projectId }) {
  const queryClient = useQueryClient();
  const [showManageBuckets, setShowManageBuckets] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const { data: buckets = [], isLoading: bucketsLoading } = useQuery({
    queryKey: ['kanbanBuckets', projectId],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: projectId }),
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['projectTasks', projectId],
    queryFn: () => base44.entities.Task.filter({ project_id: projectId }),
    enabled: !!projectId,
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

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }) => base44.entities.Task.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      toast.success('Task moved');
    },
  });

  const sortedBuckets = [...buckets].sort((a, b) => (a.order || 0) - (b.order || 0));
  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);

  // Group tasks by bucket based on kanban_bucket_id
  const tasksByBucket = {};
  const unassignedTasks = [];

  sortedBuckets.forEach(bucket => {
    tasksByBucket[bucket.id] = tasks.filter(t => t.kanban_bucket_id === bucket.id);
  });

  // Find tasks not in any bucket
  const bucketIds = sortedBuckets.map(b => b.id);
  unassignedTasks.push(...tasks.filter(t => !t.kanban_bucket_id || !bucketIds.includes(t.kanban_bucket_id)));

  // Helper function to group tasks within a bucket by status then category
  const groupTasksWithinBucket = (bucketTasks) => {
    const grouped = {};
    
    bucketTasks.forEach(task => {
      const status = statuses.find(s => s.id === task.status_id);
      const statusLabel = status?.label || 'No Status';
      const statusColor = status?.color || '#6B7280';
      
      const category = categories.find(c => c.id === task.category_id);
      const categoryPath = getCategoryPath(task.category_id, categories) || 'No Category';
      const categoryColor = category?.color || '#6B7280';
      
      const groupKey = `${statusLabel}|||${categoryPath}`;
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          statusLabel,
          statusColor,
          categoryPath,
          categoryColor,
          tasks: []
        };
      }
      
      grouped[groupKey].tasks.push(task);
    });
    
    return grouped;
  };

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const taskId = draggableId;
    
    // Moving to a bucket
    if (destination.droppableId !== 'unassigned') {
      const targetBucket = sortedBuckets.find(b => b.id === destination.droppableId);
      if (targetBucket) {
        updateTaskMutation.mutate({
          taskId,
          data: { kanban_bucket_id: targetBucket.id }
        });
      }
    } else {
      // Moving to unassigned - clear kanban_bucket_id
      updateTaskMutation.mutate({
        taskId,
        data: { kanban_bucket_id: "" }
      });
    }
  };

  if (bucketsLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Kanban Board</h2>
            <p className="text-sm text-gray-400">Drag tasks between buckets to organize</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowCreateTask(true)}
              size="sm"
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Plus className="w-4 h-4" />
              New Task
            </Button>
            <Button
              onClick={() => setShowManageBuckets(true)}
              size="sm"
              variant="outline"
              className="border-gray-700 gap-2"
            >
              <Settings className="w-4 h-4" />
              Manage Buckets
            </Button>
          </div>
        </div>

        {sortedBuckets.length === 0 ? (
          <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg p-8 text-center">
            <p className="text-gray-400 mb-4">No Kanban buckets configured yet.</p>
            <Button
              onClick={() => setShowManageBuckets(true)}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Settings className="w-4 h-4" />
              Create Your First Bucket
            </Button>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                {/* Kanban Buckets */}
                {sortedBuckets.map(bucket => {
                  const bucketTasks = tasksByBucket[bucket.id] || [];
                  const groupedTasks = groupTasksWithinBucket(bucketTasks);
                  
                  return (
                    <div key={bucket.id} className="w-80 flex-shrink-0">
                      <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg overflow-hidden">
                        {/* Bucket Header */}
                        <div
                          className="p-3 border-b-2"
                          style={{
                            borderBottomColor: bucket.color,
                            backgroundColor: `${bucket.color}15`
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <h3
                              className="font-semibold text-sm"
                              style={{ color: bucket.color }}
                            >
                              {bucket.name}
                            </h3>
                            <span className="text-xs text-gray-400">
                              {bucketTasks.length}
                            </span>
                          </div>
                          {bucket.description && (
                            <p className="text-xs text-gray-500 mt-1">{bucket.description}</p>
                          )}
                        </div>

                        {/* Tasks - Grouped by Status then Category */}
                        <Droppable droppableId={bucket.id}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`min-h-[200px] max-h-[600px] overflow-y-auto ${
                                snapshot.isDraggingOver ? 'bg-red-950/20' : ''
                              }`}
                            >
                              {Object.keys(groupedTasks).length === 0 ? (
                                <p className="text-center text-gray-600 text-sm py-8">
                                  Drag tasks here
                                </p>
                              ) : (
                                Object.entries(groupedTasks).map(([groupKey, groupData]) => {
                                  const { statusLabel, statusColor, categoryPath, categoryColor, tasks: groupTasks } = groupData;
                                  
                                  return (
                                    <div key={groupKey}>
                                      {/* Status Header */}
                                      <div 
                                        className="px-3 py-1.5 bg-gray-900/50 border-l-4 border-b"
                                        style={{ 
                                          borderLeftColor: statusColor,
                                          borderBottomColor: statusColor
                                        }}
                                      >
                                        <span 
                                          className="text-xs font-medium"
                                          style={{ color: statusColor }}
                                        >
                                          {statusLabel}
                                        </span>
                                      </div>
                                      
                                      {/* Category Header */}
                                      <div 
                                        className="px-3 py-1 bg-gray-800/30 border-l-2"
                                        style={{ borderLeftColor: categoryColor }}
                                      >
                                        <span 
                                          className="text-xs"
                                          style={{ color: categoryColor }}
                                        >
                                          {categoryPath}
                                        </span>
                                      </div>
                                      
                                      {/* Tasks in this group */}
                                      <div className="p-2 space-y-2">
                                        {groupTasks.map((task, index) => {
                                          const taskIndex = bucketTasks.findIndex(t => t.id === task.id);
                                          return (
                                            <Draggable key={task.id} draggableId={task.id} index={taskIndex}>
                                              {(provided, snapshot) => (
                                                <div
                                                  ref={provided.innerRef}
                                                  {...provided.draggableProps}
                                                  {...provided.dragHandleProps}
                                                  className={snapshot.isDragging ? 'opacity-50' : ''}
                                                >
                                                  <TaskCard
                                                    task={task}
                                                    categories={categories}
                                                    teamMembers={teamMembers}
                                                    onClick={() => setSelectedTask(task)}
                                                  />
                                                </div>
                                              )}
                                            </Draggable>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    </div>
                  );
                })}

                {/* Unassigned Tasks Column */}
                <div className="w-80 flex-shrink-0">
                  <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg overflow-hidden">
                    <div className="p-3 border-b-2 border-gray-600 bg-gray-800/50">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm text-gray-400">
                          Unassigned Tasks
                        </h3>
                        <span className="text-xs text-gray-500">
                          {unassignedTasks.length}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        Drag to assign to a bucket
                      </p>
                    </div>

                    <Droppable droppableId="unassigned">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`p-3 space-y-2 min-h-[200px] max-h-[600px] overflow-y-auto ${
                            snapshot.isDraggingOver ? 'bg-red-950/20' : ''
                          }`}
                        >
                          {unassignedTasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={snapshot.isDragging ? 'opacity-50' : ''}
                                >
                                  <TaskCard
                                    task={task}
                                    categories={categories}
                                    teamMembers={teamMembers}
                                    onClick={() => setSelectedTask(task)}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {unassignedTasks.length === 0 && (
                            <p className="text-center text-gray-600 text-sm py-8">
                              No unassigned tasks
                            </p>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                </div>
              </div>
            </div>
          </DragDropContext>
        )}
      </div>

      {showManageBuckets && (
        <ManageBucketsModal
          projectId={projectId}
          onClose={() => setShowManageBuckets(false)}
        />
      )}

      {showCreateTask && (
        <CreateTaskModal
          projectId={projectId}
          onClose={() => setShowCreateTask(false)}
        />
      )}

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectId={projectId}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}