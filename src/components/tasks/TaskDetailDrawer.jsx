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
import { CalendarIcon, Loader2, UserPlus, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TaskCommentsSection from "./TaskCommentsSection";
import TaskPartsSection from "./TaskPartsSection";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { getMobileInputClass, getMobileTextareaClass, getMobileSelectClass } from "@/components/mobile/MobileFormStyles";
import DeleteTaskConfirm from "./DeleteTaskConfirm";
import TaskActionFooter from "./TaskActionFooter";
import { TASK_CACHE_KEYS } from "./useTaskInteraction";

function ClientFeedbackLinks({ taskId }) {
  const navigate = useNavigate();
  
  const { data: feedbackLinks = [] } = useQuery({
    queryKey: ['taskFeedbackLinks', taskId],
    queryFn: () => base44.entities.ClientFeedbackTaskLink.filter({ task_id: taskId }),
    enabled: !!taskId,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['clientFeedbackRequests'],
    queryFn: () => base44.entities.ClientFeedbackRequest.list(),
    enabled: feedbackLinks.length > 0,
  });

  if (feedbackLinks.length === 0) return null;

  const linkedRequests = feedbackLinks.map(link => {
    const request = requests.find(r => r.id === link.feedback_request_id);
    return request ? { ...link, request } : null;
  }).filter(Boolean);

  if (linkedRequests.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-3">Client Feedback</h3>
      <div className="space-y-2">
        {linkedRequests.map(({ request, project_id }) => (
          <div key={request.id} className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">{request.title}</p>
              <p className="text-xs text-gray-400">Created from client approval</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${project_id}`)}
              className="text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const isMobile = useIsMobile();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
      // Use centralized cache keys
      TASK_CACHE_KEYS.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
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
      // Use centralized cache keys
      TASK_CACHE_KEYS.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
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

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    deleteMutation.mutate();
  }, [deleteMutation]);

  const handleAssignToMe = useCallback(() => {
    if (userTeamMember) {
      setFormData({ ...formData, assigned_team_member_id: userTeamMember.id });
    } else {
      toast.error('Could not find your team member profile');
    }
  }, [userTeamMember, formData]);

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
          <SheetTitle className="text-white text-xl">{task?.name}</SheetTitle>
          {project && (
            <p className="text-sm text-gray-400">Project: {project.name}</p>
          )}
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Task Details Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Task Details</h3>
            </div>

            {editing ? (
              <form className={isMobile ? "space-y-3" : "space-y-4"}>
                <div>
                  <Label className="text-gray-400">Task Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Task name"
                    className={getMobileInputClass(isMobile, "bg-gray-800 border-gray-700 text-white")}
                    required
                  />
                </div>

                <div>
                  <Label className="text-gray-400">Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Task description"
                    className={getMobileTextareaClass(isMobile, "bg-gray-800 border-gray-700 text-white min-h-[80px]")}
                  />
                </div>

                <div className={`grid grid-cols-2 ${isMobile ? 'gap-3' : 'gap-4'}`}>
                  <div>
                    <Label className="text-gray-400">Category</Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                    >
                      <SelectTrigger className={getMobileSelectClass(isMobile, "bg-gray-800 border-gray-700 text-white")}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {parentCategories.map(parent => {
                          const children = activeCategories.filter(c => c.parent_id === parent.id);
                          return (
                            <div key={parent.id} className="contents">
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
                            </div>
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
                      <SelectTrigger className={getMobileSelectClass(isMobile, "bg-gray-800 border-gray-700 text-white")}>
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
                    <SelectTrigger className={getMobileSelectClass(isMobile, "bg-gray-800 border-gray-700 text-white")}>
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

                <div className={`grid grid-cols-2 ${isMobile ? 'gap-3' : 'gap-4'}`}>
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
                    <p className="text-xs text-gray-500 mb-1">Status</p>
                    {status ? (
                      <Badge style={{ backgroundColor: status.color }} className="text-white">
                        {status.label}
                      </Badge>
                    ) : (
                      <p className="text-white">-</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Assigned To</p>
                    <p className="text-white">
                      {assignedMember ? `${assignedMember.full_name}${assignedMember.team_role ? ` (${assignedMember.team_role})` : ''}` : 'Unassigned'}
                    </p>
                  </div>
                </div>
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

          {/* Client Feedback Links */}
          <ClientFeedbackLinks taskId={task?.id} />

          {/* Associated Parts Section */}
          <TaskPartsSection task={task} project={project} />

          {/* Comments Section */}
          <TaskCommentsSection taskId={task?.id} />

        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteTaskConfirm
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
          taskName={task?.name}
          isLoading={deleteMutation.isPending}
        />

        {/* Unified Sticky Footer - Using TaskActionFooter */}
        <TaskActionFooter
          mode={editing ? 'edit' : 'view'}
          onEdit={() => setEditing(true)}
          onSave={handleSubmit}
          onClose={onClose}
          onDelete={handleDeleteClick}
          onCancel={() => {
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
          isSaving={updateMutation.isPending}
          isDeleting={deleteMutation.isPending}
        />
      </SheetContent>
    </Sheet>
  );
}