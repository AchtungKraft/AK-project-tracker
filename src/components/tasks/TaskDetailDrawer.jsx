import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Loader2, Trash2, UserPlus, Save } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import TaskCommentsSection from "./TaskCommentsSection";

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

export default function TaskDetailDrawer({ task, onClose, projectId }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: userTeamMember } = useQuery({
    queryKey: ['userTeamMember', user?.id],
    queryFn: () => base44.entities.TeamMember.filter({ user_id: user?.id }),
    select: (data) => data[0],
    enabled: !!user?.id,
  });

  const taskStatuses = useMemo(() => 
    statuses.filter(s => s.scope === 'Task' && s.active),
    [statuses]
  );
  
  const activeCategories = useMemo(() => 
    categories.filter(c => c.active),
    [categories]
  );
  
  const parentCategories = useMemo(() => 
    activeCategories.filter(c => !c.parent_id),
    [activeCategories]
  );
  
  const activeTeamMembers = useMemo(() => 
    teamMembers.filter(tm => tm.active),
    [teamMembers]
  );

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.update(task.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      setEditing(false);
      toast.success('Task updated successfully');
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
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      toast.success('Task deleted successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to delete task');
    },
  });

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  }, [formData, updateMutation]);

  const handleDelete = useCallback(() => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteMutation.mutate();
    }
  }, [deleteMutation]);

  const handleAssignToMe = useCallback(() => {
    if (userTeamMember) {
      const newData = { assigned_team_member_id: userTeamMember.id };
      updateMutation.mutate(newData);
    } else {
      toast.error('Could not find your team member profile');
    }
  }, [userTeamMember, updateMutation]);

  // Quick update handlers for status and assignment
  const handleQuickStatusChange = useCallback((newStatusId) => {
    updateMutation.mutate({ status_id: newStatusId });
  }, [updateMutation]);

  const handleQuickAssignmentChange = useCallback((newMemberId) => {
    updateMutation.mutate({ assigned_team_member_id: newMemberId });
  }, [updateMutation]);

  const project = projects.find(p => p.id === task?.project_id);
  const category = categories.find(c => c.id === task?.category_id);
  const categoryPath = getCategoryPath(task?.category_id, categories);
  const categoryColor = category?.color;
  const status = statuses.find(s => s.id === task?.status_id);
  const assignedMember = teamMembers.find(m => m.id === task?.assigned_team_member_id);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="border-b border-gray-700 pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white text-xl">{task?.name}</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          {project && (
            <p className="text-sm text-gray-400">Project: {project.name}</p>
          )}
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Quick Actions - Status and Assignment */}
          {!editing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div>
                <Label className="text-xs text-gray-400 mb-2 block">Status</Label>
                <Select
                  value={task?.status_id}
                  onValueChange={handleQuickStatusChange}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {taskStatuses.map(status => (
                      <SelectItem key={status.id} value={status.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: status.color }}
                          />
                          {status.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-gray-400">Assigned To</Label>
                  {userTeamMember && task?.assigned_team_member_id !== userTeamMember.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleAssignToMe}
                      disabled={updateMutation.isPending}
                      className="text-xs gap-1 h-6 text-red-400 hover:text-red-300"
                    >
                      <UserPlus className="w-3 h-3" />
                      Me
                    </Button>
                  )}
                </div>
                <Select
                  value={task?.assigned_team_member_id || "unassigned"}
                  onValueChange={(value) => handleQuickAssignmentChange(value === "unassigned" ? "" : value)}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Assign to team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {activeTeamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name} {member.team_role && `(${member.team_role})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Task Details Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Task Details</h3>
              {!editing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="border-gray-700 text-white"
                >
                  Edit Details
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(false);
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
                    }}
                    className="border-gray-700 text-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={updateMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {editing ? (
              <form className="space-y-4">
                <div>
                  <Label className="text-gray-400">Task Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Task name"
                    className="bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>

                <div>
                  <Label className="text-gray-400">Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Task description"
                    className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-400">Category</Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {parentCategories.map(parent => {
                          const children = activeCategories.filter(c => c.parent_id === parent.id);
                          return (
                            <React.Fragment key={parent.id}>
                              <SelectItem value={parent.id}>
                                <span style={{ color: parent.color }}>{parent.name}</span>
                              </SelectItem>
                              {children.map(child => (
                                <SelectItem key={child.id} value={child.id}>
                                  <span className="ml-4" style={{ color: child.color }}>
                                    → {child.name}
                                  </span>
                                </SelectItem>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-gray-400">Status</Label>
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
                    <Label className="text-gray-400">Assign To</Label>
                    {userTeamMember && formData.assigned_team_member_id !== userTeamMember.id && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, assigned_team_member_id: userTeamMember.id })}
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
                    <Label className="text-gray-400">Due Date</Label>
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
              </form>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Category</p>
                    <p style={{ color: categoryColor || '#FFFFFF' }}>{categoryPath || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Due Date</p>
                    <p className="text-white">
                      {task?.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '-'}
                    </p>
                  </div>
                </div>
                {task?.description && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Description</p>
                    <p className="text-white whitespace-pre-wrap">{task.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator className="bg-gray-700" />

          {/* Comments Section */}
          <TaskCommentsSection taskId={task?.id} />

          <Separator className="bg-gray-700" />

          {/* Delete Action */}
          <div className="pt-4">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="w-full"
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
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}