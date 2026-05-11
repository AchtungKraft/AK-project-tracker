import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { formatHours } from "./TimeEstimateInput";

/**
 * TaskCompletionModal
 * 
 * Shown when a user completes a task.
 * Collects actual_hours and shows variance vs estimate.
 * Lightweight and fast — under 3 seconds to complete.
 */
export default function TaskCompletionModal({
  isOpen,
  onClose,
  onConfirm,
  task,
  isLoading = false,
  incompleteChecklistCount = 0,
}) {
  const [actualHours, setActualHours] = useState("");

  // Pre-fill with estimate if available
  useEffect(() => {
    if (isOpen && task?.estimated_hours) {
      setActualHours(String(task.estimated_hours));
    } else if (isOpen) {
      setActualHours("");
    }
  }, [isOpen, task?.estimated_hours]);

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
      <DialogContent className="max-w-sm bg-gray-900 border-red-900/30 text-white">
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
    </Dialog>
  );
}