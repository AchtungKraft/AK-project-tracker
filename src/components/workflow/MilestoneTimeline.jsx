import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, SkipForward, AlertTriangle, RotateCcw, Loader2, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_DISPLAY = {
  not_started: { icon: Circle, color: "text-gray-600", textColor: "text-gray-400", label: "Not Started" },
  in_progress: { icon: Loader2, color: "text-amber-400", textColor: "text-amber-300", label: "In Progress" },
  waiting: { icon: Clock, color: "text-orange-400", textColor: "text-orange-300", label: "Waiting" },
  completed: { icon: CheckCircle2, color: "text-emerald-400", textColor: "text-emerald-400", label: "Completed" },
  reopened: { icon: RotateCcw, color: "text-red-400", textColor: "text-red-300", label: "Reopened" },
  skipped: { icon: SkipForward, color: "text-gray-500", textColor: "text-gray-500", label: "Skipped" },
  configuration_error: { icon: AlertTriangle, color: "text-red-500", textColor: "text-red-400", label: "Config Error" },
};

export default function MilestoneTimeline({ milestones }) {
  if (!milestones?.length) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Milestones</h4>
      <div className="space-y-0">
        {milestones.map((ms, idx) => {
          const display = STATUS_DISPLAY[ms.status] || STATUS_DISPLAY.not_started;
          const Icon = display.icon;
          const isLast = idx === milestones.length - 1;
          const showBlocker = ms.status !== 'completed' && ms.status !== 'skipped' && ms.blockingReason;

          return (
            <div key={ms.milestoneId} className="flex items-start gap-2">
              <div className="flex flex-col items-center">
                <Icon className={cn("w-4 h-4 shrink-0", display.color)} />
                {!isLast && (
                  <div className={cn("w-px h-4", ms.status === 'completed' ? "bg-emerald-800" : "bg-gray-800")} />
                )}
              </div>
              <div className="min-w-0 -mt-0.5 flex items-center gap-1.5">
                <span className={cn("text-xs font-medium",
                  display.textColor,
                  ms.status === 'skipped' && "line-through"
                )}>
                  {ms.name}
                </span>
                {ms.status === 'reopened' && (
                  <span className="text-[9px] bg-red-900/40 text-red-300 px-1 py-0.5 rounded font-medium">REOPENED</span>
                )}
                {ms.status === 'configuration_error' && (
                  <span className="text-[9px] bg-red-900/40 text-red-300 px-1 py-0.5 rounded font-medium">ERROR</span>
                )}
                {showBlocker && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <AlertTriangle className="w-3 h-3 text-orange-400 inline" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[250px] text-xs">
                      {ms.blockingReason}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}