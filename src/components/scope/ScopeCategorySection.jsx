import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computeRollup, formatBudgetCompact } from "./scopeHelpers";
import ScopeGroupSection from "./ScopeGroupSection";

export default function ScopeCategorySection({
  category,
  comments = [],
  history = [],
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

  // Use allItems from the hierarchy builder (all items in this category)
  const allItems = category.allItems || (category.groups || []).flatMap(g => g.items || []);
  const stats = computeRollup(allItems);
  const budget = formatBudgetCompact(stats.budget_min, stats.budget_max, false);

  // If filtering, check if any items match
  const hasMatchingItems = filter === "all" || allItems.some(i => (i.decision_status || "needs_review") === filter);

  // In client view, hide empty categories entirely
  if (isClientView && allItems.length === 0) return null;
  // When filtering, hide categories with no matching items
  if (filter !== "all" && !hasMatchingItems) return null;

  const statusParts = [];
  if (stats.approved > 0) statusParts.push(`${stats.approved} Approved`);
  if (stats.needs_review > 0) statusParts.push(`${stats.needs_review} Needs Review`);
  if (stats.request_changes > 0) statusParts.push(`${stats.request_changes} Changes`);
  if (stats.reapproval_required > 0) statusParts.push(`${stats.reapproval_required} Reapproval`);
  if (stats.not_now > 0) statusParts.push(`${stats.not_now} Not Now`);

  const canEdit = !isClientView;

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-3",
      isMobile ? "p-2" : "p-4",
      "bg-gray-900/40 border-gray-700/50"
    )}>
      {/* Category Header */}
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
                {statusParts.join(' · ')}
                {budget && <span className="text-cyan-500/70 ml-2">{budget}</span>}
              </p>
            ) : (
              <p className="text-xs text-gray-600 mt-0.5 italic">No scope items yet</p>
            )}
          </div>
        </button>

        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded shrink-0",
          stats.total === 0 ? "bg-gray-800/50 text-gray-600" :
          stats.total === stats.approved ? "bg-green-900/30 text-green-400" : "bg-gray-800 text-gray-400"
        )}>
          {stats.total} item{stats.total !== 1 ? 's' : ''}
        </span>
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
                />
              ))}
            </div>
          ) : canEdit && allItems.length === 0 ? (
            /* Empty category with add action for staff */
            <div className="py-2 pl-4">
              <Button size="sm" variant="ghost" onClick={() => onAddItem?.({ categoryId: category.id })}
                className="text-xs text-gray-500 hover:text-white gap-1 h-7">
                <Plus className="w-3 h-3" /> Add Item
              </Button>
            </div>
          ) : null}

          {/* Contextual add for non-empty categories */}
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