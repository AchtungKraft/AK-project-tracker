import React, { useState } from "react";
import { ChevronDown, ChevronUp, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeScopeItemPricing, formatDollarRange } from "./scopePricingHelpers";
import { formatHoursRange } from "./scopeHelpers";

/**
 * Canonical pricing display for a single ScopeItemCard.
 * Total-first hierarchy:
 *   TOTAL ESTIMATE (primary)
 *   AK Hours (secondary operational)
 *   Hard Cost / AK Labor (tertiary, expandable for clients)
 *   Labor Breakdown (expandable, internal-only rates)
 */
export default function ScopeItemPricingDisplay({ item, laborEstimates = [], isClientView = false, isMobile = false, compact = false }) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [laborOpen, setLaborOpen] = useState(false);
  const pricing = computeScopeItemPricing(item, laborEstimates);

  if (pricing.pricing_model === 'legacy_estimate') {
    return <LegacyPricingDisplay pricing={pricing} laborEstimates={laborEstimates} isClientView={isClientView} isMobile={isMobile} compact={compact} />;
  }

  // === hard_cost_plus_labor ===
  const hours = formatHoursRange(pricing.ak_hours_min, pricing.ak_hours_max);

  // Determine the total estimate display and pending reason
  let totalLabel = null;
  let pendingReason = null;

  if (pricing.estimate_complete) {
    totalLabel = formatDollarRange(pricing.total_estimate_min, pricing.total_estimate_max);
  } else {
    // Figure out what's actually missing
    const hasHardCost = !pricing.hard_cost_tbd && pricing.hard_cost_min != null && pricing.hard_cost_max != null;
    const hasLabor = pricing.labor_estimated;

    if (pricing.hard_cost_tbd) {
      // Hard cost TBD — check if we can show a minimum from labor
      if (hasLabor && pricing.ak_labor_min > 0) {
        totalLabel = `From ${formatDollarRange(pricing.ak_labor_min, null)?.replace('From ', '')}`;
        pendingReason = 'Final hard cost TBD';
      } else {
        pendingReason = 'Pending hard cost estimate';
      }
    } else if (hasHardCost && !hasLabor) {
      pendingReason = 'Pending AK labor';
    } else if (!hasHardCost && hasLabor) {
      // Has labor but hard cost is partial (e.g. min only, no max)
      const partialMin = (pricing.hard_cost_min || 0) + pricing.ak_labor_min;
      if (partialMin > 0) {
        totalLabel = `From ${formatDollarRange(partialMin, null)?.replace('From ', '')}`;
        pendingReason = 'Hard cost range still TBD';
      } else {
        pendingReason = 'Pending final hard cost';
      }
    } else {
      pendingReason = 'Estimate pending';
    }
  }

  const hardCostDisplay = pricing.hard_cost_tbd
    ? 'TBD'
    : formatDollarRange(pricing.hard_cost_min, pricing.hard_cost_max);
  const laborDisplay = pricing.labor_estimated
    ? formatDollarRange(pricing.ak_labor_min, pricing.ak_labor_max)
    : null;

  return (
    <div className={cn("space-y-0.5", compact && "text-right")}>
      {/* Total Estimate — PRIMARY */}
      {totalLabel ? (
        <p className={cn("font-bold text-white", compact ? "text-sm" : isMobile ? "text-base" : "text-lg")}>
          {totalLabel}
        </p>
      ) : pendingReason ? (
        <p className={cn("text-gray-400 italic", compact ? "text-xs" : "text-sm")}>{pendingReason}</p>
      ) : null}

      {/* AK Hours — SECONDARY OPERATIONAL */}
      {hours && (
        <p className={cn("font-medium text-red-400/80", compact ? "text-[11px]" : isMobile ? "text-xs" : "text-sm")}>
          {hours.replace(/ hrs$/, '')} AK hrs
        </p>
      )}

      {/* Pending reason below total when total is shown */}
      {totalLabel && pendingReason && (
        <p className="text-[10px] text-amber-400/70 italic">{pendingReason}</p>
      )}

      {/* Cost Breakdown — TERTIARY */}
      {isClientView ? (
        // Client: collapsible cost breakdown
        <ClientCostBreakdown
          hardCostDisplay={hardCostDisplay}
          laborDisplay={laborDisplay}
          laborEstimates={laborEstimates}
          pricing={pricing}
          breakdownOpen={breakdownOpen}
          onToggleBreakdown={() => setBreakdownOpen(!breakdownOpen)}
          isMobile={isMobile}
        />
      ) : (
        // Internal: always-visible secondary + expandable labor
        <InternalCostBreakdown
          hardCostDisplay={hardCostDisplay}
          laborDisplay={laborDisplay}
          laborEstimates={laborEstimates}
          pricing={pricing}
          laborOpen={laborOpen}
          onToggleLabor={() => setLaborOpen(!laborOpen)}
          isMobile={isMobile}
        />
      )}

      {/* Hard cost note */}
      {pricing.hard_cost_note && (
        <p className="text-[10px] text-gray-500 italic">{pricing.hard_cost_note}</p>
      )}

      {/* Unclassified warning — internal only */}
      {!isClientView && pricing.pricing_model !== 'hard_cost_plus_labor' && (
        <p className="text-[10px] text-amber-500/60 italic flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Pricing breakdown not yet classified
        </p>
      )}
    </div>
  );
}

