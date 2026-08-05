import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, Loader2, User } from "lucide-react";
import { formatHours } from "./TimeEstimateInput";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import CompletionDependencySummary from "./CompletionDependencySummary";
import { formatDuration } from "@/lib/estimateUtils";
import { getTaskLoggedHours } from "@/lib/taskTimeUtils";

/**
 * TaskCompletionModal
 * 
 * Shown when a user completes a task.
 * Shows previously logged hours, allows optional additional hours + note.
 * Creates a time entry instead of overwriting actual_hours.
 */
export default function TaskCompletionModal({
  isOpen,
  onClose,
  onConfirm,
  task,
  isLoading = false,
  incompleteChecklistCount = 0,
  onOpenTask,
  teamMembers: propTeamMembers,
}) {
  const [additionalHours, setAdditionalHours] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [performedByUserId, setPerformedByUserId] = useState(null);
  const [leaveWarningTask, setLeaveWarningTask] = useState(null);

  // Fetch team members if not provided via props
  const { data: fetchedTeamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
    enabled: !propTeamMembers && isOpen,
    staleTime: 60000,
  });
  const teamMembers = propTeamMembers || fetchedTeamMembers;
  const activeTeamMembers = useMemo(() => teamMembers.filter(m => m.active), [teamMembers]);

  // Fetch existing time entries
  const { data: timeEntries = [] } = useQuery({
    queryKey: ['taskTimeEntries', task?.id],
    queryFn: () => base44.entities.TaskTimeEntry.filter({ task_id: task?.id }),
    enabled: !!task?.id && isOpen,
    staleTime: 5000,
  });

  const previouslyLogged = useMemo(
    () => getTaskLoggedHours(task || {}, timeEntries),
    [task, timeEntries]
  );

  // Default performer to current user's team member
  useEffect(() => {
    if (isOpen) {
      setAdditionalHours("");
      setCompletionNote("");
      setLeaveWarningTask(null);
      // Default performer to current user
      base44.auth.me().then(me => {
        const myMember = teamMembers.find(m => m.user_id === me.id && m.active);
        setPerformedByUserId(myMember?.id || null);
      }).catch(() => setPerformedByUserId(null));
    }
  }, [isOpen, teamMembers]);

  // Fetch project tasks for dependency awareness
  const { data: allProjectTasks = [] } = useQuery({
    queryKey: ['projectTasks', task?.project_id],
    queryFn: () => base44.entities.Task.filter({ project_id: task?.project_id }),
    enabled: !!task?.project_id && isOpen,
    staleTime: 30000,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
    staleTime: 60000,
  });

  const completedStatusId = useMemo(() => {
    const s = statuses.find(s => s.scope === 'Task' && s.active && s.label?.toLowerCase().includes('complete'));
    return s?.id;
  }, [statuses]);

  const incompletePrereqs = useMemo(() => {
    if (!task?.dependencies?.length || !allProjectTasks.length) return [];
    return task.dependencies
      .map(id => allProjectTasks.find(t => t.id === id))
      .filter(t => t && t.status_id !== completedStatusId);
  }, [task?.dependencies, allProjectTasks, completedStatusId]);

  const successorTasks = useMemo(() => {
    if (!task?.id || !allProjectTasks.length) return [];
    return allProjectTasks.filter(t => t.id !== task.id && t.dependencies?.includes(task.id));
  }, [task?.id, allProjectTasks]);

  const parsedAdditional = additionalHours !== "" ? parseFloat(additionalHours) : 0;
  const finalTotal = previouslyLogged + (isNaN(parsedAdditional) ? 0 : parsedAdditional);
  const hasEstimate = task?.estimated_hours != null && task?.estimated_hours > 0;
  const variance = hasEstimate ? finalTotal - task.estimated_hours : null;

  const hasTimeEntry = additionalHours !== "" && additionalHours !== "0";
  const noteRequired = parsedAdditional > 0;
  const performerRequired = parsedAdditional > 0;
  const noteTrimmed = completionNote.trim();
  const noteValid = !noteRequired || noteTrimmed.length > 0;
  const performerValid = !performerRequired || !!performedByUserId;

  const handleDependencyTaskClick = (depTask) => {
    if (hasTimeEntry || completionNote.trim()) {
      setLeaveWarningTask(depTask);
    } else if (onOpenTask) {
      onOpenTask(depTask);
    }
  };

  const handleConfirmLeave = () => {
    const t = leaveWarningTask;
    setLeaveWarningTask(null);
    onClose();
    if (onOpenTask) onOpenTask(t);
  };

  const handleConfirm = () => {
    const additional = parsedAdditional > 0 ? parsedAdditional : null;
    const note = completionNote.trim() || null;
    const performer = performedByUserId || null;
    // Pass structured payload to prevent future field omissions
    onConfirm({
      additionalHours: additional,
      note,
      performedByUserId: performer,
    });
  };

  const QUICK_PRESETS = [0.25, 0.5, 1, 2, 4];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm bg-gray-900 border-red-900/30 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Complete Task
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            {task?.name}
          </DialogDescription>
        </DialogHeader>

        {incompleteChecklistCount > 0 && (
          <div className="bg-yellow-900/30 border border-yellow-700/40 rounded-md px-3 py-2 text-sm text-yellow-300">
            {incompleteChecklistCount} incomplete checklist item{incompleteChecklistCount !== 1 ? 's' : ''} — complete anyway?
          </div>
        )}

        <CompletionDependencySummary
          incompletePrereqs={incompletePrereqs}
          successorTasks={successorTasks}
          onTaskClick={onOpenTask ? handleDependencyTaskClick : undefined}
        />

        <div className="space-y-3 mt-1">
          {/* Hours summary */}
          <div className="bg-gray-800/60 rounded-lg p-3 space-y-2">
            {hasEstimate && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Estimated</span>
                <span className="text-gray-200 font-medium">{formatDuration(task.estimated_hours)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Previously Logged</span>
              <span className="text-gray-200 font-medium">
                {previouslyLogged > 0 ? formatDuration(previouslyLogged) : '0h'}
              </span>
            </div>
            {parsedAdditional > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Additional</span>
                <span className="text-blue-300 font-medium">+{formatDuration(parsedAdditional)}</span>
              </div>
            )}
            <div className="border-t border-gray-700 pt-2 flex items-center justify-between text-sm">
              <span className="text-white font-semibold">Final Total</span>
              <span className="text-white font-bold">{formatDuration(finalTotal) || '0h'}</span>
            </div>
          </div>

          {/* Additional hours input */}
          <div>
            <Label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
              Additional Hours (optional)
            </Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              inputMode="decimal"
              value={additionalHours}
              onChange={(e) => setAdditionalHours(e.target.value)}
              placeholder={previouslyLogged > 0 ? "0 — all work already logged" : "e.g. 2.5"}
              className="bg-gray-800 border-gray-700 text-white h-11 text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Quick presets */}
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_PRESETS.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setAdditionalHours(String(h))}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  additionalHours === String(h)
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {formatHours(h)}
              </button>
            ))}
          </div>

          {/* Completion / Work Note — required when adding hours */}
          <div>
            <Label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
              Completion / Work Note {noteRequired && <span className="text-red-400">*</span>}
            </Label>
            <Textarea
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              placeholder="Describe the work completed, issues found, or final outcome..."
              rows={3}
              className="bg-gray-800 border-gray-700 text-white min-h-[72px] text-sm resize-y"
            />
            {noteRequired && !noteValid && noteTrimmed === '' && additionalHours !== '' && (
              <p className="text-xs text-red-400 mt-1">
                A work note is required when logging additional hours.
              </p>
            )}
          </div>

          {/* Performed By selector — shown when additional hours entered */}
          {parsedAdditional > 0 && (
            <div>
              <Label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                Performed By {performerRequired && <span className="text-red-400">*</span>}
              </Label>
              <Select value={performedByUserId || ''} onValueChange={setPerformedByUserId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9">
                  <SelectValue placeholder="Select team member">
                    {performedByUserId
                      ? teamMembers.find(m => m.id === performedByUserId)?.full_name || 'Unknown'
                      : 'Select team member'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activeTeamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-sm">
                      <span className="flex items-center gap-2">
                        <User className="w-3 h-3 text-gray-400" />
                        {m.full_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {performerRequired && !performerValid && (
                <p className="text-xs text-red-400 mt-1">
                  A performer is required when logging hours.
                </p>
              )}
            </div>
          )}

          {/* Variance display */}
          {variance !== null && (
            <div className={`text-sm font-medium ${
              variance > 0 ? 'text-red-400' : variance < 0 ? 'text-green-400' : 'text-gray-400'
            }`}>
              Variance: {variance > 0 ? '+' : ''}{formatHours(Math.abs(variance))} {variance > 0 ? 'over' : variance < 0 ? 'under' : 'on target'}
            </div>
          )}

          {/* No additional hours message */}
          {previouslyLogged > 0 && (!additionalHours || additionalHours === "0") && (
            <p className="text-xs text-gray-500 text-center">
              No additional hours will be added. Final: {formatDuration(previouslyLogged)}.
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700" disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !noteValid || !performerValid}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete'}
          </Button>
        </div>
      </DialogContent>

      {/* Leave completion warning */}
      <AlertDialog open={!!leaveWarningTask} onOpenChange={(open) => { if (!open) setLeaveWarningTask(null); }}>
        <AlertDialogContent className="max-w-xs bg-gray-900 border-red-900/30 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave completion?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Your time entry has not been submitted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-700 text-white hover:bg-gray-800">Stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave} className="bg-red-600 hover:bg-red-700 text-white">Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}