import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computeRollup, formatHoursRange } from "./scopeHelpers";
import { computeScopePricingRollup, formatDollarCompact } from "./scopePricingHelpers";
import ScopeItemCard from "./ScopeItemCard";

export default function ScopeGroupSection({
  group,
  categoryId,
  comments = [],
  history = [],
  laborEstimates = [],
  onDecision,
  onComment,
  onStaffStatusChange,
  onStaffRequireReapproval,
  isClientView = false,
  readOnly = false,
  onEditItem,
  onAddItem,
  isMobile = false,
  filter = "all",
  suppressPricing = false,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const allItems = group.items || [];
  const filteredItems = filter === "all" ? allItems : allItems.filter(i => (i.decision_status || "needs_review") === filter);

  // Hide empty groups after filtering
  if (filter !== "all" && filteredItems.length === 0) return null;

  const canEdit = !isClientView;

  // Only compute pricing if we're going to show it
  let compactTotal = null;
  if (!suppressPricing && allItems.length > 0) {
    const pricingRollup = computeScopePricingRollup(allItems, laborEstimates);
    compactTotal = pricingRollup.all_classified && !pricingRollup.has_incomplete && pricingRollup.hard_cost_tbd_count === 0
      ? formatDollarCompact(pricingRollup.total_estimate_min, pricingRollup.total_estimate_max)
      : formatDollarCompact(
          pricingRollup.legacy_budget_min + pricingRollup.hard_cost_min + pricingRollup.ak_labor_min,
          pricingRollup.legacy_budget_max + pricingRollup.hard_cost_max + pricingRollup.ak_labor_max
        );
  }

  return (
    <div className="space-y-2">
      {/* Group Header — organizational, compact */}
      <div className="flex items-center gap-1">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1 py-1 text-left group">
          {collapsed
            ? <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
          }
          <span className="font-semibold uppercase tracking-wide text-gray-300 text-xs">
            {group.name}
          </span>
          <span className="text-[10px] text-gray-500 ml-1">
            {allItems.length} item{allItems.length !== 1 ? 's' : ''}
            {compactTotal && <span className="text-gray-400 ml-1">· {compactTotal}</span>}
          </span>
          <span className="flex-1" />
        </button>

        {canEdit && onAddItem && (
          <Button size="sm" variant="ghost" onClick={() => onAddItem({ categoryId, groupId: group.id })}
            className="h-5 w-5 p-0 text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
            <Plus className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Items */}
      {!collapsed && (
        <div className={cn("space-y-2", isMobile ? "pl-2" : "pl-4")}>
          {filteredItems.map(item => (
            <ScopeItemCard
              key={item.id}
              item={item}
              comments={comments}
              history={history}
              laborEstimates={laborEstimates.filter(le => le.scope_item_id === item.id)}
              onDecision={onDecision}
              onComment={onComment}
              onStaffStatusChange={onStaffStatusChange}
              onStaffRequireReapproval={onStaffRequireReapproval}
              isClientView={isClientView}
              readOnly={readOnly}
              onEdit={onEditItem}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}
    </div>
  );
}