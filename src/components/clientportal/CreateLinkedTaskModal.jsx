import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ImageIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CreateLinkedTaskModal({ 
  open, 
  onClose, 
  projectId, 
  feedbackRequestId,
  feedbackRequestTitle,
  userId 
}) {
  const queryClient = useQueryClient();
  
  const [taskData, setTaskData] = useState({
    name: "",
    description: "",
    category_id: "",
    assigned_team_member_id: "",
    status_id: "",
    is_priority: false,
    due_date: ""
  });

  // Fetch categories, team members, and statuses
  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.filter({ active: true }),
    enabled: open
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.filter({ active: true }),
    enabled: open
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['taskStatuses'],
    queryFn: () => base44.entities.StatusList.filter({ scope: "Task", active: true }),
    enabled: open
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      // Create the task
      const newTask = await base44.entities.Task.create({
        name: taskData.name,
        description: taskData.description || `Linked from feedback request: ${feedbackRequestTitle}`,
        project_id: projectId,
        category_id: taskData.category_id || undefined,
        assigned_team_member_id: taskData.assigned_team_member_id || undefined,
        status_id: taskData.status_id || undefined,
        is_priority: taskData.is_priority,
        due_date: taskData.due_date || undefined
      });

      // Create the link between task and feedback request
      await base44.entities.ClientFeedbackTaskLink.create({
        project_id: projectId,
        task_id: newTask.id,
        feedback_request_id: feedbackRequestId,
        created_by_user_id: userId
      });

      return newTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created and linked to feedback request');
      handleClose();
    },
    onError: (error) => {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    }
  });

  const handleClose = () => {
    setTaskData({
      name: "",
      description: "",
      category_id: "",
      assigned_team_member_id: "",
      status_id: "",
      is_priority: false,
      due_date: ""
    });
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!taskData.name.trim()) {
      toast.error('Task name is required');
      return;
    }
    createTaskMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Linked Task</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-sm text-gray-400 bg-gray-800/50 rounded-lg p-3">
            This task will be linked to: <span className="text-white font-medium">{feedbackRequestTitle}</span>
          </div>

          <div>
            <Label className="text-gray-300">Task Name *</Label>
            <Input
              value={taskData.name}
              onChange={(e) => setTaskData({ ...taskData, name: e.target.value })}
              placeholder="Enter task name"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-gray-300">Description</Label>
            <Textarea
              value={taskData.description}
              onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
              placeholder="Enter task description (optional)"
              className="bg-gray-800 border-gray-700 text-white mt-1 min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300">Category</Label>
              <Select 
                value={taskData.category_id} 
                onValueChange={(val) => setTaskData({ ...taskData, category_id: val })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-300">Assignee</Label>
              <Select 
                value={taskData.assigned_team_member_id} 
                onValueChange={(val) => setTaskData({ ...taskData, assigned_team_member_id: val })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map(tm => (
                    <SelectItem key={tm.id} value={tm.id}>{tm.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300">Status</Label>
              <Select 
                value={taskData.status_id} 
                onValueChange={(val) => setTaskData({ ...taskData, status_id: val })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-300">Due Date</Label>
              <Input
                type="date"
                value={taskData.due_date}
                onChange={(e) => setTaskData({ ...taskData, due_date: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_priority"
              checked={taskData.is_priority}
              onCheckedChange={(checked) => setTaskData({ ...taskData, is_priority: checked })}
            />
            <Label htmlFor="is_priority" className="text-gray-300 cursor-pointer">
              Mark as Priority Task
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="border-gray-600 text-gray-200 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createTaskMutation.isPending || !taskData.name.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createTaskMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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