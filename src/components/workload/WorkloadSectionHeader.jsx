import React from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Play, CircleCheck, Ban, Package, Truck, UserCheck, Eye, Circle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP = {
  Play, CircleCheck, Ban, Package, Truck, UserCheck, Eye, Circle, CheckCircle2,
};

export default function WorkloadSectionHeader({ section, expanded, onToggle }) {
  const Icon = ICON_MAP[section.icon] || Circle;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 border-b transition-colors",
        section.headerBg, section.borderColor,
        "hover:brightness-110"
      )}
    >
      <Chevron className="w-3.5 h-3.5 text-gray-500 shrink-0" />
      <Icon className={cn("w-4 h-4 shrink-0", section.textColor)} />
      <span className={cn("text-sm font-semibold uppercase tracking-wide", section.textColor)}>
        {section.title}
      </span>
      <Badge
        variant="outline"
        className={cn("ml-auto text-[10px] px-1.5 py-0 font-bold tabular-nums", section.borderColor, section.textColor)}
      >
        {section.count}
      </Badge>
    </button>
  );
}