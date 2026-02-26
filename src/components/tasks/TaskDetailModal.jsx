import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Trash2, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function TaskDetailModal({ task, onClose, projectId }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    project_id: projectId || "",
    category_id: "",
    assigned_team_member_id: "",
    status_id: "",
    start_date: "",
    due_date: "",
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name || "",
        description: task.description || "",
        project_id: task.project_id || projectId || "",
        category_id: task.category_id || "",
        assigned_team_member_id: task.assigned_team_member_id || "",
        status_id: task.status_id || "",
        start_date: task.start_date || "",
        due_date: task.due_date || "",
      });
    }
  }, [task, projectId]);

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: userTeamMember } = useQuery({
    queryKey: ['userTeamMember', user?.id],
    queryFn: () => base44.entities.TeamMember.filter({ user_id: user?.id }),
    select: (data) => data[0],
    enabled: !!user?.id,
  });

  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
  const activeCategories = categories.filter(c => c.active);
  const activeTeamMembers = teamMembers.filter(tm => tm.active);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.update(task.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      toast.success('Task updated successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to update task');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Task.delete(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
      }
      toast.success('Task deleted successfully');
      setConfirmOpen(false);
      onClose();
    },
    onError: () => {
      toast.error('Failed to delete task');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleDelete = () => {
    setConfirmOpen(true);
  };

  const handleAssignToMe = () => {
    if (userTeamMember) {
      setFormData({ ...formData, assigned_team_member_id: userTeamMember.id });
    } else {
      toast.error('Could not find your team member profile');
    }
  };

  return (
    <>
      {/* modal={false} when confirm is open to prevent focus trap blocking AlertDialog */}
      <Dialog open onOpenChange={onClose} modal={!confirmOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Task Details</DialogTitle>
            <DialogDescription>
              View and edit task information.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <Label>Task Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Task name"
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Task description"
                className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status_id}
                  onValueChange={(value) => setFormData({ ...formData, status_id: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {taskStatuses.map(status => (
                      <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Assign To</Label>
                {userTeamMember && formData.assigned_team_member_id !== userTeamMember.id && (
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
              <Select
                value={formData.assigned_team_member_id}
                onValueChange={(value) => setFormData({ ...formData, assigned_team_member_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Assign to team member" />
                </SelectTrigger>
                <SelectContent>
                  {activeTeamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name} {member.team_role && `(${member.team_role})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.start_date ? format(new Date(formData.start_date), 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.start_date ? new Date(formData.start_date) : undefined}
                      onSelect={(date) => setFormData({ ...formData, start_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                    >
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
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-gray-700">
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Task
                    </>
                  )}
                </Button>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-red-600 hover:bg-red-700"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="w-full border-gray-700"
              >
                Close
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog as sibling - Radix handles stacking correctly */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-gray-900 border-red-900/30 text-white z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Delete "{task?.name || 'this task'}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={deleteMutation.isPending}
              className="border-gray-700 text-white hover:bg-gray-800"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Task'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}