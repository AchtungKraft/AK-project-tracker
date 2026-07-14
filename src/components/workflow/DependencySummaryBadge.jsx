import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Ban, CheckCircle2, ArrowDown, Clock, Package, Truck, User } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Compact dependency summary for task cards.
 * Shows: operational state + first blocking reason + successor count.
 */
export default function DependencySummaryBadge({ task, allTasks = [] }) {
  const state = task?.operational_state;
  const reasons = task?.blocking_reasons || [];

  const successorCount = useMemo(() => {
    if (!task?.id || !allTasks.length) return 0;
    return allTasks.filter(t => t.dependencies?.includes(task.id)).length;
  }, [task?.id, allTasks]);

  // Compute deep downstream count
  const downstreamCount = useMemo(() => {
    if (!task?.id || !allTasks.length) return 0;
    const visited = new Set();
    const queue = [task.id];
    while (queue.length) {
      const cur = queue.shift();
      const succs = allTasks.filter(t => t.dependencies?.includes(cur));
      for (const s of succs) {
        if (!visited.has(s.id)) {
          visited.add(s.id);
          queue.push(s.id);
        }
      }
    }
    return visited.size;
  }, [task?.id, allTasks]);

  if (!state) return null;

  // Skip if ready/completed with no successors — nothing useful to show
  if ((state === 'READY' || state === 'COMPLETED' || state === 'IN_PROGRESS') && !reasons.length && downstreamCount === 0) return null;

  const firstReason = reasons[0];
  let summaryText = '';
  let Icon = null;
  let colorClass = '';

  if (state === 'BLOCKED' && firstReason) {
    if (firstReason.type === 'DEPENDENCY') {
      summaryText = firstReason.label?.replace('Blocked by: ', '') || 'Dependency';
      Icon = Ban;
      colorClass = 'text-red-400';
    } else if (firstReason.type === 'PHASE') {
      summaryText = firstReason.label?.replace('Waiting for phase "', '').replace('"', '') || 'Phase';
      Icon = Clock;
      colorClass = 'text-red-400';
    } else {
      summaryText = firstReason.label || 'Blocked';
      Icon = Ban;
      colorClass = 'text-red-400';
    }
  } else if (state === 'WAITING_ON_PARTS' && firstReason) {
    summaryText = firstReason.label?.replace('Waiting for ', '') || 'Parts';
    Icon = Package;
    colorClass = 'text-orange-400';
  } else if (state === 'WAITING_ON_VENDOR' && firstReason) {
    summaryText = firstReason.label?.replace('Waiting for: ', '') || 'Vendor';
    Icon = Truck;
    colorClass = 'text-purple-400';
  } else if (state === 'WAITING_ON_CUSTOMER' && firstReason) {
    summaryText = firstReason.label?.replace('Waiting for customer: ', '') || 'Customer';
    Icon = User;
    colorClass = 'text-blue-400';
  }

  const hasBlockingSummary = !!summaryText;

  // Build tooltip lines
  const tooltipLines = [];
  if (reasons.length > 0) {
    reasons.forEach(r => tooltipLines.push(r.label));
  }
  if (downstreamCount > 0) {
    tooltipLines.push(`Blocks ${downstreamCount} downstream task${downstreamCount !== 1 ? 's' : ''}`);
  }

  const content = (
    <span className="flex items-center gap-1 text-[10px] max-w-full">
      {hasBlockingSummary && Icon && (
        <>
          <Icon className={cn("w-2.5 h-2.5 shrink-0", colorClass)} />
          <span className={cn("truncate", colorClass)}>{summaryText}</span>
        </>
      )}
      {downstreamCount > 0 && (
        <span className="flex items-center gap-0.5 text-amber-500/80 shrink-0">
          <ArrowDown className="w-2.5 h-2.5" />
          <span>{downstreamCount}</span>
        </span>
      )}
    </span>
  );

  if (tooltipLines.length === 0) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{content}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs bg-gray-800 border-gray-700">
        <div className="space-y-0.5">
          {tooltipLines.map((line, i) => (
            <p key={i} className="text-xs text-gray-300">• {line}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}