import React, { useState } from "react";
import { useProjectWorkflow } from "./useProjectWorkflow";
import PhaseRollupCard from "./PhaseRollupCard";
import MilestoneTimeline from "./MilestoneTimeline";
import ProjectHealthSummary from "./ProjectHealthSummary";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Ban, Package, Truck, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

function StatPill({ icon: Icon, label, value, color }) {
  if (!value) return null;
  return (
    <div className={cn("flex items-center gap-1 px-2 py-1 rounded-md border border-gray-800", color)}>
      <Icon className="w-3 h-3" />
      <span className="text-xs font-bold tabular-nums">{value}</span>
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}

export default function ProjectWorkflowPanel({ projectId }) {
  const { phases, milestones, projectHealth, summary, warnings, isLoading, recalculate, isRecalculating, needsRecalculation, recalcError } = useProjectWorkflow(projectId);
  const [expandedPhases, setExpandedPhases] = useState(new Set());

  const togglePhase = (id) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const dist = summary?.stateDistribution || {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    );
  }

  const needsCalc = needsRecalculation || (!summary?.resolvedAt && phases.length === 0 && !isLoading);

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Workflow Status</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recalculate()}
            disabled={isRecalculating}
            className="h-7 text-xs border-gray-700 text-gray-400 gap-1"
          >
            <RefreshCw className={cn("w-3 h-3", isRecalculating && "animate-spin")} />
            {needsCalc ? "Calculate" : "Recalculate"}
          </Button>
        </div>

        {/* Needs calculation banner */}
        {needsCalc && (
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-xs text-amber-300">Workflow has not been calculated for this project. Click Calculate to initialize.</span>
          </div>
        )}

        {/* Recalculation error */}
        {recalcError && (
          <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <span className="text-xs text-red-300">Recalculation failed: {recalcError.message || 'Unknown error'}</span>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-2">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <span className="text-xs text-red-300">{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* State distribution */}
        <div className="flex flex-wrap gap-1.5">
          <StatPill icon={CheckCircle2} label="Ready" value={dist.READY} color="text-green-400" />
          <StatPill icon={Clock} label="Active" value={dist.IN_PROGRESS} color="text-amber-400" />
          <StatPill icon={Ban} label="Blocked" value={dist.BLOCKED} color="text-red-400" />
          <StatPill icon={Package} label="Parts" value={dist.WAITING_ON_PARTS} color="text-orange-400" />
          <StatPill icon={Truck} label="Vendor" value={dist.WAITING_ON_VENDOR} color="text-purple-400" />
          <StatPill icon={User} label="Customer" value={dist.WAITING_ON_CUSTOMER} color="text-blue-400" />
        </div>

        {/* Phase rollups */}
        {phases.length > 0 && (
          <div className="space-y-1.5">
            {phases.map(p => (
              <PhaseRollupCard
                key={p.bucketId}
                phase={p}
                isExpanded={expandedPhases.has(p.bucketId)}
                onToggle={() => togglePhase(p.bucketId)}
              />
            ))}
          </div>
        )}

        {phases.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-4">No phases configured for this project.</p>
        )}

        {/* Project Health Summary */}
        {projectHealth && projectHealth.health && (
          <ProjectHealthSummary projectHealth={projectHealth} />
        )}

        {/* Milestones */}
        {milestones.length > 0 && (
          <MilestoneTimeline milestones={milestones} />
        )}
      </div>
    </TooltipProvider>
  );
}