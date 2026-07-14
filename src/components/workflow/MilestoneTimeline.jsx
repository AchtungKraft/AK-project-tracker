import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, SkipForward, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function MilestoneTimeline({ milestones }) {
  if (!milestones?.length) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Milestones</h4>
      <div className="space-y-0">
        {milestones.map((ms, idx) => {
          const isCompleted = ms.status === 'completed';
          const isSkipped = ms.status === 'skipped';
          const isPending = ms.status === 'pending';
          const isLast = idx === milestones.length - 1;

          return (
            <div key={ms.milestoneId} className="flex items-start gap-2">
              {/* Vertical line + icon */}
              <div className="flex flex-col items-center">
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : isSkipped ? (
                  <SkipForward className="w-4 h-4 text-gray-500 shrink-0" />
                ) : (
                  <Circle className={cn("w-4 h-4 shrink-0", ms.blockingReason ? "text-orange-400" : "text-gray-600")} />
                )}
                {!isLast && (
                  <div className={cn("w-px h-4", isCompleted ? "bg-emerald-800" : "bg-gray-800")} />
                )}
              </div>
              {/* Label */}
              <div className="min-w-0 -mt-0.5">
                <span className={cn("text-xs font-medium",
                  isCompleted ? "text-emerald-400" : isSkipped ? "text-gray-500 line-through" : "text-gray-300"
                )}>
                  {ms.name}
                </span>
                {isPending && ms.blockingReason && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] text-orange-400 ml-1.5 cursor-help">
                        <AlertTriangle className="w-3 h-3 inline -mt-0.5" />
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