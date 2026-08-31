import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, MessageSquare, XCircle, AlertTriangle, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHoursRange } from "./scopeHelpers";
import { computeScopePricingRollup, formatDollarRange } from "./scopePricingHelpers";

function DispositionCard({ icon: Icon, label, items, laborEstimates, colorScheme, isMobile, isClientView }) {
  if (!items || items.length === 0) return null;

  const rollup = computeScopePricingRollup(items, laborEstimates);
  const hasLabor = rollup.ak_hours_min > 0 || rollup.ak_hours_max > 0;
  const hoursLabel = hasLabor ? formatHoursRange(rollup.ak_hours_min, rollup.ak_hours_max) : null;

  // Determine what to show as the primary dollar range
  let primaryLabel = null;
  let secondaryLines = [];

  if (rollup.classified_count > 0 && rollup.legacy_count === 0) {
    // All classified — show full breakdown
    if (rollup.has_incomplete || rollup.hard_cost_tbd_count > 0) {
      // Some incomplete — show hard cost + labor separately
      const hc = formatDollarRange(rollup.hard_cost_min, rollup.hard_cost_max);
      if (hc) secondaryLines.push({ label: 'Hard Cost', value: hc, color: 'text-cyan-400' });
      if (rollup.hard_cost_tbd_count > 0) secondaryLines.push({ label: 'Hard Cost TBD', value: `${rollup.hard_cost_tbd_count} item${rollup.hard_cost_tbd_count > 1 ? 's' : ''}`, color: 'text-gray-400' });
      if (!isClientView && hasLabor) secondaryLines.push({ label: 'AK Labor', value: formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max), color: 'text-emerald-400' });
    } else {
      // All complete — show total estimate as primary
      primaryLabel = formatDollarRange(rollup.total_estimate_min, rollup.total_estimate_max);
      const hc = formatDollarRange(rollup.hard_cost_min, rollup.hard_cost_max);
      if (hc) secondaryLines.push({ label: 'Hard Cost', value: hc, color: 'text-cyan-400/70' });
      if (!isClientView && hasLabor) secondaryLines.push({ label: 'AK Labor', value: formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max), color: 'text-emerald-400/70' });
    }
  } else if (rollup.legacy_count > 0 && rollup.classified_count === 0) {
    // All legacy
    primaryLabel = formatDollarRange(rollup.legacy_budget_min, rollup.legacy_budget_max);
    if (rollup.legacy_budget_tbd_count > 0) secondaryLines.push({ label: 'TBD', value: `${rollup.legacy_budget_tbd_count} item${rollup.legacy_budget_tbd_count > 1 ? 's' : ''}`, color: 'text-gray-400' });
    if (!isClientView && hasLabor) secondaryLines.push({ label: 'AK Labor', value: formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max), color: 'text-emerald-400/70' });
  } else {
    // Mixed — show what we can
    const totalClassified = formatDollarRange(rollup.total_estimate_min, rollup.total_estimate_max);
    const totalLegacy = formatDollarRange(rollup.legacy_budget_min, rollup.legacy_budget_max);
    if (totalClassified) secondaryLines.push({ label: 'Classified', value: totalClassified, color: 'text-white' });
    if (totalLegacy) secondaryLines.push({ label: 'Legacy', value: totalLegacy, color: 'text-cyan-400/70' });
    if (!isClientView && hasLabor) secondaryLines.push({ label: 'AK Labor', value: formatDollarRange(rollup.ak_labor_min, rollup.ak_labor_max), color: 'text-emerald-400/70' });
  }

  return (
    <Card className={cn("border", colorScheme.card)}>
      <CardContent className={cn("flex items-center justify-between", isMobile ? "p-3" : "p-4")}>
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", colorScheme.iconBg)}>
            <Icon className={cn("w-5 h-5", colorScheme.icon)} />
          </div>
          <div>
            <p className={cn("font-bold", colorScheme.title, isMobile ? "text-base" : "text-lg")}>{label}</p>
            <p className={cn("text-xs", colorScheme.subtitle)}>
              {rollup.count} item{rollup.count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="text-right space-y-0.5">
          {primaryLabel && (
            <p className={cn("font-bold", colorScheme.title, isMobile ? "text-lg" : "text-xl")}>{primaryLabel}</p>
          )}
          {secondaryLines.map((l, i) => (
            <p key={i} className="text-[10px]">
              <span className="text-gray-500">{l.label}: </span>
              <span className={l.color}>{l.value}</span>
            </p>
          ))}
          {hoursLabel && (
            <p className="text-[11px] text-red-400/70">{hoursLabel.replace(/ hrs$/, '')} AK hrs</p>
          )}
        </div>
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