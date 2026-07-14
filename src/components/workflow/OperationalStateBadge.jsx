import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getStateConfig } from "./useProjectWorkflow";
import { cn } from "@/lib/utils";

export default function OperationalStateBadge({ state, blockingReasons = [], isOverride = false, className }) {
  const config = getStateConfig(state);
  const hasReasons = blockingReasons.length > 0;

  const badge = (
    <Badge
      className={cn(
        "text-[10px] px-1.5 py-0 h-5 font-medium border-0 cursor-default",
        config.bgClass, config.textClass,
        isOverride && "ring-1 ring-amber-500/50",
        className
      )}
    >
      {isOverride ? `⚡ ${config.label}` : config.label}
    </Badge>
  );

  if (!hasReasons) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm bg-gray-800 border-gray-700">
        <div className="space-y-1">
          <p className="text-xs font-medium text-white">Blocking Reasons:</p>
          {blockingReasons.map((r, i) => (
            <p key={i} className="text-xs text-gray-300">• {r.label}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}