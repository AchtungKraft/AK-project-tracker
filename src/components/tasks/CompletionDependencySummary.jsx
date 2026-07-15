import React from "react";
import { AlertTriangle, Unlock } from "lucide-react";

/**
 * CompletionDependencySummary
 *
 * Compact dependency awareness shown inside TaskCompletionModal.
 * Informational only — never blocks completion.
 *
 * Sections:
 * 1. Incomplete prerequisites (warning treatment)
 * 2. Tasks unlocked by this completion (positive treatment)
 */
export default function CompletionDependencySummary({
  incompletePrereqs = [],
  successorTasks = [],
  onTaskClick,
}) {
  if (incompletePrereqs.length === 0 && successorTasks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Incomplete prerequisites */}
      {incompletePrereqs.length > 0 && (
        <div className="bg-yellow-900/25 border border-yellow-700/40 rounded-md px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span className="text-xs font-semibold text-yellow-300 uppercase tracking-wider">
              Dependency Notice
            </span>
          </div>
          <p className="text-xs text-yellow-200/70 mb-1.5">
            The following prerequisite tasks are still marked incomplete:
          </p>
          <ul className="space-y-0.5">
            {incompletePrereqs.map((t) => (
              <li key={t.id} className="flex items-start gap-1.5">
                <span className="text-yellow-400/60 text-xs mt-px">•</span>
                <button
                  type="button"
                  onClick={() => onTaskClick?.(t)}
                  className="text-xs text-yellow-200 hover:text-white hover:underline text-left leading-snug break-words"
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-yellow-200/50 mt-1.5 leading-relaxed">
            You may still complete this task. Review these records if the prerequisite work has also been finished.
          </p>
        </div>
      )}

      {/* Successor tasks unlocked */}
      {successorTasks.length > 0 && (
        <div className="bg-emerald-900/25 border border-emerald-700/40 rounded-md px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Unlock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
              Completing This Task Unlocks
            </span>
          </div>
          <ul className="space-y-0.5">
            {successorTasks.map((t) => (
              <li key={t.id} className="flex items-start gap-1.5">
                <span className="text-emerald-400/60 text-xs mt-px">•</span>
                <button
                  type="button"
                  onClick={() => onTaskClick?.(t)}
                  className="text-xs text-emerald-200 hover:text-white hover:underline text-left leading-snug break-words"
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}