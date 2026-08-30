import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computeRollup, formatBudgetCompact, formatHoursRange } from "./scopeHelpers";
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
}) {
  const [collapsed, setCollapsed] = useState(false);

  const allItems = group.items || [];
  const filteredItems = filter === "all" ? allItems : allItems.filter(i => (i.decision_status || "needs_review") === filter);
  const stats = computeRollup(allItems, laborEstimates);
  const budget = formatBudgetCompact(stats.budget_min, stats.budget_max, false);

  // Hide empty groups after filtering
  if (filter !== "all" && filteredItems.length === 0) return null;

  const statusParts = [];
  if (stats.approved > 0) statusParts.push(`${stats.approved} Approved`);
  if (stats.needs_review > 0) statusParts.push(`${stats.needs_review} Needs Review`);
  if (stats.request_changes > 0) statusParts.push(`${stats.request_changes} Changes`);
  if (stats.reapproval_required > 0) statusParts.push(`${stats.reapproval_required} Reapproval`);

  const canEdit = !isClientView;

  return (
    <div className="space-y-2">
      {/* Group Header */}
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
            {statusParts.join(' · ')}
          </span>
          <span className="flex-1" />
          {stats.ak_hours_max > 0 && (
            <span className="text-[10px] text-red-400/60 mr-2">{formatHoursRange(stats.ak_hours_min, stats.ak_hours_max)}</span>
          )}
          {budget && <span className="text-[10px] text-cyan-500/70">{budget}</span>}
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