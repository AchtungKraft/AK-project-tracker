import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
// Note: Select is still used for bucket dropdown below
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CalendarIcon, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useTaskCategories, useTaskStatuses, useAssignableTeamMembers } from "./useTaskDropdownData";
import { TaskCategorySelect, TaskStatusSelect, TaskAssigneeSelect } from "./TaskDropdownSelects";
import ProjectSelect from "@/components/shared/ProjectSelect";
import TimeEstimateInput from "./TimeEstimateInput";
import { invalidateProjectCaches } from "./useTaskInteraction";

export default function CreateTaskModal({ onClose, projectId, defaultAssigneeId, defaultBucketId, defaultIsPriority = false }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [taskData, setTaskData] = useState({
    name: "",
    description: "",
    project_id: projectId || "",
    category_id: "",
    assigned_team_member_id: defaultAssigneeId || "",
    status_id: "",
    kanban_bucket_id: defaultBucketId || "",
    start_date: "",
    due_date: "",
    is_priority: defaultIsPriority,
    estimated_hours: null,
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Use shared hooks for dropdown data
  const { categories } = useTaskCategories();
  const { statuses, defaultStatusId } = useTaskStatuses();
  const { teamMembers } = useAssignableTeamMembers();

  // Load buckets for the selected project
  const activeProjectId = taskData.project_id || projectId;
  const { data: projectBuckets = [] } = useQuery({
    queryKey: ['projectBuckets', activeProjectId],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: activeProjectId }),
    enabled: !!activeProjectId,
  });

  const { data: userTeamMember } = useQuery({
    queryKey: ['userTeamMember', user?.id],
    queryFn: () => base44.entities.TeamMember.filter({ user_id: user?.id }),
    select: (data) => data[0],
    enabled: !!user?.id,
  });

  // Auto-select default status when loaded
  useEffect(() => {
    if (defaultStatusId && !taskData.status_id) {
      setTaskData(prev => ({ ...prev, status_id: defaultStatusId }));
    }
  }, [defaultStatusId, taskData.status_id]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: (_result, variables) => {
      invalidateProjectCaches(queryClient, variables.project_id || projectId);
      toast({ title: 'Task created successfully' });
      onClose();
    },
    onError: () => {
      toast({ title: 'Failed to create task', variant: 'destructive' });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(taskData);
  };

  const handleAssignToMe = () => {
    if (userTeamMember) {
      setTaskData({ ...taskData, assigned_team_member_id: userTeamMember.id });
    } else {
      toast({ title: 'Could not find your team member profile', variant: 'destructive' });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create New Task</DialogTitle>
          <DialogDescription>
            Add a new task to the project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label className="text-gray-400">Task Name *</Label>
            <Input
              value={taskData.name}
              onChange={(e) => setTaskData({ ...taskData, name: e.target.value })}
              placeholder="Task name"
              className="bg-gray-800 border-gray-700 text-white"
              required
            />
          </div>

          <div>
            <Label className="text-gray-400">Description</Label>
            <Textarea
              value={taskData.description}
              onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
              placeholder="Task description"
              className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
            />
          </div>

          {!projectId && (
            <div>
              <Label className="text-gray-400">Project *</Label>
              <ProjectSelect
                value={taskData.project_id}
                onChange={(value) => setTaskData({ ...taskData, project_id: value })}
                placeholder="Select project"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Category</Label>
              <TaskCategorySelect
                value={taskData.category_id}
                onValueChange={(value) => setTaskData({ ...taskData, category_id: value })}
                categories={categories}
              />
            </div>

            <div>
              <Label className="text-gray-400">Status</Label>
              <TaskStatusSelect
                value={taskData.status_id}
                onValueChange={(value) => setTaskData({ ...taskData, status_id: value })}
                statuses={statuses}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-gray-400">Assign To</Label>
              {userTeamMember && taskData.assigned_team_member_id !== userTeamMember.id && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAssignToMe}
                  className="border-gray-700 text-xs gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  Assign to Me
                </Button>
              )}
            </div>
            <TaskAssigneeSelect
              value={taskData.assigned_team_member_id}
              onValueChange={(value) => setTaskData({ ...taskData, assigned_team_member_id: value })}
              teamMembers={teamMembers}
            />
          </div>

          {projectBuckets.length > 0 && (
            <div>
              <Label className="text-gray-400">Bucket (optional)</Label>
              <Select
                value={taskData.kanban_bucket_id}
                onValueChange={(value) => setTaskData({ ...taskData, kanban_bucket_id: value === "__none__" ? "" : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="No bucket" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No bucket</SelectItem>
                  {projectBuckets.sort((a, b) => (a.order || 0) - (b.order || 0)).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-gray-400">Estimated Time (hours)</Label>
            <TimeEstimateInput
              value={taskData.estimated_hours}
              onChange={(v) => setTaskData({ ...taskData, estimated_hours: v })}
              placeholder="e.g. 2.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {taskData.start_date ? format(new Date(taskData.start_date), 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={taskData.start_date ? new Date(taskData.start_date) : undefined}
                    onSelect={(date) => setTaskData({ ...taskData, start_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-gray-400">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {taskData.due_date ? format(new Date(taskData.due_date), 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={taskData.due_date ? new Date(taskData.due_date) : undefined}
                    onSelect={(date) => setTaskData({ ...taskData, due_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-red-600 hover:bg-red-700"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Task'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}