/** Internal view: Hard Cost + AK Labor as secondary text, compact single-line labor detail */
function InternalCostBreakdown({ hardCostDisplay, laborDisplay, laborEstimates, pricing, laborOpen, onToggleLabor, isMobile }) {
  return (
    <div className="space-y-0.5">
      {/* Hard Cost + AK Labor inline */}
      <div className="flex items-center gap-3 flex-wrap">
        {hardCostDisplay && (
          <span className="text-[11px] text-gray-500">
            Hard Cost <span className="text-gray-400">{hardCostDisplay}</span>
          </span>
        )}
        {laborDisplay && (
          <span className="text-[11px] text-gray-500">
            AK Labor <span className="text-gray-400">{laborDisplay}</span>
          </span>
        )}
        {!pricing.labor_estimated && (
          <span className="text-[11px] text-gray-500 italic">AK Labor not estimated</span>
        )}
      </div>

      {/* Labor Breakdown — compact single-line per group */}
      {laborEstimates?.length > 0 && (
        <div>
          <button onClick={onToggleLabor} className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
            {laborOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            <span>Labor Detail</span>
          </button>
          {laborOpen && (
            <div className="mt-0.5 space-y-0">
              {laborEstimates
                .slice()
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                .map((le, idx) => {
                  const costMin = (le.hours_min || 0) * (le.rate_snapshot || 0);
                  const costMax = (le.hours_max || 0) * (le.rate_snapshot || 0);
                  const h = formatHoursRange(le.hours_min, le.hours_max);
                  return (
                    <p key={le.id || idx} className="text-[10px] text-gray-500 leading-tight">
                      <span className="text-gray-400 uppercase">{le.labor_group_name_snapshot || '?'}</span>
                      {' '}{h} · ${le.rate_snapshot}/hr · <span className="text-emerald-400/70">{formatDollarRange(costMin, costMax)}</span>
                    </p>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Client view: collapsible "Cost Breakdown" toggle, no rates */
function ClientCostBreakdown({ hardCostDisplay, laborDisplay, laborEstimates, pricing, breakdownOpen, onToggleBreakdown, isMobile }) {
  const hasContent = hardCostDisplay || laborDisplay;
  if (!hasContent && !pricing.labor_estimated) return null;

  return (
    <div>
      <button onClick={onToggleBreakdown} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
        {breakdownOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span>Cost Breakdown</span>
      </button>
      {breakdownOpen && (
        <div className="mt-1.5 pl-3 space-y-1 border-l border-gray-700/30">
          {hardCostDisplay && (
            <div className="text-xs">
              <span className="text-gray-500">Hard Cost</span>
              <span className="ml-2 text-gray-300">{hardCostDisplay}</span>
            </div>
          )}
          {laborDisplay && (
            <div className="text-xs">
              <span className="text-gray-500">AK Labor</span>
              <span className="ml-2 text-gray-300">{laborDisplay}</span>
            </div>
          )}
          {/* AK Work hours breakdown — no rates for client */}
          {laborEstimates?.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {laborEstimates
                .slice()
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                .map((le, idx) => {
                  const h = formatHoursRange(le.hours_min, le.hours_max);
                  return (
                    <div key={le.id || idx} className="text-[10px] text-gray-500">
                      <span className="text-gray-400">{le.labor_group_name_snapshot || 'Unknown'}</span>
                      <span className="mx-1">·</span>
                      <span>{h}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Legacy pricing: unclassified items */
function LegacyPricingDisplay({ pricing, laborEstimates, isClientView, isMobile, compact = false }) {
  const [laborOpen, setLaborOpen] = useState(false);
  const budget = formatDollarRange(pricing.legacy_budget_min, pricing.legacy_budget_max);
  const hours = formatHoursRange(pricing.ak_hours_min, pricing.ak_hours_max);

  return (
    <div className={cn("space-y-0.5", compact && "text-right")}>
      {pricing.legacy_budget_tbd ? (
        <p className={cn("text-gray-400 italic", compact ? "text-xs" : "text-sm")}>Estimate: TBD</p>
      ) : budget ? (
        <p className={cn("font-bold text-white", compact ? "text-sm" : isMobile ? "text-base" : "text-lg")}>{budget}</p>
      ) : null}

      {hours && (
        <p className={cn("font-medium text-red-400/80", compact ? "text-[11px]" : isMobile ? "text-xs" : "text-sm")}>
          {hours.replace(/ hrs$/, '')} AK hrs
        </p>
      )}

      {pricing.labor_estimated && !isClientView && (
        <span className="text-xs text-gray-500">
          AK Labor <span className="text-gray-400">{formatDollarRange(pricing.ak_labor_min, pricing.ak_labor_max)}</span>
        </span>
      )}

      {/* Labor breakdown for legacy */}
      {!isClientView && laborEstimates?.length > 0 && (
        <div>
          <button onClick={() => setLaborOpen(!laborOpen)} className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
            {laborOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>Labor Breakdown</span>
          </button>
          {laborOpen && (
            <div className="mt-1 pl-3 space-y-0.5 border-l border-gray-700/30">
              {laborEstimates
                .slice()
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                .map((le, idx) => {
                  const costMin = (le.hours_min || 0) * (le.rate_snapshot || 0);
                  const costMax = (le.hours_max || 0) * (le.rate_snapshot || 0);
                  const h = formatHoursRange(le.hours_min, le.hours_max);
                  return (
                    <div key={le.id || idx} className="text-[10px] text-gray-500">
                      <span className="text-gray-400 uppercase tracking-wide">{le.labor_group_name_snapshot || 'Unknown'}</span>
                      <br />
                      <span>{h}</span>
                      <span className="mx-1">·</span>
                      <span>${le.rate_snapshot}/hr</span>
                      <span className="mx-1">·</span>
                      <span className="text-emerald-400/70">{formatDollarRange(costMin, costMax)}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {!isClientView && (
        <p className="text-[10px] text-amber-500/60 italic flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Pricing breakdown not yet classified
        </p>
      )}
    </div>
  );
}