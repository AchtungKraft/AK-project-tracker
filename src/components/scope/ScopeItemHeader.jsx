import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DECISION_LABELS, DECISION_COLORS, formatHoursRange } from "./scopeHelpers";
import StaffStatusOverrideMenu from "./StaffStatusOverrideMenu";
import ScopeTaskConversionBadge from "./ScopeTaskConversionBadge";
import { getTotalDisplay } from "./scopeItemDisplay";

/** Compact deliverable header: title + task link left; status, total, hours, menu right. */
export default function ScopeItemHeader({ item, pricing, status, isStaff, onStaffStatusChange, onStaffRequireReapproval, onEdit, onCreateTask }) {
  const { totalLabel, pendingReason } = getTotalDisplay(pricing);
  const isTbd = pricing.hard_cost_tbd || pricing.legacy_budget_tbd;
  const hours = formatHoursRange(pricing.ak_hours_min, pricing.ak_hours_max);
  const menu = isStaff && (
    <StaffStatusOverrideMenu item={item} onStatusChange={onStaffStatusChange} onRequireReapproval={onStaffRequireReapproval} onEdit={onEdit} />
  );

  return (
    <div className="flex flex-col md:flex-row md:items-start gap-2 md:gap-5">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start gap-2">
          <h4 className="flex-1 min-w-0 text-[15px] font-semibold text-white leading-snug break-words">{item.title}</h4>
          <div className="sm:hidden shrink-0 -my-1">{menu}</div>
        </div>
        {isStaff && <ScopeTaskConversionBadge itemId={item.id} onCreateTask={onCreateTask} />}
      </div>
      <div className="flex items-center md:items-end gap-x-3 gap-y-1 flex-wrap md:flex-col md:gap-1 md:text-right md:min-w-[150px]">
        <Badge className={cn("text-[10px] px-1.5 py-0 h-5 border whitespace-nowrap", DECISION_COLORS[status])}>{DECISION_LABELS[status]}</Badge>
        <div className="flex items-baseline gap-2 md:flex-col md:items-end md:gap-0.5 tabular-nums" title={pendingReason || undefined}>
          {totalLabel
            ? <span className="text-base font-bold text-white">{totalLabel}</span>
            : <span className="text-sm font-medium text-amber-400/90">{isTbd ? 'TBD' : 'Pending'}</span>}
          {hours && <span className="text-xs font-medium text-red-400/90 whitespace-nowrap">{hours.replace(/ hrs$/, '')} AK hrs</span>}
        </div>
        <div className="hidden sm:block -my-1">{menu}</div>
      </div>
    </div>
  );
}