import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Shield, AlertTriangle, PauseCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHoursRange } from "./scopeHelpers";
import { computeScopePricingRollup, formatDollarRange } from "./scopePricingHelpers";
import HistoricalConfirmationDisplay from "./HistoricalConfirmationDisplay";

function isConfirmationStale(lastConfirmation, items) {
  if (!lastConfirmation) return false;
  const currentApprovedIds = items
    .filter(i => i.decision_status === 'approved')
    .map(i => i.id)
    .sort();
  const snapshotIds = (lastConfirmation.approved_item_ids || []).slice().sort();
  if (currentApprovedIds.length !== snapshotIds.length) return true;
  return currentApprovedIds.some((id, idx) => id !== snapshotIds[idx]);
}

function ConfirmDispositionSummary({ icon: Icon, title, items, laborEstimates, colorClasses, isClientView }) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const rollup = computeScopePricingRollup(items, laborEstimates);
  const hoursLabel = formatHoursRange(rollup.ak_hours_min, rollup.ak_hours_max);

  // Primary: total estimate if all classified & complete
  let primaryLabel = null;
  let secondaryLines = [];

  if (rollup.classified_count > 0 && rollup.legacy_count === 0 && !rollup.has_incomplete && rollup.hard_cost_tbd_count === 0) {
    primaryLabel = formatDollarRange(rollup.total_estimate_min, rollup.total_estimate_max);
    const hc = formatDollarRange(rollup.hard_cost_min, rollup.hard_cost_max);
    if (hc) secondaryLines.push({ label: 'Hard Cost', value: hc });
    if (!isClientView) {
      const labor = formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max);
      if (labor) secondaryLines.push({ label: 'AK Labor', value: labor });
    }
  } else {
    if (rollup.classified_count > 0) {
      const hc = formatDollarRange(rollup.hard_cost_min, rollup.hard_cost_max);
      if (hc) secondaryLines.push({ label: 'Hard Cost', value: hc });
    }
    if (rollup.legacy_count > 0) {
      const leg = formatDollarRange(rollup.legacy_budget_min, rollup.legacy_budget_max);
      if (leg) secondaryLines.push({ label: rollup.classified_count > 0 ? 'Legacy Estimate' : 'Estimate', value: leg });
    }
    if (!isClientView) {
      const labor = formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max);
      if (labor) secondaryLines.push({ label: 'AK Labor', value: labor });
    }
  }

  const hasBreakdown = secondaryLines.length > 0;

  return (
    <div className={cn("border rounded-lg p-3", colorClasses.border, colorClasses.bg)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("w-3.5 h-3.5", colorClasses.label)} />
        <p className={cn("text-xs", colorClasses.label)}>{title}</p>
      </div>
      <p className={cn("text-lg font-bold", colorClasses.count)}>{rollup.count} item{rollup.count !== 1 ? 's' : ''}</p>

      {/* Primary total */}
      {primaryLabel && (
        <p className="text-sm font-semibold text-white mt-0.5">{primaryLabel}</p>
      )}

      {/* Hours */}
      {hoursLabel && <p className="text-[11px] text-red-400/70 mt-0.5">{hoursLabel.replace(/ hrs$/, '')} AK hrs</p>}

      {/* Collapsible breakdown */}
      {hasBreakdown && (
        <div className="mt-1">
          <button onClick={() => setBreakdownOpen(!breakdownOpen)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
            {breakdownOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>Cost Breakdown</span>
          </button>
          {breakdownOpen && (
            <div className="mt-1 pl-2 space-y-0.5">
              {secondaryLines.map((l, i) => (
                <p key={i} className="text-[11px] text-gray-500">
                  {l.label}: <span className={colorClasses.value}>{l.value}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {rollup.hard_cost_tbd_count > 0 && <p className="text-[11px] text-gray-500 mt-0.5">+ {rollup.hard_cost_tbd_count} TBD</p>}
      {rollup.legacy_budget_tbd_count > 0 && <p className="text-[11px] text-gray-500 mt-0.5">+ {rollup.legacy_budget_tbd_count} TBD</p>}
    </div>
  );
}

export default function ScopeConfirmPanel({
  stats,
  items = [],
  laborEstimates = [],
  lastConfirmation,
  onConfirm,
  readOnly = false,
  isMobile = false,
  isClientView = false,
}) {
  const [confirming, setConfirming] = useState(false);
  const stale = useMemo(() => isConfirmationStale(lastConfirmation, items), [lastConfirmation, items]);

  if (!stats || stats.total === 0) return null;

  const approvedItems = items.filter(i => i.decision_status === 'approved');
  const notNowItems = items.filter(i => i.decision_status === 'not_now');
  const allReviewed = stats.needs_review === 0 && stats.reapproval_required === 0;
  const unreviewedCount = stats.needs_review + stats.reapproval_required;
  const hasDecisions = approvedItems.length > 0 || notNowItems.length > 0;

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm?.();
    setConfirming(false);
  };

  return (
    <Card className="bg-gray-900/60 border-cyan-700/30">
      <CardContent className={cn("space-y-4", isMobile ? "p-3" : "p-5")}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className={cn("font-bold text-white", isMobile ? "text-base" : "text-lg")}>Scope Confirmation</h3>
            <p className="text-xs text-gray-400">Review your selections and confirm the selected project scope</p>
          </div>
        </div>

        {stale && lastConfirmation && (
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-950/30 border border-amber-700/30">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs text-amber-300 font-medium">Scope changed since confirmation</p>
              <p className="text-[11px] text-amber-400/70 mt-0.5">
                Confirmed {lastConfirmation.confirmed_by_name ? `by ${lastConfirmation.confirmed_by_name}` : ''}
                {' '}on {new Date(lastConfirmation.confirmed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {lastConfirmation.revision > 1 && ` (v${lastConfirmation.revision})`}
                {' · '}Reconfirmation required
              </p>
            </div>
          </div>
        )}

        {/* Empty state — no decisions yet */}
        {!hasDecisions && !allReviewed && (
          <p className="text-xs text-amber-400">
            {unreviewedCount} item{unreviewedCount !== 1 ? 's' : ''} still need review before confirmation
          </p>
        )}

        {/* Disposition summaries — only show when decisions exist */}
        {hasDecisions && (
          <div className={cn("grid gap-3", approvedItems.length > 0 && notNowItems.length > 0 ? "grid-cols-2" : "grid-cols-1")}>
            {approvedItems.length > 0 && (
              <ConfirmDispositionSummary
                icon={CheckCircle2}
                title="Approved"
                items={approvedItems}
                laborEstimates={laborEstimates}
                isClientView={isClientView}
                colorClasses={{
                  bg: 'bg-green-950/20',
                  border: 'border-green-700/30',
                  label: 'text-green-400/70',
                  count: 'text-green-300',
                  value: 'text-green-400',
                }}
              />
            )}
            {notNowItems.length > 0 && (
              <ConfirmDispositionSummary
                icon={PauseCircle}
                title="Not Now"
                items={notNowItems}
                laborEstimates={laborEstimates}
                isClientView={isClientView}
                colorClasses={{
                  bg: 'bg-gray-800/50',
                  border: 'border-gray-700/30',
                  label: 'text-gray-400',
                  count: 'text-gray-300',
                  value: 'text-gray-400',
                }}
              />
            )}
          </div>
        )}

        {/* Remaining items to review */}
        {hasDecisions && !allReviewed && (
          <p className="text-xs text-amber-400">
            {unreviewedCount} item{unreviewedCount !== 1 ? 's' : ''} still need review before confirmation
          </p>
        )}

        {stats.request_changes > 0 && (
          <p className="text-xs text-orange-400">{stats.request_changes} item{stats.request_changes !== 1 ? 's' : ''} with changes requested</p>
        )}

        {lastConfirmation && !stale && (
          <HistoricalConfirmationDisplay confirmation={lastConfirmation} isClientView={isClientView} />
        )}

        {!readOnly && (
          <Button
            onClick={handleConfirm}
            disabled={!allReviewed || stats.approved === 0 || confirming}
            className={cn(
              "w-full gap-2",
              allReviewed && stats.approved > 0
                ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            )}
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {stale ? 'Reconfirm Scope' : 'Confirm Selected Scope'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}