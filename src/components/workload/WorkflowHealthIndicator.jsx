import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function WorkflowHealthIndicator({
  staleProjects,
  staleMissingSet,
  projectMap,
  onRecalculate,
  isRecalculating,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!staleProjects || staleProjects.length === 0) {
    return null;
  }

  const staleMissing = staleProjects.filter(id => staleMissingSet.has(id)).length;
  const staleOutdated = staleProjects.length - staleMissing;

  return (
    <div className="border border-amber-700/30 bg-amber-950/10 rounded-lg overflow-hidden">
      {/* Compact header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-amber-900/10 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-xs font-medium text-amber-300">
          Workflow Health · {staleProjects.length} Issue{staleProjects.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[10px] text-amber-500 ml-1">
          {staleMissing > 0 && `${staleMissing} unavailable`}
          {staleMissing > 0 && staleOutdated > 0 && " · "}
          {staleOutdated > 0 && `${staleOutdated} stale`}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); onRecalculate(); }}
            disabled={isRecalculating}
            className="border-amber-600/50 text-amber-300 hover:bg-amber-600/20 h-6 text-[11px] gap-1"
          >
            <RefreshCw className={cn("w-3 h-3", isRecalculating && "animate-spin")} />
            Recalculate Workflow
          </Button>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-amber-500" />
            : <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
          }
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 pt-1 border-t border-amber-800/20 space-y-1">
          <p className="text-[10px] text-amber-500 mb-1">
            Recalculating only updates derived fields (operational state, phase status, milestone status).
            Task records, assignments, dates, and priorities are never modified.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto">
            {staleProjects.map(pid => {
              const proj = projectMap.get(pid);
              const isMissing = staleMissingSet.has(pid);
              return (
                <div key={pid} className="flex items-center gap-1.5 text-[11px]">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    isMissing ? "bg-red-400" : "bg-amber-400"
                  )} />
                  <span className="text-gray-300 truncate">{proj?.name || pid}</span>
                  <span className={cn("text-[9px] shrink-0", isMissing ? "text-red-500" : "text-amber-600")}>
                    {isMissing ? "unavailable" : "stale"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}