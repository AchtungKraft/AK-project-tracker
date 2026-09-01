import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, MessageSquare, XCircle, AlertTriangle, PauseCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHoursRange } from "./scopeHelpers";
import { computeScopePricingRollup, formatDollarRange } from "./scopePricingHelpers";

function DispositionCard({ icon: Icon, label, items, laborEstimates, colorScheme, isMobile, isClientView }) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  if (!items || items.length === 0) return null;

  const rollup = computeScopePricingRollup(items, laborEstimates);
  const hasLabor = rollup.ak_hours_min > 0 || rollup.ak_hours_max > 0;
  const hoursLabel = hasLabor ? formatHoursRange(rollup.ak_hours_min, rollup.ak_hours_max) : null;

  // Primary: total estimate
  let primaryLabel = null;
  let secondaryLines = [];

  if (rollup.classified_count > 0 && rollup.legacy_count === 0) {
    if (!rollup.has_incomplete && rollup.hard_cost_tbd_count === 0) {
      primaryLabel = formatDollarRange(rollup.total_estimate_min, rollup.total_estimate_max);
      const hc = formatDollarRange(rollup.hard_cost_min, rollup.hard_cost_max);
      if (hc) secondaryLines.push({ label: 'Hard Cost', value: hc });
      if (hasLabor) secondaryLines.push({ label: 'AK Labor', value: formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max) });
    } else {
      const hc = formatDollarRange(rollup.hard_cost_min, rollup.hard_cost_max);
      if (hc) secondaryLines.push({ label: 'Hard Cost', value: hc });
      if (rollup.hard_cost_tbd_count > 0) secondaryLines.push({ label: 'Hard Cost TBD', value: `${rollup.hard_cost_tbd_count} item${rollup.hard_cost_tbd_count > 1 ? 's' : ''}` });
      if (hasLabor) secondaryLines.push({ label: 'AK Labor', value: formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max) });
    }
  } else if (rollup.legacy_count > 0 && rollup.classified_count === 0) {
    primaryLabel = formatDollarRange(rollup.legacy_budget_min, rollup.legacy_budget_max);
    if (hasLabor) secondaryLines.push({ label: 'AK Labor', value: formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max) });
  } else {
    const totalClassified = formatDollarRange(rollup.total_estimate_min, rollup.total_estimate_max);
    const totalLegacy = formatDollarRange(rollup.legacy_budget_min, rollup.legacy_budget_max);
    if (totalClassified) secondaryLines.push({ label: 'Classified', value: totalClassified });
    if (totalLegacy) secondaryLines.push({ label: 'Legacy', value: totalLegacy });
    if (hasLabor) secondaryLines.push({ label: 'AK Labor', value: formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max) });
  }

  const hasBreakdown = secondaryLines.length > 0;

  return (
    <Card className={cn("border", colorScheme.card)}>
      <CardContent className={cn(isMobile ? "p-3" : "p-4", "space-y-1")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", colorScheme.iconBg)}>
              <Icon className={cn("w-5 h-5", colorScheme.icon)} />
            </div>
            <div>
              <p className={cn("font-bold", colorScheme.title, isMobile ? "text-sm" : "text-base")}>{label}</p>
              <p className={cn("text-xs", colorScheme.subtitle)}>
                {rollup.count} item{rollup.count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="text-right">
            {primaryLabel && (
              <p className={cn("font-bold text-white", isMobile ? "text-lg" : "text-xl")}>{primaryLabel}</p>
            )}
            {hoursLabel && (
              <p className="text-xs text-red-400/70">{hoursLabel.replace(/ hrs$/, '')} AK hrs</p>
            )}
          </div>
        </div>

        {/* Collapsible cost breakdown */}
        {hasBreakdown && (
          <div>
            <button onClick={() => setBreakdownOpen(!breakdownOpen)}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors mt-1">
              {breakdownOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span>Cost Breakdown</span>
            </button>
            {breakdownOpen && (
              <div className="mt-1 pl-3 space-y-0.5 border-l border-gray-700/30">
                {secondaryLines.map((l, i) => (
                  <p key={i} className="text-[11px] text-gray-500">
                    <span>{l.label}:</span>{' '}
                    <span className="text-gray-400">{l.value}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const APPROVED_COLORS = {
  card: "bg-green-950/20 border-green-700/40",
  iconBg: "bg-green-500/20",
  icon: "text-green-400",
  title: "text-green-300",
  subtitle: "text-green-400/70",
};

const NOT_NOW_COLORS = {
  card: "bg-gray-800/40 border-gray-700/40",
  iconBg: "bg-gray-500/20",
  icon: "text-gray-400",
  title: "text-gray-300",
  subtitle: "text-gray-400/70",
};

export default function ScopeSummaryBar({ stats, items = [], laborEstimates = [], isMobile = false, isClientView = false }) {
  if (!stats || stats.total === 0) return null;

  const approvedItems = items.filter(i => i.decision_status === 'approved');
  const notNowItems = items.filter(i => i.decision_status === 'not_now');

  return (
    <div className="space-y-3">
      {/* Disposition cards */}
      <div className={cn(
        "grid gap-3",
        (approvedItems.length > 0 && notNowItems.length > 0) ? (isMobile ? "grid-cols-1" : "grid-cols-2") : "grid-cols-1"
      )}>
        <DispositionCard
          icon={CheckCircle2}
          label="Approved Scope"
          items={approvedItems}
          laborEstimates={laborEstimates}
          colorScheme={APPROVED_COLORS}
          isMobile={isMobile}
          isClientView={isClientView}
        />
        <DispositionCard
          icon={PauseCircle}
          label="Not Now"
          items={notNowItems}
          laborEstimates={laborEstimates}
          colorScheme={NOT_NOW_COLORS}
          isMobile={isMobile}
          isClientView={isClientView}
        />
      </div>

      {/* Status breakdown */}
      <div className={cn("grid gap-2", isMobile ? "grid-cols-2" : "grid-cols-5")}>
        <StatusChip icon={Clock} label="Needs Review" count={stats.needs_review} color="amber" />
        <StatusChip icon={CheckCircle2} label="Approved" count={stats.approved} color="green" />
        <StatusChip icon={MessageSquare} label="Changes" count={stats.request_changes} color="orange" />
        <StatusChip icon={XCircle} label="Not Now" count={stats.not_now} color="gray" />
        <StatusChip icon={AlertTriangle} label="Reapproval" count={stats.reapproval_required} color="red" />
      </div>
    </div>
  );
}

function StatusChip({ icon: Icon, label, count, color }) {
  if (count === 0) return null;
  const colorMap = {
    amber: "bg-amber-950/30 border-amber-700/40 text-amber-400",
    green: "bg-green-950/30 border-green-700/40 text-green-400",
    orange: "bg-orange-950/30 border-orange-700/40 text-orange-400",
    gray: "bg-gray-800/50 border-gray-700/40 text-gray-400",
    red: "bg-red-950/30 border-red-700/40 text-red-400",
  };

  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", colorMap[color])}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium">{count}</span>
      <span className="text-xs opacity-70 truncate">{label}</span>
    </div>
  );
}