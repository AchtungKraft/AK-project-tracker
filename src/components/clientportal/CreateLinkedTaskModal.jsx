import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ImageIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTaskCategories, useTaskStatuses, useAssignableTeamMembers } from "../tasks/useTaskDropdownData";
import { TaskCategorySelect, TaskStatusSelect, TaskAssigneeSelect } from "../tasks/TaskDropdownSelects";

export default function CreateLinkedTaskModal({ 
  open, 
  onClose, 
  projectId, 
  feedbackRequestId,
  feedbackRequestTitle,
  feedbackAttachments = [],
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
  const [selectedImageUrls, setSelectedImageUrls] = useState([]);

  // Use shared hooks for dropdown data
  const { categories } = useTaskCategories(open);
  const { statuses, defaultStatusId } = useTaskStatuses(open);
  const { teamMembers } = useAssignableTeamMembers(open);

  // Auto-select default status when loaded
  useEffect(() => {
    if (defaultStatusId && !taskData.status_id) {
      setTaskData(prev => ({ ...prev, status_id: defaultStatusId }));
    }
  }, [defaultStatusId, taskData.status_id]);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const description = taskData.description || `Linked from feedback request: ${feedbackRequestTitle}`;

      const newTask = await base44.entities.Task.create({
        name: taskData.name,
        description,
        project_id: projectId,
        category_id: taskData.category_id || undefined,
        assigned_team_member_id: taskData.assigned_team_member_id || undefined,
        status_id: taskData.status_id || undefined,
        is_priority: taskData.is_priority,
        due_date: taskData.due_date || undefined
      });

      await base44.entities.ClientFeedbackTaskLink.create({
        project_id: projectId,
        task_id: newTask.id,
        feedback_request_id: feedbackRequestId,
        created_by_user_id: userId
      });

      if (selectedImageUrls.length > 0) {
        await base44.entities.TaskComment.create({
          task_id: newTask.id,
          content: `Reference images from feedback request: "${feedbackRequestTitle}"`,
          photos: selectedImageUrls
        });
      }

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
    setSelectedImageUrls([]);
    onClose();
  };

  const imageAttachments = feedbackAttachments.filter(a => a.attachment_type === 'image' && a.file_url);

  const toggleImageSelection = (url) => {
    setSelectedImageUrls(prev => 
      prev.includes(url) 
        ? prev.filter(u => u !== url)
        : [...prev, url]
    );
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
          <DialogDescription>
            Create a task linked to this feedback request.
          </DialogDescription>
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
              <TaskCategorySelect
                value={taskData.category_id}
                onValueChange={(val) => setTaskData({ ...taskData, category_id: val })}
                categories={categories}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Assignee</Label>
              <TaskAssigneeSelect
                value={taskData.assigned_team_member_id}
                onValueChange={(val) => setTaskData({ ...taskData, assigned_team_member_id: val })}
                teamMembers={teamMembers}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300">Status</Label>
              <TaskStatusSelect
                value={taskData.status_id}
                onValueChange={(val) => setTaskData({ ...taskData, status_id: val })}
                statuses={statuses}
                className="mt-1"
              />
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

          {imageAttachments.length > 0 && (
            <div>
              <Label className="text-gray-300 flex items-center gap-2 mb-2">
                <ImageIcon className="w-4 h-4" />
                Attach Images from Feedback Request ({selectedImageUrls.length} selected)
              </Label>
              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-800/50 rounded-lg">
                {imageAttachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => toggleImageSelection(attachment.file_url)}
                    className={cn(
                      "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                      selectedImageUrls.includes(attachment.file_url)
                        ? "border-blue-500 ring-2 ring-blue-500/50"
                        : "border-gray-700 hover:border-gray-500"
                    )}
                  >
                    <img 
                      src={attachment.file_url} 
                      alt="" 
                      className="w-full h-full object-cover"
                    />
                    {selectedImageUrls.includes(attachment.file_url) && (
                      <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center">
                        <div className="bg-blue-500 rounded-full p-1">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

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