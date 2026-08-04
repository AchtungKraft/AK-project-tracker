import React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationCompact } from "@/lib/estimateUtils";

/**
 * CompactTimeDisplay — inline time badge for task rows.
 *
 * Shows "Est 2h · 1h 30m logged" or just "2h" (estimate only)
 * or just "1h 30m logged" (no estimate).
 *
 * @param {number|null} estimatedHours
 * @param {number} loggedHours - canonical from TaskTimeEntry sum
 * @param {boolean} showEstimate - whether to show the estimate (default true)
 * @param {string} className
 */
export default function CompactTimeDisplay({ estimatedHours, loggedHours = 0, showEstimate = true, className }) {
  const est = estimatedHours > 0 ? estimatedHours : null;
  const logged = loggedHours > 0 ? loggedHours : 0;

  if (!est && !logged) return null;

  const estStr = formatDurationCompact(est);
  const logStr = formatDurationCompact(logged);
  const isOver = est && logged > est;

  // Only estimate, no logged hours
  if (showEstimate && est && !logged) {
    return (
      <span className={cn("text-[10px] text-gray-500 tabular-nums shrink-0 flex items-center gap-0.5", className)}>
        <Clock className="w-2.5 h-2.5" />
        {estStr}
      </span>
    );
  }

  // Has logged hours
  if (logged > 0) {
    return (
      <span className={cn(
        "text-[10px] tabular-nums shrink-0 flex items-center gap-0.5",
        isOver ? "text-red-400" : "text-gray-500",
        className,
      )}>
        <Clock className="w-2.5 h-2.5" />
        {showEstimate && est ? `${logStr}/${estStr}` : logStr}
      </span>
    );
  }

  return null;
}