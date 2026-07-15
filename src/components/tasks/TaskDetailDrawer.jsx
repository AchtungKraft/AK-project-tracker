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
import { CalendarIcon, Loader2, UserPlus, ExternalLink, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TaskCommentsSection from "./TaskCommentsSection";
import ExecutionChecklistSection from "./ExecutionChecklistSection";
import TaskPartsSection from "./TaskPartsSection";
import TaskKnowledgeSection from "@/components/knowledge/TaskKnowledgeSection";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { getMobileInputClass, getMobileTextareaClass, getMobileSelectClass } from "@/components/mobile/MobileFormStyles";
import { TASK_CACHE_KEYS, invalidateProjectCaches } from "./useTaskInteraction";
import { useTaskInteractionContext } from "./TaskInteractionProvider";
import TaskCompletionModal from "./TaskCompletionModal";
import TimeEstimateInput, { formatHours } from "./TimeEstimateInput";
import OperationalStateBadge from "@/components/workflow/OperationalStateBadge";
import TaskDependencyEditor from "@/components/workflow/TaskDependencyEditor";
import PhaseSelectorPopover from "@/components/workload/PhaseSelectorPopover";
import { TooltipProvider } from "@/components/ui/tooltip";
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

// Description block — inline under title, no section header
function DescriptionBlock({ text }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!text) return null;

  const lines = text.split('\n');
  const isLong = lines.length > 4 || text.length > 280;

  return (
    <div className="mt-[2px]">
      <p
        className={`text-gray-300 text-[16px] leading-snug whitespace-pre-wrap ${!expanded && isLong ? 'line-clamp-4' : ''}`}
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
  // CANONICAL: Use provider if available for completions
  const taskInteraction = useTaskInteractionContext();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    project_id: projectId || "",
    category_id: "",
    kanban_bucket_id: "",
    assigned_team_member_id: "",
    status_id: "",
    start_date: "",
    due_date: "",
    estimated_hours: null,
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
        kanban_bucket_id: task.kanban_bucket_id || "",
        assigned_team_member_id: task.assigned_team_member_id || "",
        status_id: task.status_id || "",
        start_date: task.start_date || "",
        due_date: task.due_date || "",
        estimated_hours: task.estimated_hours ?? null,
      });
      // Reset live deps when task changes (new task opened)
      setLiveDeps(null);
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
      invalidateProjectCaches(queryClient, task?.project_id || projectId);
      setEditing(false);
      toast({ title: 'Task updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update task', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Task.delete(task.id),
    onSuccess: () => {
      invalidateProjectCaches(queryClient, task?.project_id || projectId);
      setShowDeleteConfirm(false);
      toast({ title: 'Task deleted successfully' });
      onClose();
    },
    onError: () => {
      toast({ title: 'Failed to delete task', variant: 'destructive' });
    },
  });

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    // CANONICAL: Intercept status change to "completed" — route through completion flow
    if (taskInteraction?.isCompletedStatusId && formData.status_id !== task?.status_id && taskInteraction.isCompletedStatusId(formData.status_id)) {
      taskInteraction.beginTaskCompletion(task);
      setEditing(false);
      return;
    }
    updateMutation.mutate({
      ...formData,
      kanban_bucket_id: formData.kanban_bucket_id || null,
    });
  }, [formData, updateMutation, task, taskInteraction]);

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
      toast({ title: 'Could not find your team member profile', variant: 'destructive' });
    }
  }, [userTeamMember, formData]);

  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  // Live dependency state — initialized from task, updated optimistically on save
  const [liveDeps, setLiveDeps] = useState(null);
  const liveDepsResolved = liveDeps ?? (task?.dependencies || []);

  // Fetch all project tasks + buckets for dependency editor
  const { data: allProjectTasks = [] } = useQuery({
    queryKey: ['projectTasks', task?.project_id],
    queryFn: () => base44.entities.Task.filter({ project_id: task?.project_id }),
    enabled: !!task?.project_id,
    staleTime: 30000,
  });
  const { data: projectBuckets = [] } = useQuery({
    queryKey: ['projectBuckets', task?.project_id],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: task?.project_id }),
    enabled: !!task?.project_id,
    staleTime: 60000,
  });

  // Dependency save handler — optimistically updates UI, persists, handles errors
  const depMutation = useMutation({
    mutationFn: (newDeps) => base44.entities.Task.update(task.id, { dependencies: newDeps }),
    onMutate: (newDeps) => {
      // Optimistic: show the new deps immediately
      setLiveDeps(newDeps);
    },
    onSuccess: () => {
      invalidateProjectCaches(queryClient, task?.project_id);
    },
    onError: (err, newDeps, context) => {
      // Rollback: revert to what was there before
      setLiveDeps(null);
      toast({ title: 'Failed to save dependency', variant: 'destructive' });
    },
  });

  const handleDependencyChange = useCallback((newDeps) => {
    depMutation.mutate(newDeps);
  }, [depMutation]);

  // Pre-compute dependency data for mobile conditional rendering
  const selectedTasks = useMemo(() =>
    liveDepsResolved.map(id => allProjectTasks.find(t => t.id === id)).filter(Boolean),
    [liveDepsResolved, allProjectTasks]
  );
  const successorTasks = useMemo(() =>
    allProjectTasks.filter(t => t.id !== task?.id && t.dependencies?.includes(task?.id)),
    [allProjectTasks, task?.id]
  );

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
    mutationFn: (actualHours) => {
      const updates = {
        status_id: completedStatus?.id,
        completed_date: new Date().toISOString(),
      };
      if (actualHours != null) updates.actual_hours = actualHours;
      return base44.entities.Task.update(task.id, updates);
    },
    onSuccess: () => {
      invalidateProjectCaches(queryClient, task?.project_id || projectId);
      toast({ title: 'Task completed' });
      setShowCompleteConfirm(false);
      onClose();
    },
  });

  return (
    <TooltipProvider>
    <>
    <Sheet 
      open={true} 
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !showDeleteConfirm) {
          // Refresh checklist data in all parent views when drawer closes
          queryClient.invalidateQueries({ queryKey: ['taskChecklistItems'] });
          queryClient.invalidateQueries({ queryKey: ['executionChecklist'] });
          queryClient.invalidateQueries({ queryKey: ['projectChecklistItems'] });
          queryClient.invalidateQueries({ queryKey: ['workloadChecklists'] });
          onClose();
        }
      }} 
      modal={!showDeleteConfirm}
    >
      <SheetContent 
        className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto overflow-x-hidden flex flex-col"
        onInteractOutside={(e) => {
          if (showDeleteConfirm) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (showDeleteConfirm) e.preventDefault();
        }}
      >
        {/* ── HEADER BLOCK: execution-first on mobile ── */}
        <SheetHeader className="pb-0 shrink-0 space-y-0">
          {!editing && isMobile ? (
            /* ── MOBILE: execution-first structured metadata ── */
            <>
              {/* Status + Operational State — top line */}
              <div className="flex items-center gap-2 mb-1">
                {status && (
                  <Badge style={{ backgroundColor: status.color }} className="text-white text-xs px-2 py-0.5 h-5">{status.label}</Badge>
                )}
                {task?.operational_state && (
                  <OperationalStateBadge
                    state={task.operational_state}
                    blockingReasons={task.blocking_reasons || []}
                    isOverride={!!task.manual_override}
                  />
                )}
              </div>
              {/* Task Name — dominant */}
              <SheetTitle className="text-white text-lg font-bold leading-tight">{task?.name}</SheetTitle>
              {/* Structured metadata rows */}
              <div className="mt-2 space-y-1">
                {project && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider w-16 shrink-0">Project</span>
                    <span className="text-sm text-gray-200 truncate text-right flex-1 min-w-0">{project.name}</span>
                  </div>
                )}
                {(() => {
                  const bucket = projectBuckets.find(b => b.id === task?.kanban_bucket_id);
                  return bucket ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider w-16 shrink-0">Phase</span>
                      <span className="text-sm text-gray-200 truncate text-right flex-1 min-w-0">{bucket.name}</span>
                    </div>
                  ) : null;
                })()}
                {assignedMember && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider w-16 shrink-0">Assignee</span>
                    <span className="text-sm text-gray-200 text-right">{assignedMember.full_name}</span>
                  </div>
                )}
                {task?.due_date && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider w-16 shrink-0">Due</span>
                    <span className="text-sm text-gray-200 text-right">{format(new Date(task.due_date), 'MMM d, yyyy')}</span>
                  </div>
                )}
                {(task?.estimated_hours || task?.actual_hours) && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider w-16 shrink-0">Time</span>
                    <span className="text-sm text-gray-200 flex items-center gap-2">
                      {task.estimated_hours && <span>Est: {formatHours(task.estimated_hours)}</span>}
                      {task.actual_hours && <span>Actual: {formatHours(task.actual_hours)}</span>}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : !editing ? (
            /* ── DESKTOP: original compact metadata ── */
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                {task?.operational_state && (
                  <span className="flex items-center gap-1">
                    <span className="text-[9px] text-gray-600 uppercase tracking-wide">Ops:</span>
                    <OperationalStateBadge
                      state={task.operational_state}
                      blockingReasons={task.blocking_reasons || []}
                      isOverride={!!task.manual_override}
                    />
                  </span>
                )}
                {status && (
                  <span className="flex items-center gap-1">
                    <span className="text-[9px] text-gray-600 uppercase tracking-wide">Status:</span>
                    <Badge style={{ backgroundColor: status.color }} className="text-white text-[10px] px-1.5 py-0 h-4 leading-none">{status.label}</Badge>
                  </span>
                )}
                {assignedMember && (
                  <span className="text-xs text-gray-500">{assignedMember.full_name}</span>
                )}
                {categoryPath && (
                  <span className="text-xs text-gray-500">{categoryPath}</span>
                )}
                {(() => {
                  const bucket = projectBuckets.find(b => b.id === task?.kanban_bucket_id);
                  return bucket ? (
                    <span className="text-xs text-gray-500">{bucket.name}</span>
                  ) : null;
                })()}
                {task?.due_date && (
                  <span className="text-xs text-gray-500">{format(new Date(task.due_date), 'MMM d')}</span>
                )}
              </div>
              {project && (
                <p className="text-xs text-gray-500">{project.name}</p>
              )}
              <SheetTitle className="text-white text-xl font-bold leading-tight mt-1">{task?.name}</SheetTitle>
            </>
          ) : null}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pt-0 pb-3">

          {/* Description — immediately under title, tight to title */}
          {!editing && <DescriptionBlock text={task?.description} />}

          {/* Time tracking display — desktop only (mobile shows in header) */}
          {!editing && !isMobile && (task?.estimated_hours || task?.actual_hours) && (
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <Clock className="w-3 h-3 shrink-0" />
              {task.estimated_hours && <span>Est: {formatHours(task.estimated_hours)}</span>}
              {task.actual_hours && <span>Actual: {formatHours(task.actual_hours)}</span>}
              {task.estimated_hours && task.actual_hours && (() => {
                const v = task.actual_hours - task.estimated_hours;
                if (v === 0) return <span className="text-gray-500">On target</span>;
                return <span className={v > 0 ? 'text-red-400' : 'text-green-400'}>
                  {v > 0 ? '+' : ''}{formatHours(Math.abs(v))} {v > 0 ? 'over' : 'under'}
                </span>;
              })()}
            </div>
          )}

          {/* Blocking reasons — show specific reasons if blocked */}
          {!editing && task?.blocking_reasons?.length > 0 && (
            <div className="mt-2 bg-red-950/20 border border-red-800/30 rounded-md px-3 py-2 space-y-1">
              {task.blocking_reasons.map((r, i) => (
                <p key={i} className="text-xs text-red-300">• {r.label}</p>
              ))}
            </div>
          )}

          {/* Breathing room before divider */}
          {!editing && <div className="mt-3" />}

          {/* ── MOBILE: Execution-first section order ── */}
          {!editing && isMobile && (
            <>
              {/* Dependencies — only if they exist */}
              {(selectedTasks.length > 0 || successorTasks.length > 0) && (
                <>
                  <section className="mb-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Dependencies</h3>
                    <TaskDependencyEditor
                      taskId={task?.id}
                      projectId={task?.project_id}
                      dependencies={liveDepsResolved}
                      allTasks={allProjectTasks}
                      buckets={projectBuckets}
                      teamMembers={teamMembers}
                      onChange={handleDependencyChange}
                      isSaving={depMutation.isPending}
                    />
                  </section>
                  <hr className="border-gray-700/50 mb-4" />
                </>
              )}

              {/* Checklist */}
              {checklistItems.length > 0 ? (
                <section className="mb-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Checklist</h3>
                  <ExecutionChecklistSection taskId={task?.id} variant="full" />
                  {incompleteChecklistCount === 0 && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-green-900/30 border border-green-800/40">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <span className="text-sm text-green-300 font-medium">Ready to complete</span>
                    </div>
                  )}
                </section>
              ) : (
                <div className="mb-3">
                  <ExecutionChecklistSection taskId={task?.id} variant="empty-cta" />
                </div>
              )}

              <hr className="border-gray-700/50 mb-4" />

              {/* Procedures / Build Knowledge */}
              <section className="mb-3">
                <TaskKnowledgeSection taskId={task?.id} />
              </section>

              <hr className="border-gray-700/50 mb-4" />

              {/* Parts */}
              <section className="mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Parts</h3>
                <TaskPartsSection task={task} project={project} />
              </section>

              <hr className="border-gray-700/50 mb-4" />

              {/* Client Feedback */}
              <ClientFeedbackLinks taskId={task?.id} />

              {/* Comments — last */}
              <section className="mb-4">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Comments</h3>
                <TaskCommentsSection taskId={task?.id} initialMaxVisible={2} />
              </section>
            </>
          )}

          {/* ── EDIT FORM — replaces header content inline when editing ── */}
          {editing && (
            <section className="mb-5">
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
                    <Label className="text-gray-400">Work Category</Label>
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
                    <Label className="text-gray-400">Phase / Bucket</Label>
                    <PhaseSelectorPopover
                      task={{ ...task, kanban_bucket_id: formData.kanban_bucket_id || null, project_id: formData.project_id }}
                      buckets={projectBuckets}
                      allTasks={allProjectTasks}
                      triggerVariant="select"
                      currentLabel={(() => {
                        const b = projectBuckets.find(b => b.id === formData.kanban_bucket_id);
                        return b ? b.name : null;
                      })()}
                      onMove={(bucketId) => setFormData(prev => ({ ...prev, kanban_bucket_id: bucketId || "" }))}
                    />
                  </div>
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
                <div>
                  <Label className="text-gray-400">Estimated Time (hours)</Label>
                  <TimeEstimateInput
                    value={formData.estimated_hours}
                    onChange={(v) => setFormData({ ...formData, estimated_hours: v })}
                    placeholder="e.g. 2.5"
                  />
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
            </section>
          )}

          {/* ── DESKTOP section order (mobile renders above, before edit form) ── */}
          {!editing && !isMobile && (
            <>
              <hr className="border-gray-700/50 mb-4" />

              {/* ── CHECKLIST ── */}
              {checklistItems.length > 0 ? (
                <section className="mb-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Checklist</h3>
                  <ExecutionChecklistSection taskId={task?.id} variant="full" />
                  {incompleteChecklistCount === 0 && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-green-900/30 border border-green-800/40">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <span className="text-sm text-green-300 font-medium">Ready to complete</span>
                    </div>
                  )}
                </section>
              ) : (
                <div className="mb-3">
                  <ExecutionChecklistSection taskId={task?.id} variant="empty-cta" />
                </div>
              )}

              {/* ── CLIENT FEEDBACK ── */}
              <ClientFeedbackLinks taskId={task?.id} />

              <hr className="border-gray-700/50 mb-4" />

              {/* ── BUILD KNOWLEDGE ── */}
              <section className="mb-3">
                <TaskKnowledgeSection taskId={task?.id} />
              </section>

              <hr className="border-gray-700/50 mb-4" />

              {/* ── DEPENDENCIES ── */}
              <section className="mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Dependencies</h3>
                <TaskDependencyEditor
                  taskId={task?.id}
                  projectId={task?.project_id}
                  dependencies={liveDepsResolved}
                  allTasks={allProjectTasks}
                  buckets={projectBuckets}
                  teamMembers={teamMembers}
                  onChange={handleDependencyChange}
                  isSaving={depMutation.isPending}
                />
              </section>

              <hr className="border-gray-700/50 mb-4" />

              {/* ── PARTS ── */}
              <section className="mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Parts</h3>
                <TaskPartsSection task={task} project={project} />
              </section>

              <hr className="border-gray-700/50 mb-4" />

              {/* ── COMMENTS ── */}
              <section className="mb-4">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Comments</h3>
                <TaskCommentsSection taskId={task?.id} initialMaxVisible={2} />
              </section>
            </>
          )}

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
                    kanban_bucket_id: task.kanban_bucket_id || "",
                    assigned_team_member_id: task.assigned_team_member_id || "", status_id: task.status_id || "",
                    start_date: task.start_date || "", due_date: task.due_date || "",
                    estimated_hours: task.estimated_hours ?? null,
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
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  // CANONICAL: Use provider's beginTaskCompletion if available
                  if (taskInteraction?.beginTaskCompletion) {
                    taskInteraction.beginTaskCompletion(task);
                  } else {
                    setShowCompleteConfirm(true);
                  }
                }}
                disabled={!completedStatus || taskInteraction?.isCompletingTask}
                className={cn(
                  "w-full h-11 min-h-[44px] text-white gap-2 transition-all bg-red-600 hover:bg-red-500",
                  checklistItems.length > 0 && incompleteChecklistCount === 0
                    && "ring-2 ring-red-500/40 shadow-lg shadow-red-900/30"
                )}
              >
                <CheckCircle2 className="w-4 h-4" />
                Complete Task
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditing(true)}
                className="h-10 min-h-[40px] px-4 border border-white/15 text-white/60 bg-transparent hover:bg-white/5 hover:text-white/80"
              >
                Edit
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    {/* Complete Task Modal with Time Entry */}
    <TaskCompletionModal
      isOpen={showCompleteConfirm}
      onClose={() => setShowCompleteConfirm(false)}
      onConfirm={(actualHours) => completeMutation.mutate(actualHours)}
      task={task}
      isLoading={completeMutation.isPending}
      incompleteChecklistCount={incompleteChecklistCount}
      onOpenTask={(depTask) => {
        setShowCompleteConfirm(false);
        if (taskInteraction?.openTaskDrawer) {
          onClose();
          setTimeout(() => taskInteraction.openTaskDrawer(depTask), 100);
        }
      }}
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
    </TooltipProvider>
  );
}