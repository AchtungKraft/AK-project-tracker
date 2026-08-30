import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeRollup, formatBudgetCompact, DECISION_LABELS } from "./scopeHelpers";
import ScopeItemCard from "./ScopeItemCard";

export default function ScopeGroupSection({
  group,
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

  const allItems = group.items || [];
  const filteredItems = filter === "all" ? allItems : allItems.filter(i => (i.decision_status || "needs_review") === filter);
  const stats = computeRollup(allItems);
  const budget = formatBudgetCompact(stats.budget_min, stats.budget_max, false);

  if (filter !== "all" && filteredItems.length === 0) return null;

  const statusParts = [];
  if (stats.approved > 0) statusParts.push(`${stats.approved} Approved`);
  if (stats.needs_review > 0) statusParts.push(`${stats.needs_review} Needs Review`);
  if (stats.request_changes > 0) statusParts.push(`${stats.request_changes} Changes`);
  if (stats.reapproval_required > 0) statusParts.push(`${stats.reapproval_required} Reapproval`);

  return (
    <div className="space-y-2">
      {/* Group Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 py-1.5 text-left group"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        )}
        <span className={cn("font-semibold uppercase tracking-wide text-gray-300", isMobile ? "text-xs" : "text-xs")}>
          {group.name}
        </span>
        <span className="text-[10px] text-gray-500 ml-1">
          {statusParts.join(' · ')}
        </span>
        {budget && <span className="text-[10px] text-cyan-500/70 ml-auto">{budget}</span>}
      </button>

      {/* Items */}
      {!collapsed && (
        <div className={cn("space-y-2", isMobile ? "pl-2" : "pl-4")}>
          {filteredItems.map(item => (
            <ScopeItemCard
              key={item.id}
              item={item}
              comments={comments}
              history={history}
              onDecision={onDecision}
              onComment={onComment}
              isClientView={isClientView}
              readOnly={readOnly}
              onEdit={onEditItem}
              isMobile={isMobile}
            />
          ))}
          {filteredItems.length === 0 && (
            <p className="text-xs text-gray-600 italic pl-2">No items in this group</p>
          )}
        </div>
      )}
    </div>
  );
}