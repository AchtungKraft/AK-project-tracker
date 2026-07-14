import React from "react";
import { cn } from "@/lib/utils";

const SECTION_CONFIG = {
  DISCUSSION: {
    label: "REQUIRES DISCUSSION",
    sublabel: "Projects needing management decisions today",
    color: "text-red-400",
    borderColor: "border-red-700/40",
    bgColor: "bg-red-900/5",
    dotColor: "bg-red-500",
  },
  ACTIVE: {
    label: "ACTIVE PRODUCTION",
    sublabel: "Healthy projects — verify progress and move on",
    color: "text-emerald-400",
    borderColor: "border-emerald-700/30",
    bgColor: "bg-emerald-900/5",
    dotColor: "bg-emerald-500",
  },
  LOW_PRIORITY: {
    label: "LOW PRIORITY",
    sublabel: "Planning, future work, minimal discussion needed",
    color: "text-gray-500",
    borderColor: "border-gray-700/30",
    bgColor: "bg-gray-900/5",
    dotColor: "bg-gray-600",
  },
};

export default function MeetingSectionHeader({ section, count }) {
  const cfg = SECTION_CONFIG[section] || SECTION_CONFIG.ACTIVE;

  return (
    <div className={cn("flex items-center gap-3 px-1 py-2 mt-4 first:mt-0 border-b", cfg.borderColor)}>
      <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotColor)} />
      <div className="flex-1">
        <span className={cn("text-[11px] font-bold uppercase tracking-widest", cfg.color)}>
          {cfg.label}
        </span>
        <span className="text-[10px] text-gray-600 ml-2">{cfg.sublabel}</span>
      </div>
      <span className={cn("text-[11px] font-semibold tabular-nums", cfg.color)}>
        {count}
      </span>
    </div>
  );
}