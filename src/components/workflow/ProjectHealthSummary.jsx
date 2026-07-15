import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

function fmtH(h) {
  if (!h) return "0h";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

export default function ProjectHealthSummary({ projectHealth }) {
  if (!projectHealth) return null;

  const { currentPhase, activePhases, nextPhase, currentBlocker, currentBlockerText, blockers, currentMilestone, nextMilestone, health, workflowComplete, requiredMilestonesCompleted, requiredMilestonesTotal } = projectHealth;

  // Derive display blocker text (handles both structured and string formats)
  const blockerLabel = currentBlockerText || (typeof currentBlocker === 'string' ? currentBlocker : currentBlocker?.label) || null;

  return (
    <div className="border border-gray-800 rounded-lg bg-black/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Project Health</h4>
        {workflowComplete && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Workflow Complete
          </span>
        )}
      </div>

      {/* Phase progression */}
      {currentPhase && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-gray-500 text-xs">Phase:</span>
          <span className="text-white font-semibold">{currentPhase.name}</span>
          {activePhases?.length > 1 && (
            <span className="text-[10px] text-amber-400">+{activePhases.length - 1} parallel</span>
          )}
          {nextPhase && (
            <>
              <ArrowRight className="w-3 h-3 text-gray-600" />
              <span className="text-gray-400">{nextPhase.name}</span>
            </>
          )}
        </div>
      )}

      {!currentPhase && !workflowComplete && (
        <p className="text-xs text-gray-500 italic">No active phases</p>
      )}

      {/* Milestone progression */}
      {(currentMilestone || nextMilestone) && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-gray-500 text-xs">Milestone:</span>
          {currentMilestone && <span className="text-emerald-400 text-xs">✓ {currentMilestone.name}</span>}
          {nextMilestone && (
            <>
              {currentMilestone && <ArrowRight className="w-3 h-3 text-gray-600" />}
              <span className="text-amber-400 text-xs">→ {nextMilestone.name}</span>
            </>
          )}
          {requiredMilestonesTotal > 0 && (
            <span className="text-[10px] text-gray-500">({requiredMilestonesCompleted}/{requiredMilestonesTotal})</span>
          )}
        </div>
      )}

      {/* Current Constraint */}
      {blockerLabel && (
        <div className="flex items-start gap-1.5 bg-red-950/20 border border-red-900/30 rounded px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div>
              <span className="text-[9px] text-red-400/70 uppercase tracking-wider font-medium">Current Constraint</span>
              <p className="text-xs text-red-300 mt-0.5">{blockerLabel}</p>
            </div>
            {blockers?.length > 0 && (
              <div>
                <span className="text-[9px] text-red-400/60 uppercase tracking-wider">Blocking:</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {blockers.slice(0, 5).map((b, i) => (
                    <span key={i} className="text-[10px] text-red-300/80">• {typeof b === 'string' ? b : (b.phaseName || b.label || b.name || 'Unknown')}</span>
                  ))}
                  {blockers.length > 5 && (
                    <span className="text-[10px] text-red-400/50">+{blockers.length - 5} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hours */}
      {health && (
        <div className="flex items-center gap-4 text-[10px] text-gray-500 pt-1 border-t border-gray-800/30">
          <span>Est: <span className="text-gray-300 font-medium">{fmtH(health.hours_estimated)}</span></span>
          <span>Actual: <span className="text-gray-300 font-medium">{fmtH(health.hours_actual)}</span></span>
          <span>Remaining: <span className="text-gray-300 font-medium">{fmtH(health.hours_remaining)}</span></span>
        </div>
      )}
    </div>
  );
}