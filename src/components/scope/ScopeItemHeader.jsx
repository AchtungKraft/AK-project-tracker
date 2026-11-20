import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DECISION_LABELS, DECISION_COLORS } from "./scopeHelpers";
import StaffStatusOverrideMenu from "./StaffStatusOverrideMenu";
import ScopeTaskConversionBadge from "./ScopeTaskConversionBadge";
import { getTotalDisplay } from "./scopeItemDisplay";

/** Compact deliverable header: title + task link left; status, total, hours, menu on one right-aligned line. */
export default function ScopeItemHeader({ item, pricing, status, isStaff, onStaffStatusChange, onStaffRequireReapproval, onEdit, onCreateTask }) {
  const { totalLabel, pendingReason } = getTotalDisplay(pricing);
  const isTbd = pricing.hard_cost_tbd || pricing.legacy_budget_tbd || pricing.labor_tbd_count > 0;
  const isPartial = !!totalLabel && !!pendingReason;
  const hours = pricing.ak_hours_label;
  const menu = isStaff && (
    <StaffStatusOverrideMenu item={item} onStatusChange={onStaffStatusChange} onRequireReapproval={onStaffRequireReapproval} onEdit={onEdit} />
  );

  return (
    <div className="flex flex-col md:flex-row md:items-start gap-1 md:gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h4 className="flex-1 min-w-0 text-[15px] font-semibold text-white leading-snug break-words">{item.title}</h4>
          <div className="sm:hidden shrink-0 -my-1.5">{menu}</div>
        </div>
        {isStaff && <div className="mt-0.5"><ScopeTaskConversionBadge itemId={item.id} onCreateTask={onCreateTask} /></div>}
      </div>
      <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap md:flex-nowrap shrink-0 tabular-nums" title={pendingReason || undefined}>
        <Badge className={cn("text-[10px] px-1.5 py-0 h-5 border whitespace-nowrap", DECISION_COLORS[status])}>{DECISION_LABELS[status]}</Badge>
        {totalLabel
          ? <span className="text-[15px] font-bold text-white whitespace-nowrap">{totalLabel}</span>
          : <span className="text-sm font-medium text-amber-400/90">{isTbd ? 'TBD' : 'Pending'}</span>}
        {isPartial && <span className="text-[10px] font-medium uppercase tracking-wide text-amber-400/90 border border-amber-600/40 rounded px-1 leading-4">Partial</span>}
        {hours && <span className="text-xs font-medium text-red-400/90 whitespace-nowrap">{hours.replace(/ hrs$/, '')} AK hrs</span>}
        <div className="hidden sm:block -my-1.5">{menu}</div>
      </div>
    </div>
  );
}