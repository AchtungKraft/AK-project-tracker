import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, AlertTriangle, Package, Truck, User, Ban, ChevronDown, ChevronRight, Pause, SkipForward, CircleDot } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { getPhaseStateConfig } from "./useProjectWorkflow";

function fmtH(h) {
  if (!h) return "0h";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

const MODE_LABELS = { sequential: "Sequential", dependency_driven: "Dependency Driven", manual: "Manual" };

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="flex flex-col items-center">
      <Icon className={cn("w-3 h-3 mb-0.5", value > 0 ? color : "text-gray-700")} />
      <span className={cn("text-xs font-bold tabular-nums", value > 0 ? "text-white" : "text-gray-700")}>{value}</span>
      <span className="text-[8px] text-gray-600">{label}</span>
    </div>
  );
}

export default function PhaseRollupCard({ phase, isExpanded, onToggle }) {
  const stateConfig = getPhaseStateConfig(phase.phaseStatus);

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      phase.phaseStatus === 'completed' ? "border-emerald-800/40 bg-emerald-950/10" :
      phase.phaseStatus === 'blocked' ? "border-red-800/40 bg-red-950/10" :
      phase.phaseStatus === 'waiting' ? "border-orange-800/40 bg-orange-950/10" :
      "border-gray-800 bg-black/30"
    )}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/30">
        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
        <div className="w-1.5 h-7 rounded-full shrink-0" style={{ backgroundColor: phase.color || '#3B82F6' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">{phase.bucketName}</span>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", stateConfig.bgClass, stateConfig.textClass)}>
              {stateConfig.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">
              {phase.completedTaskCount}/{phase.requiredTaskCount} tasks · {MODE_LABELS[phase.progressionMode] || 'Dependency Driven'}
            </span>
            {phase.currentBlocker && (
              <span className="text-[10px] text-orange-400 truncate max-w-[200px]">· {phase.currentBlocker}</span>
            )}
          </div>
        </div>
        <span className="text-lg font-bold text-white tabular-nums shrink-0">{phase.completionPercent}%</span>
      </button>

      <div className="px-3 pb-1"><Progress value={phase.completionPercent} className="h-1" /></div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-800/50 mt-1">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            <Stat icon={CheckCircle2} label="Ready" value={phase.readyTaskCount} color="text-green-400" />
            <Stat icon={Clock} label="Active" value={phase.inProgressTaskCount} color="text-amber-400" />
            <Stat icon={Ban} label="Blocked" value={phase.blockedTaskCount} color="text-red-400" />
            <Stat icon={Package} label="Parts" value={phase.waitingOnPartsCount} color="text-orange-400" />
            <Stat icon={Truck} label="Vendor" value={phase.waitingOnVendorCount} color="text-purple-400" />
            <Stat icon={User} label="Customer" value={phase.waitingOnCustomerCount} color="text-blue-400" />
          </div>
          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-800/30 text-[10px] text-gray-500">
            <span>Est: <span className="text-gray-300 font-medium">{fmtH(phase.estimatedHours)}</span></span>
            <span>Actual: <span className="text-gray-300 font-medium">{fmtH(phase.actualHours)}</span></span>
            <span>Remaining: <span className="text-gray-300 font-medium">{fmtH(phase.remainingHours)}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}