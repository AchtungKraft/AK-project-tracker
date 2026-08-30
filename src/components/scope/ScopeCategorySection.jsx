import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeRollup, formatBudgetCompact } from "./scopeHelpers";
import ScopeGroupSection from "./ScopeGroupSection";

export default function ScopeCategorySection({
  category,
  comments = [],
  history = [],
  onDecision,
  onComment,
  isClientView = false,
  readOnly = false,
  onEditItem,
  isMobile = false,
  filter = "all",
}) {
  const [collapsed, setCollapsed] = useState(false);

  const allItems = (category.groups || []).flatMap(g => g.items || []);
  const stats = computeRollup(allItems);
  const budget = formatBudgetCompact(stats.budget_min, stats.budget_max, false);

  // If filtering, check if any items match
  const hasMatchingItems = filter === "all" || allItems.some(i => (i.decision_status || "needs_review") === filter);
  if (filter !== "all" && !hasMatchingItems) return null;

  const statusParts = [];
  if (stats.approved > 0) statusParts.push(`${stats.approved} Approved`);
  if (stats.needs_review > 0) statusParts.push(`${stats.needs_review} Needs Review`);
  if (stats.request_changes > 0) statusParts.push(`${stats.request_changes} Changes`);
  if (stats.reapproval_required > 0) statusParts.push(`${stats.reapproval_required} Reapproval`);
  if (stats.not_now > 0) statusParts.push(`${stats.not_now} Not Now`);

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-3",
      isMobile ? "p-2" : "p-4",
      "bg-gray-900/40 border-gray-700/50"
    )}>
      {/* Category Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 text-left"
      >
        {collapsed ? (
          <ChevronRight className="w-5 h-5 text-cyan-500 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-cyan-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className={cn("font-bold uppercase tracking-wider text-white", isMobile ? "text-sm" : "text-base")}>
            {category.name}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {statusParts.join(' · ')}
            {budget && <span className="text-cyan-500/70 ml-2">{budget}</span>}
          </p>
        </div>
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded",
          stats.total === stats.approved ? "bg-green-900/30 text-green-400" : "bg-gray-800 text-gray-400"
        )}>
          {stats.total} item{stats.total !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Groups */}
      {!collapsed && (
        <div className="space-y-4">
          {(category.groups || []).map(group => (
            <ScopeGroupSection
              key={group.id}
              group={group}
              comments={comments}
              history={history}
              onDecision={onDecision}
              onComment={onComment}
              isClientView={isClientView}
              readOnly={readOnly}
              onEditItem={onEditItem}
              isMobile={isMobile}
              filter={filter}
            />
          ))}
        </div>
      )}
    </div>
  );
}