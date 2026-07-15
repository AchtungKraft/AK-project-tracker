import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { formatHours } from "./TimeEstimateInput";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import CompletionDependencySummary from "./CompletionDependencySummary";

/**
 * TaskCompletionModal
 * 
 * Shown when a user completes a task.
 * Collects actual_hours and shows variance vs estimate.
 * Includes compact dependency awareness (informational only).
 * Lightweight and fast — under 3 seconds to complete.
 */
export default function TaskCompletionModal({
  isOpen,
  onClose,
  onConfirm,
  task,
  isLoading = false,
  incompleteChecklistCount = 0,
  onOpenTask,
}) {
  const [actualHours, setActualHours] = useState("");
  const [leaveWarningTask, setLeaveWarningTask] = useState(null);

  // Pre-fill with estimate if available
  useEffect(() => {
    if (isOpen && task?.estimated_hours) {
      setActualHours(String(task.estimated_hours));
    } else if (isOpen) {
      setActualHours("");
    }
    if (isOpen) {
      setLeaveWarningTask(null);
    }
  }, [isOpen, task?.estimated_hours]);

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

  // Incomplete prerequisites: tasks this task depends on that aren't complete
  const incompletePrereqs = useMemo(() => {
    if (!task?.dependencies?.length || !allProjectTasks.length) return [];
    return task.dependencies
      .map(id => allProjectTasks.find(t => t.id === id))
      .filter(t => t && t.status_id !== completedStatusId);
  }, [task?.dependencies, allProjectTasks, completedStatusId]);

  // Successors: tasks that depend on this task
  const successorTasks = useMemo(() => {
    if (!task?.id || !allProjectTasks.length) return [];
    return allProjectTasks.filter(t => t.id !== task.id && t.dependencies?.includes(task.id));
  }, [task?.id, allProjectTasks]);

  const hasTimeEntry = actualHours !== "" && actualHours !== "0";

  const handleDependencyTaskClick = (depTask) => {
    if (hasTimeEntry) {
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

  const parsedActual = actualHours !== "" ? parseFloat(actualHours) : null;
  const hasEstimate = task?.estimated_hours != null && task?.estimated_hours > 0;
  const variance = hasEstimate && parsedActual != null
    ? parsedActual - task.estimated_hours
    : null;

  const handleConfirm = () => {
    onConfirm(parsedActual);
  };

  const handleUseEstimate = () => {
    if (task?.estimated_hours) {
      setActualHours(String(task.estimated_hours));
    }
  };

  const QUICK_PRESETS = [0.5, 1, 2, 4, 8];

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

        {/* Dependency awareness — informational only, never blocks */}
        <CompletionDependencySummary
          incompletePrereqs={incompletePrereqs}
          successorTasks={successorTasks}
          onTaskClick={onOpenTask ? handleDependencyTaskClick : undefined}
        />

        <div className="space-y-3 mt-1">
          {/* Estimate display */}
          {hasEstimate && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Estimated: <span className="text-gray-200 font-medium">{formatHours(task.estimated_hours)}</span></span>
            </div>
          )}

          {/* Actual hours input */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
              Time Spent (hours)
            </label>
            <Input
              type="number"
              step="0.25"
              min="0"
              inputMode="decimal"
              value={actualHours}
              onChange={(e) => setActualHours(e.target.value)}
              placeholder="e.g. 2.5"
              className="bg-gray-800 border-gray-700 text-white h-11 text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              autoFocus
            />
          </div>

          {/* Quick presets */}
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_PRESETS.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setActualHours(String(h))}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  actualHours === String(h)
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {formatHours(h)}
              </button>
            ))}
            {hasEstimate && !QUICK_PRESETS.includes(task.estimated_hours) && (
              <button
                type="button"
                onClick={handleUseEstimate}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  actualHours === String(task.estimated_hours)
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-900/40 text-blue-300 hover:bg-blue-800/50'
                }`}
              >
                Use Est ({formatHours(task.estimated_hours)})
              </button>
            )}
          </div>

          {/* Variance display */}
          {variance !== null && (
            <div className={`text-sm font-medium ${
              variance > 0 ? 'text-red-400' : variance < 0 ? 'text-green-400' : 'text-gray-400'
            }`}>
              Variance: {variance > 0 ? '+' : ''}{formatHours(Math.abs(variance))} {variance > 0 ? 'over' : variance < 0 ? 'under' : 'on target'}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-700"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Complete'
            )}
          </Button>
        </div>
      </DialogContent>

      {/* Leave completion warning — protects unsaved time entry */}
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