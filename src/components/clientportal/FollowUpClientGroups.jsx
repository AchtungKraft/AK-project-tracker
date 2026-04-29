import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, ChevronsUpDown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getTime } from "./feedbackTimeline";
import AttentionCard from "./AttentionCard";

const STORAGE_KEY = "followup_collapsed_clients";

/**
 * Group follow-up items by client name (from project.client_name).
 * Returns sorted array of { clientKey, clientName, items, overdueCount, latestActivityAt }.
 */
function groupByClient(items) {
  const map = {};
  items.forEach(item => {
    const clientName = item.project?.client_name || "Unknown Client";
    const key = clientName.toLowerCase().trim();
    if (!map[key]) {
      map[key] = { clientKey: key, clientName, items: [], overdueCount: 0, latestActivityAt: 0 };
    }
    map[key].items.push(item);
    if (item.isOverdue) map[key].overdueCount++;
    const t = getTime(item.lastActivityAt);
    if (t > map[key].latestActivityAt) map[key].latestActivityAt = t;
  });

  return Object.values(map).sort((a, b) => {
    // 1. overdue count DESC
    if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
    // 2. total follow-ups DESC
    if (a.items.length !== b.items.length) return b.items.length - a.items.length;
    // 3. last activity DESC (most recent first)
    return b.latestActivityAt - a.latestActivityAt;
  });
}

function loadCollapsedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCollapsedState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* noop */ }
}

/**
 * Client-collapsible follow-up grouping.
 * Props: items (follow-up attention items), onUpdateDueDate, mineFilter (bool)
 */
export default function FollowUpClientGroups({ items, onUpdateDueDate, mineFilter = false }) {
  const clientGroups = useMemo(() => groupByClient(items), [items]);
  const allClientKeys = useMemo(() => clientGroups.map(g => g.clientKey), [clientGroups]);

  // Collapsed state — default all collapsed, auto-expand overdue or "mine" matches
  const [collapsed, setCollapsed] = useState(() => {
    const saved = loadCollapsedState();
    if (saved) {
      // Merge saved with any new clients (default new ones to collapsed)
      const merged = {};
      allClientKeys.forEach(k => { merged[k] = saved[k] !== undefined ? saved[k] : true; });
      return merged;
    }
    // Default: all collapsed
    const initial = {};
    allClientKeys.forEach(k => { initial[k] = true; });
    return initial;
  });

  // Persist collapsed state
  useEffect(() => { saveCollapsedState(collapsed); }, [collapsed]);

  // Add any new client keys that appear
  useEffect(() => {
    setCollapsed(prev => {
      const next = { ...prev };
      let changed = false;
      allClientKeys.forEach(k => {
        if (next[k] === undefined) { next[k] = true; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [allClientKeys]);

  // Auto-expand: clients with overdue items or when "mine" filter is active
  useEffect(() => {
    if (!mineFilter) return;
    setCollapsed(prev => {
      const next = { ...prev };
      clientGroups.forEach(g => {
        if (g.items.length > 0) next[g.clientKey] = false;
      });
      return next;
    });
  }, [mineFilter, clientGroups]);

  const toggleClient = useCallback((key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const allCollapsed = allClientKeys.every(k => collapsed[k]);
  const toggleAll = useCallback(() => {
    const newVal = !allCollapsed;
    setCollapsed(() => {
      const next = {};
      allClientKeys.forEach(k => { next[k] = newVal; });
      return next;
    });
  }, [allCollapsed, allClientKeys]);

  if (clientGroups.length === 0) return null;

  return (
    <div className="space-y-1">
      {/* Expand/Collapse All toggle */}
      {clientGroups.length > 1 && (
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1 mb-1"
        >
          <ChevronsUpDown className="w-3 h-3" />
          {allCollapsed ? "Expand All" : "Collapse All"}
        </button>
      )}

      {clientGroups.map(group => {
        const isCollapsed = collapsed[group.clientKey] !== false;
        const highRiskCount = group.items.filter(i => i.followUpMeta?.riskTier === "high").length;

        return (
          <div key={group.clientKey} className="border-b border-gray-800/40 last:border-b-0">
            {/* Client Header */}
            <button
              onClick={() => toggleClient(group.clientKey)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-gray-800/40 transition-colors text-left group/client"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              )}
              <Users className="w-3.5 h-3.5 text-orange-400/60 shrink-0" />
              <span className="text-xs font-semibold text-gray-200 truncate flex-1 min-w-0">
                {group.clientName}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[10px] px-1.5 py-0">
                  {group.items.length}
                </Badge>
                {group.overdueCount > 0 && (
                  <Badge className="bg-red-600/20 text-red-400 border-red-600/40 text-[10px] px-1.5 py-0">
                    {group.overdueCount} overdue
                  </Badge>
                )}
                {highRiskCount > 0 && (
                  <Badge className="bg-orange-600/20 text-orange-400 border-orange-600/40 text-[10px] px-1.5 py-0">
                    {highRiskCount} high
                  </Badge>
                )}
              </div>
            </button>

            {/* Items — only when expanded */}
            {!isCollapsed && (
              <div className="pl-2 pb-2 space-y-1.5">
                {group.items.map(item => (
                  <AttentionCard
                    key={item.requestId}
                    item={item}
                    onUpdateDueDate={onUpdateDueDate}
                    muted={item.followUpMeta?.riskTier === "low"}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}