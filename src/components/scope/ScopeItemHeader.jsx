import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DECISION_LABELS, DECISION_COLORS, formatHoursRange } from "./scopeHelpers";
import StaffStatusOverrideMenu from "./StaffStatusOverrideMenu";
import { getTotalDisplay } from "./scopeItemDisplay";

/** Deliverable header: title, status, total estimate and total AK hours. */
export default function ScopeItemHeader({ item, pricing, status, isStaff, onStaffStatusChange, onStaffRequireReapproval, onEdit }) {
  const { totalLabel, pendingReason } = getTotalDisplay(pricing);
  const hours = formatHoursRange(pricing.ak_hours_min, pricing.ak_hours_max);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h4 className="flex-1 min-w-0 text-base font-semibold text-white leading-snug break-words">{item.title}</h4>
          <div className="flex items-center gap-1 shrink-0 sm:hidden">
            <StatusBadge status={status} />
            {isStaff && <StaffStatusOverrideMenu item={item} onStatusChange={onStaffStatusChange} onRequireReapproval={onStaffRequireReapproval} onEdit={onEdit} />}
          </div>
        </div>
      </div>
      <div className="flex sm:flex-col items-baseline sm:items-end gap-x-3 gap-y-0.5 shrink-0 sm:text-right">
        <div className="hidden sm:flex items-center gap-1">
          <StatusBadge status={status} />
          {isStaff && <StaffStatusOverrideMenu item={item} onStatusChange={onStaffStatusChange} onRequireReapproval={onStaffRequireReapproval} onEdit={onEdit} />}
        </div>
        {totalLabel
          ? <p className="text-lg font-bold text-white tabular-nums leading-tight">{totalLabel}</p>
          : <p className="text-sm text-gray-400 italic">{pendingReason}</p>}
        {hours && <p className="text-xs font-medium text-red-400/90 tabular-nums">{hours.replace(/ hrs$/, '')} AK hrs</p>}
        {totalLabel && pendingReason && <p className="text-[11px] text-amber-400/80 italic">{pendingReason}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  return <Badge className={cn("text-[10px] px-1.5 py-0 h-5 border whitespace-nowrap", DECISION_COLORS[status])}>{DECISION_LABELS[status]}</Badge>;
}