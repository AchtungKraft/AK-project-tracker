import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight } from "lucide-react";

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

  const { currentPhase, nextPhase, currentBlocker, currentMilestone, nextMilestone, health } = projectHealth;

  return (
    <div className="border border-gray-800 rounded-lg bg-black/30 p-3 space-y-2">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Project Health</h4>

      {/* Phase progression */}
      {currentPhase && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 text-xs">Phase:</span>
          <span className="text-white font-semibold">{currentPhase.name}</span>
          {nextPhase && (
            <>
              <ArrowRight className="w-3 h-3 text-gray-600" />
              <span className="text-gray-400">{nextPhase.name}</span>
            </>
          )}
        </div>
      )}

      {/* Milestone progression */}
      {(currentMilestone || nextMilestone) && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 text-xs">Milestone:</span>
          {currentMilestone && <span className="text-emerald-400 text-xs">✓ {currentMilestone.name}</span>}
          {nextMilestone && (
            <>
              {currentMilestone && <ArrowRight className="w-3 h-3 text-gray-600" />}
              <span className="text-amber-400 text-xs">→ {nextMilestone.name}</span>
            </>
          )}
        </div>
      )}

      {/* Current blocker */}
      {currentBlocker && (
        <div className="flex items-start gap-1.5 bg-red-950/20 border border-red-900/30 rounded px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
          <span className="text-xs text-red-300">{currentBlocker}</span>
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