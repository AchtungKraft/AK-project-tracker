import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Package, ShoppingCart, Truck, Wrench, CheckCircle2, AlertTriangle, Filter, Box } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { aggregateCanonicalMetrics, STATE_DISPLAY } from "./canonicalPartState";

/**
 * UnifiedSupplySummary — Single canonical supply summary for PSM
 * 
 * Replaces BOTH ProjectSupplySummaryBar (quantity chips) and PSMSummaryStrip (item pills).
 * All values derived from ONE canonical resolver (canonicalPartState).
 * 
 * Layout:
 *   Row 1: Progress bar (installed / required) — labeled explicitly
 *   Row 2: Quantity totals (simplified: Required, Ready, On Order, Installed, Gap)
 *   Row 3: Item state counts (line items) — clickable filters
 */

function QtyChip({ label, value, color, icon: Icon, tooltip }) {
  if (value === 0 && label === 'Gap') return null;
  
  const chip = (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-gray-800/50 border border-gray-700/50">
      {Icon && <Icon className={cn("w-3.5 h-3.5", color || "text-gray-400")} />}
      <span className={cn("text-sm font-bold font-mono", color || "text-white")}>{value}</span>
      <span className="text-[10px] text-gray-500 uppercase">{label}</span>
    </div>
  );

  if (!tooltip) return chip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function StateFilterPill({ label, count, color, bgColor, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all",
        active
          ? `${bgColor} ${color} border-current font-semibold`
          : "bg-gray-800/40 border-gray-700/50 hover:border-gray-600",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      <span className={cn("font-bold font-mono", active ? color : "text-white")}>{count}</span>
      <span className={cn("text-[10px]", active ? color : "text-gray-400")}>{label}</span>
    </button>
  );
}

export default function UnifiedSupplySummary({ items = [], activeFilter, onFilterChange }) {
  const { qty, counts, progressPct } = useMemo(
    () => aggregateCanonicalMetrics(items),
    [items]
  );

  const stateFilters = [
    { key: 'NEEDS_ORDER', label: 'Need Order',  count: counts.NEEDS_ORDER, ...STATE_DISPLAY.NEEDS_ORDER },
    { key: 'ON_ORDER',    label: 'On Order',     count: counts.ON_ORDER,    ...STATE_DISPLAY.ON_ORDER },
    { key: 'READY',       label: 'Ready',         count: counts.READY,       ...STATE_DISPLAY.READY },
    { key: 'COMPLETE',    label: 'Complete',       count: counts.COMPLETE,    ...STATE_DISPLAY.COMPLETE },
    { key: 'PLANNED',     label: 'Planned',        count: counts.PLANNED,     ...STATE_DISPLAY.PLANNED },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 space-y-3">
          {/* Row 1: Progress bar — installed / required, explicitly labeled */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Progress value={progressPct} className="h-2 bg-gray-800" />
            </div>
            <span className="text-sm font-bold text-white font-mono">{progressPct}%</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Installed</span>
          </div>

          {/* Row 2: Simplified quantity metrics — no redundancy */}
          <div className="flex items-center gap-2 flex-wrap">
            <QtyChip
              label="Required"
              value={qty.required}
              icon={Package}
              tooltip="Total units needed for this project."
            />
            <QtyChip
              label="Ready"
              value={qty.readyToInstall}
              color="text-emerald-400"
              icon={Box}
              tooltip="Physically in inventory, allocated to this project, and available for installation right now. Does not include ordered or future inventory."
            />
            <QtyChip
              label="On Order"
              value={qty.onOrder}
              color="text-blue-400"
              icon={Truck}
              tooltip="Covered by purchase orders but not yet received into inventory."
            />
            <QtyChip
              label="Installed"
              value={qty.installed}
              color="text-cyan-400"
              icon={Wrench}
              tooltip="Units physically installed on the vehicle."
            />
            <QtyChip
              label="Gap"
              value={qty.gap}
              color="text-red-400"
              icon={AlertTriangle}
              tooltip="Units still needing procurement coverage. Not reserved and not on order."
            />
          </div>

          {/* Row 3: Item counts by state — clickable operational filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 mr-1">
              <Filter className="w-3 h-3 text-gray-600" />
              <span className="text-[10px] text-gray-600 uppercase">Items</span>
            </div>

            <StateFilterPill
              label={`Total`}
              count={counts.total}
              color="text-white"
              bgColor="bg-gray-700/50"
              active={!activeFilter}
              onClick={() => onFilterChange?.(null)}
            />

            {stateFilters.filter(sf => sf.count > 0).map(sf => (
              <StateFilterPill
                key={sf.key}
                label={sf.label}
                count={sf.count}
                color={sf.color}
                bgColor={sf.bgColor}
                active={activeFilter === sf.key}
                onClick={() => onFilterChange?.(activeFilter === sf.key ? null : sf.key)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

/**
 * Filter items by canonical state — exported for use in page-level filtering
 */
export { resolveCanonicalPartState } from './canonicalPartState';

export function filterByCanonicalState(items, stateFilter) {
  if (!stateFilter) return items;

  return items.filter(item => {
    const rt = item.required_total ?? 0;
    const qr = item.qty_removed ?? 0;
    const effReq = Math.max(0, rt - qr);
    const rfs = item.reserved_from_stock ?? 0;
    const cfp = item.covered_from_po ?? 0;
    const qi = item.qty_installed ?? 0;
    // READY = reserved_from_stock - installed ONLY (no covered_from_po)
    const readyQty = Math.max(0, rfs - qi);
    const gap = Math.max(0, effReq - rfs - cfp - qi);

    let state;
    if (effReq === 0) state = 'PLANNED';
    else if (qi >= effReq) state = 'COMPLETE';
    else if (readyQty > 0) state = 'READY';
    else if (cfp > 0 && gap === 0) state = 'ON_ORDER';
    else if (gap > 0) state = 'NEEDS_ORDER';
    else if (rfs > 0 || cfp > 0) state = 'ON_ORDER';
    else state = 'PLANNED';

    return state === stateFilter;
  });
}