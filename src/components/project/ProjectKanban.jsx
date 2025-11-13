import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [groupBy, setGroupBy] = useState('buckets');
  const [subGroupBy, setSubGroupBy] = useState('status');

  const { data: buckets = [], isLoading: bucketsLoading } = useQuery({
    queryKey: ['kanbanBuckets', projectId],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: projectId }),
  });

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
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

  // Filter out completed tasks from Kanban view
  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
  const completedStatus = taskStatuses.find(s => {
    const label = s.label.toLowerCase();
    return label.includes('complete') || label.includes('done');
  });
  const tasks = allTasks.filter(t => t.status_id !== completedStatus?.id);

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }) => base44.entities.Task.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    },
  });

  const handleToggleComplete = (task) => {
    // Look for completed status - try multiple patterns
    const completedStatus = taskStatuses.find(s => {
      const label = s.label.toLowerCase();
      return label.includes('complete') || label.includes('done') || label === 'completed' || label === 'done';
    });
    
    const todoStatus = taskStatuses.find(s => {
      const label = s.label.toLowerCase();
      return label.includes('to do') || label === 'todo' || label === 'to-do';
    });
    
    if (!completedStatus) {
      toast.error('No completed status found. Please create a status like "Done" or "Completed".');
      return;
    }

    const currentStatus = statuses.find(s => s.id === task.status_id);
    const isCurrentlyCompleted = currentStatus && (
      currentStatus.label.toLowerCase().includes('complete') || 
      currentStatus.label.toLowerCase().includes('done') ||
      currentStatus.id === completedStatus.id
    );
    
    const newStatusId = isCurrentlyCompleted ? (todoStatus?.id || taskStatuses[0]?.id) : completedStatus.id;
    
    // Add completed_date when marking as complete, remove when reopening
    const updateData = {
      status_id: newStatusId,
      completed_date: isCurrentlyCompleted ? null : new Date().toISOString()
    };
    
    updateTaskMutation.mutate({
      taskId: task.id,
      data: updateData
    });
    
    toast.success(isCurrentlyCompleted ? 'Task reopened' : 'Task completed');
  };

  const sortedBuckets = [...buckets].sort((a, b) => (a.order || 0) - (b.order || 0));

  // Primary grouping logic (when not using buckets)
  const getPrimaryGroups = () => {
    if (groupBy === 'buckets') {
      // Group by bucket based on kanban_bucket_id
      const tasksByBucket = {};
      const unassignedTasks = [];

      sortedBuckets.forEach(bucket => {
        tasksByBucket[bucket.id] = tasks.filter(t => t.kanban_bucket_id === bucket.id);
      });

      const bucketIds = sortedBuckets.map(b => b.id);
      unassignedTasks.push(...tasks.filter(t => !t.kanban_bucket_id || !bucketIds.includes(t.kanban_bucket_id)));

      return { mode: 'buckets', tasksByBucket, unassignedTasks };
    }

    // Primary grouping by status, assigned, or category
    const grouped = {};
    
    tasks.forEach(task => {
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
        groupLabel = getCategoryPath(task.category_id, categories) || 'No Category';
        groupColor = category?.color || '#6B7280';
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          id: groupKey,
          label: groupLabel,
          color: groupColor,
          tasks: []
        };
      }
      
      grouped[groupKey].tasks.push(task);
    });

    return { mode: 'primary', groups: Object.values(grouped) };
  };

  const groupingData = getPrimaryGroups();

  // Helper function to group tasks within a bucket based on subGroupBy setting (single-level)
  const groupTasksWithinBucket = (bucketTasks) => {
    const grouped = {};
    
    bucketTasks.forEach(task => {
      let groupKey, groupLabel, groupColor;
      
      if (subGroupBy === 'status') {
        const status = statuses.find(s => s.id === task.status_id);
        groupKey = task.status_id || 'no-status';
        groupLabel = status?.label || 'No Status';
        groupColor = status?.color || '#6B7280';
      } else if (subGroupBy === 'assigned') {
        const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
        groupKey = task.assigned_team_member_id || 'unassigned';
        groupLabel = member?.full_name || 'Unassigned';
        groupColor = '#6B7280';
      } else if (subGroupBy === 'category') {
        const category = categories.find(c => c.id === task.category_id);
        groupKey = task.category_id || 'no-category';
        groupLabel = getCategoryPath(task.category_id, categories) || 'No Category';
        groupColor = category?.color || '#6B7280';
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          label: groupLabel,
          color: groupColor,
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
    
    if (groupBy === 'buckets') {
      // Bucket mode - update kanban_bucket_id
      if (destination.droppableId !== 'unassigned') {
        const targetBucket = sortedBuckets.find(b => b.id === destination.droppableId);
        if (targetBucket) {
          updateTaskMutation.mutate({
            taskId,
            data: { kanban_bucket_id: targetBucket.id }
          });
        }
      } else {
        updateTaskMutation.mutate({
          taskId,
          data: { kanban_bucket_id: "" }
        });
      }
    } else {
      // Primary grouping mode - update the corresponding field
      const targetGroupId = destination.droppableId;
      
      if (groupBy === 'status') {
        updateTaskMutation.mutate({
          taskId,
          data: { status_id: targetGroupId === 'no-status' ? '' : targetGroupId }
        });
      } else if (groupBy === 'assigned') {
        updateTaskMutation.mutate({
          taskId,
          data: { assigned_team_member_id: targetGroupId === 'unassigned' ? '' : targetGroupId }
        });
      } else if (groupBy === 'category') {
        updateTaskMutation.mutate({
          taskId,
          data: { category_id: targetGroupId === 'no-category' ? '' : targetGroupId }
        });
      }
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Task Groups</h2>
              <p className="text-sm text-gray-400 hidden md:block">Drag tasks to organize</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buckets">Custom Buckets</SelectItem>
                <SelectItem value="status">Group by Status</SelectItem>
                <SelectItem value="assigned">Group by Assigned</SelectItem>
                <SelectItem value="category">Group by Category</SelectItem>
              </SelectContent>
            </Select>
            {groupBy === 'buckets' && (
              <Select value={subGroupBy} onValueChange={setSubGroupBy}>
                <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Sub: Status</SelectItem>
                  <SelectItem value="assigned">Sub: Assigned</SelectItem>
                  <SelectItem value="category">Sub: Category</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              onClick={() => setShowCreateTask(true)}
              size="sm"
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Task</span>
              <span className="sm:hidden">New</span>
            </Button>
            {groupBy === 'buckets' && (
              <Button
                onClick={() => setShowManageBuckets(true)}
                size="sm"
                variant="outline"
                className="border-gray-700 gap-2"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Manage Buckets</span>
                <span className="sm:hidden">Manage</span>
              </Button>
            )}
          </div>
        </div>

        {groupBy === 'buckets' && sortedBuckets.length === 0 ? (
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
            <div className="pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupingData.mode === 'buckets' ? (
                  <>
                    {/* Kanban Buckets Mode */}
                    {sortedBuckets.map(bucket => {
                      const bucketTasks = groupingData.tasksByBucket[bucket.id] || [];
                      const groupedTasks = groupTasksWithinBucket(bucketTasks);
                  
                  return (
                    <div key={bucket.id} className="w-full">
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
                                      {/* Group Header */}
                                      <div 
                                        className="px-3 py-1.5 bg-gray-900/50 border-l-4 border-b"
                                        style={{ 
                                          borderLeftColor: groupData.color,
                                          borderBottomColor: groupData.color
                                        }}
                                      >
                                        <span 
                                          className="text-xs font-medium"
                                          style={{ color: groupData.color }}
                                        >
                                          {groupData.label}
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
                                                    statuses={statuses}
                                                    onToggleComplete={handleToggleComplete}
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
                    <div className="w-full">
                      <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg overflow-hidden">
                        <div className="p-3 border-b-2 border-gray-600 bg-gray-800/50">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm text-gray-400">
                              Unassigned Tasks
                            </h3>
                            <span className="text-xs text-gray-500">
                              {groupingData.unassignedTasks.length}
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
                              {groupingData.unassignedTasks.map((task, index) => (
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
                                        statuses={statuses}
                                        onToggleComplete={handleToggleComplete}
                                        onClick={() => setSelectedTask(task)}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                              {groupingData.unassignedTasks.length === 0 && (
                                <p className="text-center text-gray-600 text-sm py-8">
                                  No unassigned tasks
                                </p>
                              )}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Primary Grouping Mode (Status/Assigned/Category) */}
                    {groupingData.groups.map(group => {
                      const completedStatus = taskStatuses.find(s => s.label.toLowerCase().includes('complete'));
                      const activeTasks = group.tasks.filter(t => t.status_id !== completedStatus?.id);
                      const completedTasks = group.tasks.filter(t => t.status_id === completedStatus?.id);
                      
                      return (
                        <div key={group.id} className="w-full">
                          <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg overflow-hidden">
                            {/* Group Header */}
                            <div
                              className="p-3 border-b-2"
                              style={{
                                borderBottomColor: group.color,
                                backgroundColor: `${group.color}15`
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <h3
                                  className="font-semibold text-sm"
                                  style={{ color: group.color }}
                                >
                                  {group.label}
                                </h3>
                                <span className="text-xs text-gray-400">
                                  {group.tasks.length}
                                </span>
                              </div>
                            </div>

                            {/* Active Tasks */}
                            <Droppable droppableId={group.id}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className={`min-h-[150px] max-h-[400px] overflow-y-auto ${
                                    snapshot.isDraggingOver ? 'bg-red-950/20' : ''
                                  }`}
                                >
                                  {activeTasks.length === 0 ? (
                                    <p className="text-center text-gray-600 text-sm py-8">
                                      Drag tasks here
                                    </p>
                                  ) : (
                                    <div className="p-3 space-y-2">
                                      {activeTasks.map((task, index) => (
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
                                                statuses={statuses}
                                                onToggleComplete={handleToggleComplete}
                                                onClick={() => setSelectedTask(task)}
                                              />
                                            </div>
                                          )}
                                        </Draggable>
                                      ))}
                                    </div>
                                  )}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>

                            {/* Completed Section */}
                            {completedTasks.length > 0 && (
                              <div className="border-t-2 border-green-900/30 bg-gray-900/30">
                                <div className="px-3 py-2 bg-green-950/20">
                                  <span className="text-xs text-green-400 font-medium">
                                    ✓ Completed ({completedTasks.length})
                                  </span>
                                </div>
                                <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
                                  {completedTasks.map((task) => (
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
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
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