import React from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Play, CircleCheck, Ban, Package, Truck, UserCheck, Eye, Circle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/estimateUtils";

const ICON_MAP = {
  Play, CircleCheck, Ban, Package, Truck, UserCheck, Eye, Circle, CheckCircle2,
};

export default function WorkloadSectionHeader({ section, expanded, onToggle, compact }) {
  const Icon = ICON_MAP[section.icon] || Circle;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  // Project count for context
  const projectCount = section.projectGroups?.length || 0;

  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2 px-3 transition-colors",
        compact ? "py-1" : "py-1.5",
        section.headerBg,
        !compact && "border-b " + section.borderColor,
        "hover:brightness-110"
      )}
    >
      {!compact && <Chevron className="w-3 h-3 text-gray-500 shrink-0" />}
      <Icon className={cn("w-3.5 h-3.5 shrink-0", section.textColor)} />
      <span className={cn(
        "font-semibold uppercase tracking-wide",
        compact ? "text-xs" : "text-xs",
        section.textColor
      )}>
        {section.title}
      </span>

      {!compact && projectCount > 0 && (
        <span className="text-[10px] text-gray-600 tabular-nums">
          {projectCount} project{projectCount !== 1 ? "s" : ""}
        </span>
      )}

      {!compact && section.estimatedHoursTotal > 0 && (
        <span className="text-[10px] text-gray-500 tabular-nums">
          {formatDuration(section.estimatedHoursTotal)}
        </span>
      )}

      <Badge
        variant="outline"
        className={cn("ml-auto text-[10px] px-1.5 py-0 font-bold tabular-nums", section.borderColor, section.textColor)}
      >
        {section.count}
      </Badge>
    </button>
  );
}