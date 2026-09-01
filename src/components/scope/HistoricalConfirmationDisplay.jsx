import React, { useState } from "react";
import { CheckCircle2, PauseCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDollarRange } from "./scopePricingHelpers";
import { formatHoursRange } from "./scopeHelpers";

/**
 * Renders a confirmation's snapshotted pricing from summary_snapshot.
 * New confirmations (pricing_snapshot_version >= 1) show total-first with collapsible breakdown.
 * Legacy confirmations gracefully fall back to available budget fields.
 */
export default function HistoricalConfirmationDisplay({ confirmation, isClientView = false }) {
  if (!confirmation) return null;
  const ss = confirmation.summary_snapshot || {};
  const isNewFormat = ss.pricing_snapshot_version >= 1;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500 italic">
        Confirmed by {confirmation.confirmed_by_name || 'Unknown'} on{' '}
        {new Date(confirmation.confirmed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        {confirmation.revision > 1 && ` (v${confirmation.revision})`}
      </p>

      <div className={cn("grid gap-2", "grid-cols-2")}>
        <SnapshotDispositionCard
          icon={CheckCircle2}
          title="Approved"
          snapshot={ss}
          prefix="approved"
          isNewFormat={isNewFormat}
          isClientView={isClientView}
          colorClasses={{ bg: 'bg-green-950/20', border: 'border-green-700/30', label: 'text-green-400/70', count: 'text-green-300', value: 'text-green-400' }}
          legacyBudgetMin={confirmation.approved_budget_min}
          legacyBudgetMax={confirmation.approved_budget_max}
          legacyItemCount={ss.approved || (confirmation.approved_item_ids || []).length}
          legacyHoursMin={confirmation.approved_ak_hours_min}
          legacyHoursMax={confirmation.approved_ak_hours_max}
        />
        {(isNewFormat ? (ss.not_now_item_count || 0) > 0 : (ss.not_now || 0) > 0) && (
          <SnapshotDispositionCard
            icon={PauseCircle}
            title="Not Now"
            snapshot={ss}
            prefix="not_now"
            isNewFormat={isNewFormat}
            isClientView={isClientView}
            colorClasses={{ bg: 'bg-gray-800/50', border: 'border-gray-700/30', label: 'text-gray-400', count: 'text-gray-300', value: 'text-gray-400' }}
            legacyBudgetMin={ss.not_now_budget_min}
            legacyBudgetMax={ss.not_now_budget_max}
            legacyItemCount={ss.not_now || 0}
            legacyHoursMin={ss.not_now_ak_hours_min}
            legacyHoursMax={ss.not_now_ak_hours_max}
          />
        )}
      </div>
    </div>
  );
}

function SnapshotDispositionCard({
  icon: Icon,
  title,
  snapshot,
  prefix,
  isNewFormat,
  isClientView,
  colorClasses,
  legacyBudgetMin,
  legacyBudgetMax,
  legacyItemCount,
  legacyHoursMin,
  legacyHoursMax,
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const ss = snapshot;
  const itemCount = isNewFormat ? (ss[`${prefix}_item_count`] || legacyItemCount) : legacyItemCount;

  let primaryLabel = null;
  let hoursLabel = null;
  let breakdownLines = [];

  if (isNewFormat) {
    const totalEst = formatDollarRange(ss[`${prefix}_total_estimate_min`], ss[`${prefix}_total_estimate_max`]);
    const hardCost = formatDollarRange(ss[`${prefix}_hard_cost_min`], ss[`${prefix}_hard_cost_max`]);
    const akLabor = formatDollarRange(ss[`${prefix}_ak_labor_min`], ss[`${prefix}_ak_labor_max`]);
    const hours = formatHoursRange(ss[`${prefix}_ak_hours_min`], ss[`${prefix}_ak_hours_max`]);

    primaryLabel = totalEst;
    if (hours) hoursLabel = hours.replace(/ hrs$/, '') + ' AK hrs';
    if (hardCost) breakdownLines.push({ label: 'Hard Cost', value: hardCost });
    if (!isClientView && akLabor) breakdownLines.push({ label: 'AK Labor', value: akLabor });
    if (ss[`${prefix}_hard_cost_tbd_count`] > 0) {
      breakdownLines.push({ label: 'TBD', value: `${ss[`${prefix}_hard_cost_tbd_count`]} items` });
    }
  } else {
    // Legacy
    const budget = formatDollarRange(legacyBudgetMin, legacyBudgetMax);
    primaryLabel = budget;
    const hours = formatHoursRange(legacyHoursMin, legacyHoursMax);
    if (hours) hoursLabel = hours.replace(/ hrs$/, '') + ' AK hrs';
  }

  const hasBreakdown = breakdownLines.length > 0;

  return (
    <div className={cn("border rounded-lg p-3", colorClasses.border, colorClasses.bg)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("w-3.5 h-3.5", colorClasses.label)} />
        <p className={cn("text-xs", colorClasses.label)}>{title}</p>
      </div>
      <p className={cn("text-lg font-bold", colorClasses.count)}>{itemCount} item{itemCount !== 1 ? 's' : ''}</p>

      {primaryLabel && <p className="text-sm font-semibold text-white mt-0.5">{primaryLabel}</p>}
      {hoursLabel && <p className="text-[11px] text-red-400/70 mt-0.5">{hoursLabel}</p>}

      {/* Collapsible confirmed cost breakdown */}
      {hasBreakdown && (
        <div className="mt-1">
          <button onClick={() => setBreakdownOpen(!breakdownOpen)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
            {breakdownOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>View confirmed cost breakdown</span>
          </button>
          {breakdownOpen && (
            <div className="mt-1 pl-2 space-y-0.5">
              {breakdownLines.map((l, i) => (
                <p key={i} className={cn("text-[11px]", l.label === 'TBD' ? "text-gray-500" : "text-gray-400")}>
                  {l.label}: <span className={colorClasses.value}>{l.value}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}