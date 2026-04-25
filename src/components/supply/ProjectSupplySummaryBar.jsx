import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Package, ShoppingCart, Truck, Wrench, CheckCircle2, AlertTriangle, AlertCircle, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBlockerStatus } from "./commitmentPriority";

/**
 * ProjectSupplySummaryBar - Canonical project-level supply summary
 * 
 * All values derived from canonical fields only:
 * - required_total, reserved_from_stock, covered_from_po, qty_installed
 * - gap computed as: required_total - reserved_from_stock - covered_from_po
 */

function MetricPill({ label, value, icon: Icon, color, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all",
        active ? `${color} border-current` : "bg-gray-800/50 border-gray-700 hover:border-gray-600",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span className="text-gray-400">{label}</span>
      <span className={cn("font-bold font-mono", active ? "" : "text-white")}>{value}</span>
    </button>
  );
}

export default function ProjectSupplySummaryBar({ items = [], activeFilter, onFilterChange }) {
  const stats = useMemo(() => {
    let totalRequired = 0, totalReserved = 0, totalOnOrder = 0, totalInstalled = 0, totalGap = 0;
    let needsAction = 0, waitingPO = 0, readyInstall = 0, complete = 0;
    let blockedCount = 0, atRiskCount = 0;

    for (const item of items) {
      const rt = item.required_total ?? 0;
      const rfs = item.reserved_from_stock ?? 0;
      const cfp = item.covered_from_po ?? 0;
      const qi = item.qty_installed ?? 0;
      const qr = item.qty_removed ?? 0;
      const effReq = Math.max(0, rt - qr);
      const totalCov = rfs + cfp + qi;
      const isFulfilled = totalCov >= effReq && effReq > 0;
      const gap = Math.max(0, effReq - rfs - cfp - qi);
      const installable = Math.max(0, rfs - qi);

      totalRequired += rt;
      totalReserved += rfs;
      totalOnOrder += cfp;
      totalInstalled += qi;
      totalGap += gap;

      if (qi >= effReq && effReq > 0) complete++;
      else if (installable > 0) readyInstall++;
      else if (cfp > 0 && !isFulfilled) waitingPO++;
      else if (gap > 0) needsAction++;

      const bs = getBlockerStatus(item);
      if (bs.isBlocked) blockedCount++;
      else if (bs.isAtRisk) atRiskCount++;
    }

    const progressPct = totalRequired > 0 ? Math.round((totalInstalled / totalRequired) * 100) : 0;
    return { totalRequired, totalReserved, totalOnOrder, totalInstalled, totalGap, needsAction, waitingPO, readyInstall, complete, progressPct, totalItems: items.length, blockedCount, atRiskCount };
  }, [items]);

  return (
    <Card className="bg-black/40 border-gray-800">
      <CardContent className="p-3">
        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1">
            <Progress value={stats.progressPct} className="h-2 bg-gray-800" />
          </div>
          <span className="text-sm font-bold text-white font-mono">{stats.progressPct}%</span>
          <span className="text-xs text-gray-500">installed</span>
        </div>

        {/* Quantity metrics */}
        <div className="flex items-center gap-2 flex-wrap">
          <MetricPill label="Required" value={stats.totalRequired} icon={Package} />
          <MetricPill label="Reserved" value={stats.totalReserved} color="text-cyan-400" />
          <MetricPill label="On Order" value={stats.totalOnOrder} color="text-purple-400" icon={Truck} />
          <MetricPill label="Installed" value={stats.totalInstalled} color="text-emerald-400" icon={Wrench} />
          {stats.totalGap > 0 && (
            <MetricPill label="Gap" value={stats.totalGap} color="text-red-400" icon={AlertTriangle} />
          )}

          <div className="border-l border-gray-700 pl-2 ml-1 flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-gray-500" />
            <MetricPill
              label="Needs Action" value={stats.needsAction}
              color="text-red-400 bg-red-900/30"
              onClick={() => onFilterChange?.(activeFilter === 'needs_action' ? null : 'needs_action')}
              active={activeFilter === 'needs_action'}
            />
            <MetricPill
              label="Waiting PO" value={stats.waitingPO}
              color="text-purple-400 bg-purple-900/30"
              onClick={() => onFilterChange?.(activeFilter === 'waiting_po' ? null : 'waiting_po')}
              active={activeFilter === 'waiting_po'}
            />
            <MetricPill
              label="Install Ready" value={stats.readyInstall}
              color="text-emerald-400 bg-emerald-900/30"
              onClick={() => onFilterChange?.(activeFilter === 'ready_install' ? null : 'ready_install')}
              active={activeFilter === 'ready_install'}
            />
            <MetricPill
              label="Complete" value={stats.complete}
              color="text-gray-400"
              onClick={() => onFilterChange?.(activeFilter === 'complete' ? null : 'complete')}
              active={activeFilter === 'complete'}
            />
            {stats.blockedCount > 0 && (
              <MetricPill
                label="Blocked" value={stats.blockedCount}
                color="text-red-400 bg-red-900/30"
                icon={AlertCircle}
                onClick={() => onFilterChange?.(activeFilter === 'blocked' ? null : 'blocked')}
                active={activeFilter === 'blocked'}
              />
            )}
            {stats.atRiskCount > 0 && (
              <MetricPill
                label="At Risk" value={stats.atRiskCount}
                color="text-amber-400 bg-amber-900/30"
                icon={AlertTriangle}
                onClick={() => onFilterChange?.(activeFilter === 'at_risk' ? null : 'at_risk')}
                active={activeFilter === 'at_risk'}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Filter items by action category */
export function filterByActionCategory(items, filterKey) {
  if (!filterKey) return items;
  return items.filter(item => {
    const rt = item.required_total ?? 0;
    const rfs = item.reserved_from_stock ?? 0;
    const cfp = item.covered_from_po ?? 0;
    const qi = item.qty_installed ?? 0;
    const qr = item.qty_removed ?? 0;
    const effReq = Math.max(0, rt - qr);
    const totalCov = rfs + cfp + qi;
    const isFulfilled = totalCov >= effReq && effReq > 0;
    const gap = Math.max(0, effReq - rfs - cfp - qi);
    const installable = Math.max(0, rfs - qi);

    switch (filterKey) {
      case 'needs_action': return gap > 0 && !isFulfilled;
      case 'waiting_po': return cfp > 0 && !isFulfilled;
      case 'ready_install': return installable > 0 && !isFulfilled;
      case 'complete': return qi >= effReq && effReq > 0;
      case 'blocked': {
        const bs = getBlockerStatus(item);
        return bs.isBlocked;
      }
      case 'at_risk': {
        const bs = getBlockerStatus(item);
        return bs.isAtRisk && !bs.isBlocked;
      }
      default: return true;
    }
  });
}