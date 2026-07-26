import React from "react";
import { cn } from "@/lib/utils";

/**
 * ReviewCycleSummary — PRESENTATION ONLY
 * 
 * Consumes pre-computed reviewSteps from buildOperationalViewModel.
 * No activity scanning. No business logic. No date calculations.
 */
export default function ReviewCycleSummary({ request, isMobile = false }) {
  const steps = request?.reviewSteps;
  if (!steps || steps.length === 0) return null;

  // Don't render if there's only the "Sent" step — too trivial
  const completedSteps = steps.filter(s => s.done).length;
  if (completedSteps <= 1) return null;

  return (
    <div className={cn(
      "rounded-lg border border-gray-800/60 bg-gray-900/40 px-3 py-2",
      isMobile ? "mx-0" : ""
    )}>
      <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-1.5">
        Review Cycle
      </div>
      <div className={cn(
        "flex items-center gap-0 text-xs",
        isMobile ? "flex-wrap gap-y-1" : ""
      )}>
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <span className={cn("mx-1.5", step.done ? "text-gray-500" : "text-gray-800")}>→</span>
            )}
            <span className={cn(
              "whitespace-nowrap",
              step.done ? "text-gray-300" : "text-gray-700"
            )}>
              {step.label}
              {step.date && <span className="text-gray-500 ml-1">{step.date}</span>}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}