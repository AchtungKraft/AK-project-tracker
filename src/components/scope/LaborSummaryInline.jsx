import React, { useState } from "react";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeItemLaborTotals, formatHoursRange, formatBudgetRange } from "./scopeHelpers";

/**
 * Compact AK labor summary shown on each ScopeItemCard.
 * Expandable to show per-group breakdown.
 * isClientView: hides rate and labor $ from clients.
 */
export default function LaborSummaryInline({ laborEstimates = [], isClientView = false }) {
  const [expanded, setExpanded] = useState(false);
  if (!laborEstimates.length) return null;

  const totals = computeItemLaborTotals(laborEstimates);
  if (totals.hours_min === 0 && totals.hours_max === 0) return null;

  const hoursLabel = formatHoursRange(totals.hours_min, totals.hours_max);

  return (
    <div className="mt-1.5">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-[11px] text-red-400/80 hover:text-red-300 transition-colors">
        <Clock className="w-3 h-3" />
        <span>AK Hours: <span className="font-medium text-red-300">{hoursLabel}</span></span>
        {!isClientView && totals.cost_min > 0 && (
          <span className="text-gray-500 ml-1">· AK Labor: <span className="text-emerald-400">{formatBudgetRange(totals.cost_min, totals.cost_max, false)}</span></span>
        )}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-1 pl-5 space-y-0.5">
          {laborEstimates
            .slice()
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((le, idx) => {
              const costMin = (le.hours_min || 0) * (le.rate_snapshot || 0);
              const costMax = (le.hours_max || 0) * (le.rate_snapshot || 0);
              return (
                <div key={le.id || idx} className="text-[10px] text-gray-500">
                  <span className="text-gray-400">{le.labor_group_name_snapshot || 'Unknown'}</span>
                  <span className="mx-1">·</span>
                  <span>{formatHoursRange(le.hours_min, le.hours_max)}</span>
                  {!isClientView && (
                    <>
                      <span className="mx-1">·</span>
                      <span>${le.rate_snapshot}/hr</span>
                      <span className="mx-1">·</span>
                      <span className="text-emerald-400/70">{formatBudgetRange(costMin, costMax, false)}</span>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}