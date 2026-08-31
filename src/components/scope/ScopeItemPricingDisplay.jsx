import React, { useState } from "react";
import { ChevronDown, ChevronUp, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeScopeItemPricing, formatDollarRange } from "./scopePricingHelpers";
import { formatHoursRange } from "./scopeHelpers";

/**
 * Canonical pricing display for a single ScopeItemCard.
 * Shows Hard Cost / AK Labor / Total Estimate for classified items,
 * or legacy Estimate Range for unclassified items.
 */
export default function ScopeItemPricingDisplay({ item, laborEstimates = [], isClientView = false, isMobile = false }) {
  const [expanded, setExpanded] = useState(false);
  const pricing = computeScopeItemPricing(item, laborEstimates);

  if (pricing.pricing_model === 'legacy_estimate') {
    // Legacy — show old-style budget + AK hours if present
    const budget = formatDollarRange(pricing.legacy_budget_min, pricing.legacy_budget_max);
    const hours = formatHoursRange(pricing.ak_hours_min, pricing.ak_hours_max);

    return (
      <div className="space-y-1">
        {pricing.legacy_budget_tbd ? (
          <p className="text-sm text-gray-400 italic">Estimate: TBD</p>
        ) : budget ? (
          <p className={cn("font-semibold", isMobile ? "text-sm" : "text-base", "text-cyan-400")}>
            {budget}
          </p>
        ) : null}

        {pricing.labor_estimated && (
          <LaborLine
            hours={hours}
            laborMin={pricing.ak_labor_min}
            laborMax={pricing.ak_labor_max}
            isClientView={isClientView}
            laborEstimates={laborEstimates}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
          />
        )}

        {!isClientView && (
          <p className="text-[10px] text-amber-500/60 italic flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Pricing breakdown not yet classified
          </p>
        )}
      </div>
    );
  }

  // hard_cost_plus_labor
  const hardCost = pricing.hard_cost_tbd
    ? 'TBD'
    : formatDollarRange(pricing.hard_cost_min, pricing.hard_cost_max);
  const hours = formatHoursRange(pricing.ak_hours_min, pricing.ak_hours_max);
  const totalEst = pricing.estimate_complete
    ? formatDollarRange(pricing.total_estimate_min, pricing.total_estimate_max)
    : pricing.hard_cost_tbd
      ? 'TBD'
      : pricing.labor_estimated
        ? null // Hard cost exists but no complete total
        : null;

  return (
    <div className="space-y-1.5">
      {/* Total Estimate — visually strongest */}
      {pricing.estimate_complete && totalEst && (
        <p className={cn("font-bold", isMobile ? "text-base" : "text-lg", "text-white")}>
          {totalEst}
        </p>
      )}
      {!pricing.estimate_complete && !pricing.hard_cost_tbd && pricing.hard_cost_min != null && !pricing.labor_estimated && (
        <p className="text-xs text-gray-500 italic">Total Estimate: Pending AK labor</p>
      )}
      {pricing.hard_cost_tbd && (
        <p className="text-xs text-gray-500 italic">Total Estimate: TBD</p>
      )}

      {/* Hard Cost */}
      {hardCost && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide w-20 shrink-0">Hard Cost</span>
          <span className={cn("text-sm font-medium", pricing.hard_cost_tbd ? "text-gray-400 italic" : "text-cyan-400")}>
            {hardCost}
          </span>
        </div>
      )}

      {/* AK Labor */}
      {pricing.labor_estimated ? (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide w-20 shrink-0">AK Labor</span>
            <span className="text-sm font-medium text-emerald-400">
              {!isClientView ? formatDollarRange(pricing.ak_labor_min, pricing.ak_labor_max) : hours}
            </span>
            {!isClientView && hours && (
              <span className="text-[10px] text-red-400/70 ml-1">{hours}</span>
            )}
          </div>
          <LaborLine
            hours={hours}
            laborMin={pricing.ak_labor_min}
            laborMax={pricing.ak_labor_max}
            isClientView={isClientView}
            laborEstimates={laborEstimates}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
            compact
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide w-20 shrink-0">AK Labor</span>
          <span className="text-xs text-gray-500 italic">Not estimated</span>
        </div>
      )}

      {/* Hard cost note */}
      {pricing.hard_cost_note && (
        <p className="text-[10px] text-gray-500 italic">{pricing.hard_cost_note}</p>
      )}
    </div>
  );
}

function LaborLine({ hours, laborMin, laborMax, isClientView, laborEstimates, expanded, onToggle, compact = false }) {
  if (!laborEstimates?.length) return null;
  if (laborEstimates.length <= 1 && compact) return null; // No breakdown needed for single row

  return (
    <div className={compact ? "" : "mt-1"}>
      <button onClick={onToggle} className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
        <Clock className="w-3 h-3" />
        <span>{laborEstimates.length} labor group{laborEstimates.length !== 1 ? 's' : ''}</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-1 pl-4 space-y-0.5">
          {laborEstimates
            .slice()
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((le, idx) => {
              const costMin = (le.hours_min || 0) * (le.rate_snapshot || 0);
              const costMax = (le.hours_max || 0) * (le.rate_snapshot || 0);
              const h = formatHoursRange(le.hours_min, le.hours_max);
              return (
                <div key={le.id || idx} className="text-[10px] text-gray-500">
                  <span className="text-gray-400">{le.labor_group_name_snapshot || 'Unknown'}</span>
                  <span className="mx-1">·</span>
                  <span>{h}</span>
                  {!isClientView && (
                    <>
                      <span className="mx-1">·</span>
                      <span>${le.rate_snapshot}/hr</span>
                      <span className="mx-1">·</span>
                      <span className="text-emerald-400/70">{formatDollarRange(costMin, costMax)}</span>
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