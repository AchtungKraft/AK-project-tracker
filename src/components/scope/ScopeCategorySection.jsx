import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computeRollup, formatHoursRange } from "./scopeHelpers";
import { computeScopePricingRollup, formatDollarCompact } from "./scopePricingHelpers";
import ScopeGroupSection from "./ScopeGroupSection";

export default function ScopeCategorySection({
  category,
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
}) {
  const [collapsed, setCollapsed] = useState(false);

  const allItems = category.allItems || (category.groups || []).flatMap(g => g.items || []);
  const stats = computeRollup(allItems, laborEstimates);
  const pricingRollup = computeScopePricingRollup(allItems, laborEstimates);

  // If filtering, check if any items match
  const hasMatchingItems = filter === "all" || allItems.some(i => (i.decision_status || "needs_review") === filter);

  if (isClientView && allItems.length === 0) return null;
  if (filter !== "all" && !hasMatchingItems) return null;

  // Compute the total label for the category
  const totalLabel = pricingRollup.all_classified && !pricingRollup.has_incomplete && pricingRollup.hard_cost_tbd_count === 0
    ? formatDollarCompact(pricingRollup.total_estimate_min, pricingRollup.total_estimate_max)
    : formatDollarCompact(
        pricingRollup.legacy_budget_min + pricingRollup.hard_cost_min + pricingRollup.ak_labor_min,
        pricingRollup.legacy_budget_max + pricingRollup.hard_cost_max + pricingRollup.ak_labor_max
      );
  const hoursLabel = pricingRollup.ak_hours_max > 0
    ? formatHoursRange(pricingRollup.ak_hours_min, pricingRollup.ak_hours_max)?.replace(/ hrs$/, '')
    : null;

  const canEdit = !isClientView;

  // Count populated groups for suppression logic
  const populatedGroupCount = (category.groups || []).filter(g => (g.items || []).length > 0).length;

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-3",
      isMobile ? "p-2" : "p-4",
      "bg-gray-900/40 border-gray-700/50"
    )}>
      {/* Category Header — simplified */}
      <div className="flex items-center gap-2">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1 text-left min-w-0">
          {collapsed
            ? <ChevronRight className="w-5 h-5 text-cyan-500 shrink-0" />
            : <ChevronDown className="w-5 h-5 text-cyan-500 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <h3 className={cn("font-bold uppercase tracking-wider text-white", isMobile ? "text-sm" : "text-base")}>
              {category.name}
            </h3>
            {allItems.length > 0 ? (
              <p className="text-xs text-gray-500 mt-0.5">
                {stats.total} item{stats.total !== 1 ? 's' : ''}
                {totalLabel && <span className="text-gray-400 ml-1">· {totalLabel} total</span>}
                {hoursLabel && <span className="text-red-400/60 ml-1">· {hoursLabel} AK hrs</span>}
              </p>
            ) : (
              <p className="text-xs text-gray-600 mt-0.5 italic">No scope items yet</p>
            )}
          </div>
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <>
          {(category.groups || []).length > 0 ? (
            <div className="space-y-4">
              {(category.groups || []).map(group => (
                <ScopeGroupSection
                  key={group.id}
                  group={group}
                  categoryId={category.id}
                  comments={comments}
                  history={history}
                  laborEstimates={laborEstimates}
                  onDecision={onDecision}
                  onComment={onComment}
                  onStaffStatusChange={onStaffStatusChange}
                  onStaffRequireReapproval={onStaffRequireReapproval}
                  isClientView={isClientView}
                  readOnly={readOnly}
                  onEditItem={onEditItem}
                  onAddItem={onAddItem}
                  isMobile={isMobile}
                  filter={filter}
                  suppressPricing={populatedGroupCount <= 1}
                />
              ))}
            </div>
          ) : canEdit && allItems.length === 0 ? (
            <div className="py-2 pl-4">
              <Button size="sm" variant="ghost" onClick={() => onAddItem?.({ categoryId: category.id })}
                className="text-xs text-gray-500 hover:text-white gap-1 h-7">
                <Plus className="w-3 h-3" /> Add Item
              </Button>
            </div>
          ) : null}

          {canEdit && allItems.length > 0 && onAddItem && (
            <div className="pl-4">
              <Button size="sm" variant="ghost" onClick={() => onAddItem({ categoryId: category.id })}
                className="text-[11px] text-gray-600 hover:text-gray-300 gap-1 h-6 px-2">
                <Plus className="w-3 h-3" /> Item
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}