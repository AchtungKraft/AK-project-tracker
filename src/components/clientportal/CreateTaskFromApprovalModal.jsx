import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useTaskCategories, useTaskStatuses, useAssignableTeamMembers } from "../tasks/useTaskDropdownData";
import { TaskCategorySelect, TaskStatusSelect, TaskAssigneeSelect } from "../tasks/TaskDropdownSelects";

export default function CreateTaskFromApprovalModal({ open, onClose, projectId, requestId, requestTitle, approval, userId }) {
  const queryClient = useQueryClient();

  // Use shared hooks for dropdown data — gated by open prop
  const { categories } = useTaskCategories(open);
  const { statuses, defaultStatusId } = useTaskStatuses(open);
  const { teamMembers } = useAssignableTeamMembers(open);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_id: projectId,
    status_id: '',
    category_id: '',
    assigned_team_member_id: '',
    due_date: '',
  });

  // Auto-select default status when loaded
  useEffect(() => {
    if (defaultStatusId && !formData.status_id) {
      setFormData(prev => ({ ...prev, status_id: defaultStatusId }));
    }
  }, [defaultStatusId, formData.status_id]);

  useEffect(() => {
    if (open && requestTitle) {
      const approvalNote = approval?.note ? `\n\nApproval Note: ${approval.note}` : '';
      
      setFormData(prev => ({
        ...prev,
        name: `[Client Approved] ${requestTitle}`,
        description: `Created from approved client feedback request.${approvalNote}`,
      }));
    }
  }, [open, requestTitle, approval]);

  const createTaskMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: async (task) => {
      await base44.entities.ClientFeedbackTaskLink.create({
        project_id: projectId,
        task_id: task.id,
        feedback_request_id: requestId,
        feedback_attachment_id: approval?.target_attachment_id || null,
        created_by_user_id: userId,
      });

      queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail', requestId, projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created from approval');
      onClose();
    },
    onError: () => {
      toast.error('Failed to create task');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createTaskMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Task from Approval</DialogTitle>
          <DialogDescription>
            Create a task from this client-approved feedback request.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Task Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white"
              required
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white min-h-[120px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <TaskStatusSelect
                value={formData.status_id}
                onValueChange={(value) => setFormData({ ...formData, status_id: value })}
                statuses={statuses}
              />
            </div>

            <div>
              <Label>Category</Label>
              <TaskCategorySelect
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                categories={categories}
              />
            </div>
          </div>

          <div>
            <Label>Assign To</Label>
            <TaskAssigneeSelect
              value={formData.assigned_team_member_id}
              onValueChange={(value) => setFormData({ ...formData, assigned_team_member_id: value })}
              teamMembers={teamMembers}
            />
          </div>

          <div>
            <Label>Due Date (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start bg-gray-800 border-gray-700 text-white">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.due_date ? format(new Date(formData.due_date), 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.due_date ? new Date(formData.due_date) : undefined}
                  onSelect={(date) => setFormData({ ...formData, due_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button type="submit" disabled={createTaskMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {createTaskMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}