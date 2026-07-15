import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

// Capitalize first letter of each word for cleaner display
function titleCase(s) {
  if (!s) return s;
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

export default function ProjectHealthSummary({ projectHealth }) {
  if (!projectHealth) return null;

  const { currentPhase, activePhases, nextPhase, currentBlocker, currentBlockerText, blockers, currentMilestone, nextMilestone, workflowComplete } = projectHealth;

  // Derive display blocker text (handles both structured and string formats)
  const blockerLabel = currentBlockerText || (typeof currentBlocker === 'string' ? currentBlocker : currentBlocker?.label) || null;

  // If workflow is complete and no constraint, show compact success
  if (workflowComplete && !blockerLabel) {
    return (
      <div className="border border-emerald-800/40 rounded-md bg-emerald-950/10 px-2.5 py-1.5 flex items-center gap-1.5">
        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
        <span className="text-[11px] text-emerald-400 font-medium">Workflow Complete</span>
      </div>
    );
  }

  // If no constraint and no useful phase info, don't render
  if (!blockerLabel && !currentPhase) return null;

  return (
    <div className="border border-gray-800 rounded-md bg-black/30 px-2.5 py-2 space-y-1.5">
      {/* Current Constraint — the primary focus */}
      {blockerLabel ? (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
            <span className="text-[9px] text-red-400 uppercase tracking-widest font-bold">Current Constraint</span>
          </div>
          <p className="text-xs text-red-200 font-medium pl-[18px]">{titleCase(blockerLabel)}</p>
          {blockers?.length > 0 && (
            <div className="pl-[18px] mt-1">
              <span className="text-[9px] text-red-400/60 uppercase tracking-wider font-medium">Blocking</span>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
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
      ) : (
        /* Phase progression — only when no constraint */
        currentPhase && (
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="text-gray-500 text-[10px]">Phase:</span>
            <span className="text-white font-semibold text-[13px]">{currentPhase.name}</span>
            {activePhases?.length > 1 && (
              <span className="text-[10px] text-amber-400">+{activePhases.length - 1} parallel</span>
            )}
            {nextPhase && (
              <>
                <ArrowRight className="w-2.5 h-2.5 text-gray-600" />
                <span className="text-gray-400 text-xs">{nextPhase.name}</span>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}