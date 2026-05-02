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
import { CalendarIcon, Loader2, UserPlus, ExternalLink, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TaskCommentsSection from "./TaskCommentsSection";
import ExecutionChecklistSection from "./ExecutionChecklistSection";
import TaskPartsSection from "./TaskPartsSection";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { getMobileInputClass, getMobileTextareaClass, getMobileSelectClass } from "@/components/mobile/MobileFormStyles";
import { TASK_CACHE_KEYS } from "./useTaskInteraction";
import CompleteTaskConfirm from "./CompleteTaskConfirm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

// Truncatable description — shows first 4 lines, expands on click
function DescriptionBlock({ text }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!text) return null;

  const lines = text.split('\n');
  const isLong = lines.length > 4 || text.length > 280;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">Description</p>
      <p
        className={`text-gray-300 text-sm whitespace-pre-wrap ${!expanded && isLong ? 'line-clamp-4' : ''}`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-blue-400 hover:text-blue-300 mt-1"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
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
    staleTime: 60000,
    retry: false,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
    staleTime: 60000,
    retry: false,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
    staleTime: 60000,
    retry: false,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 60000,
    retry: false,
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
      queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
      setShowDeleteConfirm(false);
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

  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const project = projects.find(p => p.id === task?.project_id);
  const category = categories.find(c => c.id === task?.category_id);
  const categoryPath = getCategoryPath(task?.category_id, categories);
  const categoryColor = category?.color;
  const status = statuses.find(s => s.id === task?.status_id);
  const assignedMember = teamMembers.find(m => m.id === task?.assigned_team_member_id);

  // Fetch checklist items for incomplete count in complete confirmation
  const { data: checklistItems = [] } = useQuery({
    queryKey: ['taskChecklistItems', 'task', task?.id],
    queryFn: () => base44.entities.TaskChecklistItem.filter({ task_id: task?.id }),
    enabled: !!task?.id,
    staleTime: 30000,
  });
  const incompleteChecklistCount = checklistItems.filter(i => !i.is_complete).length;

  // Find the "completed" status
  const completedStatus = useMemo(() =>
    statuses.find(s => s.scope === 'Task' && s.label?.toLowerCase().includes('complete') && s.active),
    [statuses]
  );

  const completeMutation = useMutation({
    mutationFn: () => base44.entities.Task.update(task.id, {
      status_id: completedStatus?.id,
      completed_date: new Date().toISOString(),
    }),
    onSuccess: () => {
      TASK_CACHE_KEYS.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      toast.success('Task completed');
      setShowCompleteConfirm(false);
      onClose();
    },
  });

  return (
    <>
    <Sheet 
      open={true} 
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !showDeleteConfirm) onClose();
      }} 
      modal={!showDeleteConfirm}
    >
      <SheetContent 
        className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col"
        onInteractOutside={(e) => {
          if (showDeleteConfirm) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (showDeleteConfirm) e.preventDefault();
        }}
      >
        {/* ── Slim header ── */}
        <SheetHeader className="pb-2 shrink-0">
          <SheetTitle className="text-white text-base font-semibold leading-tight">{task?.name}</SheetTitle>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {project && <span>{project.name}</span>}
            {assignedMember && (
              <>
                <span>•</span>
                <span>{assignedMember.full_name}</span>
              </>
            )}
            {task?.due_date && (
              <>
                <span>•</span>
                <span>{format(new Date(task.due_date), 'MMM d')}</span>
              </>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">

          {/* ── CHECKLIST — adaptive: full section if items exist, inline CTA if empty ── */}
          {checklistItems.length > 0 ? (
            <section className="mb-5">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Checklist</h3>
              <ExecutionChecklistSection taskId={task?.id} variant="full" />
            </section>
          ) : (
            <div className="mb-4">
              <ExecutionChecklistSection taskId={task?.id} variant="empty-cta" />
            </div>
          )}

          <hr className="border-gray-700/50 mb-5" />

          {/* ── TASK DETAILS ── */}
          <section className="mb-5">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Task Details</h3>
            {editing ? (
              <form className="space-y-4">
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-400">Category</Label>
                    <Select value={formData.category_id} onValueChange={(value) => setFormData({ ...formData, category_id: value })}>
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
                                  <span className="ml-4" style={{ color: child.color }}>→ {child.name}</span>
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
                    <Select value={formData.status_id} onValueChange={(value) => setFormData({ ...formData, status_id: value })}>
                      <SelectTrigger className={getMobileSelectClass(isMobile, "bg-gray-800 border-gray-700 text-white")}>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {taskStatuses.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-gray-400">Assign To</Label>
                    {userTeamMember && formData.assigned_team_member_id !== userTeamMember.id && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setFormData({ ...formData, assigned_team_member_id: userTeamMember.id })} className="border-gray-700 text-xs gap-1">
                        <UserPlus className="w-3 h-3" /> Assign to Me
                      </Button>
                    )}
                  </div>
                  <Select value={formData.assigned_team_member_id} onValueChange={(value) => setFormData({ ...formData, assigned_team_member_id: value })}>
                    <SelectTrigger className={getMobileSelectClass(isMobile, "bg-gray-800 border-gray-700 text-white")}>
                      <SelectValue placeholder="Assign to team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTeamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name} {m.team_role && `(${m.team_role})`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-400">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="w-full justify-start bg-gray-800 border-gray-700 text-white">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.start_date ? format(new Date(formData.start_date), 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={formData.start_date ? new Date(formData.start_date) : undefined} onSelect={(date) => setFormData({ ...formData, start_date: date ? format(date, 'yyyy-MM-dd') : '' })} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-gray-400">Due Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="w-full justify-start bg-gray-800 border-gray-700 text-white">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.due_date ? format(new Date(formData.due_date), 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={formData.due_date ? new Date(formData.due_date) : undefined} onSelect={(date) => setFormData({ ...formData, due_date: date ? format(date, 'yyyy-MM-dd') : '' })} />
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
                    {status ? <Badge style={{ backgroundColor: status.color }} className="text-white text-xs">{status.label}</Badge> : <p className="text-gray-400">-</p>}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Assigned To</p>
                    <p className="text-gray-200 text-sm">
                      {assignedMember ? `${assignedMember.full_name}${assignedMember.team_role ? ` (${assignedMember.team_role})` : ''}` : 'Unassigned'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Category</p>
                    <p style={{ color: categoryColor || '#9CA3AF' }} className="text-sm">{categoryPath || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Due Date</p>
                    <p className="text-gray-200 text-sm">
                      {task?.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '-'}
                    </p>
                  </div>
                </div>
                <DescriptionBlock text={task?.description} />
              </div>
            )}
          </section>

          {/* ── CLIENT FEEDBACK ── */}
          <ClientFeedbackLinks taskId={task?.id} />

          <hr className="border-gray-700/50 mb-5" />

          {/* ── PARTS ── */}
          <section className="mb-5">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Parts</h3>
            <TaskPartsSection task={task} project={project} />
          </section>

          <hr className="border-gray-700/50 mb-5" />

          {/* ── COMMENTS ── */}
          <section className="mb-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Comments</h3>
            <TaskCommentsSection taskId={task?.id} initialMaxVisible={2} />
          </section>

        </div>

        {/* ── Execution-first footer ── */}
        <div
          className="sticky bottom-0 left-0 right-0 bg-gray-900 border-t border-red-900/30 shrink-0"
          style={{
            padding: isMobile ? '12px 16px' : '16px',
            paddingBottom: isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : '16px',
          }}
        >
          {editing ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setFormData({
                    name: task.name || "", description: task.description || "",
                    project_id: task.project_id || projectId || "", category_id: task.category_id || "",
                    assigned_team_member_id: task.assigned_team_member_id || "", status_id: task.status_id || "",
                    start_date: task.start_date || "", due_date: task.due_date || "",
                  });
                }}
                className="flex-1 h-11 min-h-[44px] border-gray-700"
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={updateMutation.isPending}
                className="flex-1 h-11 min-h-[44px] bg-red-600 hover:bg-red-700"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
                className="h-11 min-h-[44px] px-4 border-gray-700 text-gray-300"
              >
                Edit
              </Button>
              <Button
                onClick={() => setShowCompleteConfirm(true)}
                disabled={!completedStatus}
                className="flex-1 h-11 min-h-[44px] bg-green-700 hover:bg-green-800 text-white gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Complete Task
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    {/* Complete Task Confirmation */}
    <CompleteTaskConfirm
      isOpen={showCompleteConfirm}
      onClose={() => setShowCompleteConfirm(false)}
      onConfirm={() => completeMutation.mutate()}
      taskName={task?.name}
      isLoading={completeMutation.isPending}
      incompleteChecklistCount={incompleteChecklistCount}
    />

    {/* Delete Confirmation */}
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent className="bg-gray-900 border-red-900/30 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Task?</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            Delete "{task?.name || 'this task'}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending} className="border-gray-700 text-white hover:bg-gray-800">Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleteMutation.isPending}
            onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Task'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}