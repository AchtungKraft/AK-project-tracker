import React from "react";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const LABELS = {
  LABOR_RATE_NOT_SET: "Rate needed",
  LABOR_OVER_INVOICED: "Hours over-invoiced",
  DRAFTS_DIFFER_FROM_CURRENT: "Drafts need review",
};

// Review flags for a project row. `expanded` shows full messages (mobile cards).
export default function OpenDollarsFlags({ flags, expanded = false }) {
  if (!flags?.length) return <span className="text-gray-600">—</span>;
  if (expanded) {
    return (
      <div className="space-y-1">
        {flags.map((f) => (
          <p key={f.code} className="flex gap-1.5 text-xs text-amber-400"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{f.message}</p>
        ))}
      </div>
    );
  }
  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1">
        {flags.map((f) => (
          <Tooltip key={f.code}>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded bg-amber-600/20 px-1.5 py-0.5 text-[11px] text-amber-400 cursor-help">
                <AlertTriangle className="w-3 h-3" />{LABELS[f.code] || f.code}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{f.message}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}