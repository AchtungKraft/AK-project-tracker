import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, ChevronsUpDown, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getTime } from "./feedbackTimeline";
import AttentionCard from "./AttentionCard";

const STORAGE_KEY = "followup_collapsed_clients";

/**
 * Age bucket thresholds (in hours)
 */
const AGE_BUCKETS = [
  { key: 'today', label: 'Today', maxHours: 24 },
  { key: '1_7_days', label: '1–7 Days', maxHours: 168 },
  { key: '8_30_days', label: '8–30 Days', maxHours: 720 },
  { key: '30_plus', label: '30+ Days', maxHours: Infinity },
];

const AGE_COLORS = {
  today: 'text-gray-400',
  '1_7_days': 'text-orange-400/70',
  '8_30_days': 'text-orange-400',
  '30_plus': 'text-red-400',
};

/**
 * Group items by age bucket based on hours since last activity.
 */
function groupByAge(items) {
  const buckets = AGE_BUCKETS.map(b => ({ ...b, items: [] }));
  items.forEach(item => {
    const hours = item.followUpMeta?.hoursSince ?? 0;
    for (const bucket of buckets) {
      if (hours < bucket.maxHours) {
        bucket.items.push(item);
        break;
      }
    }
  });
  return buckets.filter(b => b.items.length > 0);
}

/**
 * Group follow-up items by project name.
 * Returns sorted array of { clientKey, clientName, items, overdueCount, latestActivityAt }.
 */
function groupByClient(items) {
  const map = {};
  items.forEach(item => {
    const clientName = item.project?.name || "Unknown Project";
    const key = (item.project?.id || clientName).toLowerCase().trim();
    if (!map[key]) {
      map[key] = { clientKey: key, clientName, items: [], overdueCount: 0, latestActivityAt: 0 };
    }
    map[key].items.push(item);
    if (item.isOverdue) map[key].overdueCount++;
    const t = getTime(item.lastActivityAt);
    if (t > map[key].latestActivityAt) map[key].latestActivityAt = t;
  });

  return Object.values(map).sort((a, b) => {
    if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
    if (a.items.length !== b.items.length) return b.items.length - a.items.length;
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
export default function FollowUpClientGroups({ items, onUpdateDueDate, onAction, mineFilter = false }) {
  const ageBuckets = useMemo(() => groupByAge(items), [items]);
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

      {/* Age-grouped rendering */}
      {ageBuckets.map(bucket => (
        <div key={bucket.key}>
          {/* Age group header */}
          <div className="flex items-center gap-2 px-1 pt-2 pb-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${AGE_COLORS[bucket.key]}`}>
              {bucket.label}
            </span>
            <Badge className="bg-gray-800/60 text-gray-500 border-gray-700/50 text-[10px] px-1 py-0">
              {bucket.items.length}
            </Badge>
            <div className="flex-1 border-t border-gray-800/40" />
          </div>

          {/* Items within this age bucket, grouped by project */}
          {(() => {
            const bucketProjects = groupByClient(bucket.items);
            return bucketProjects.map(group => {
              const isCollapsed = collapsed[group.clientKey] !== false;
              const highRiskCount = group.items.filter(i => i.followUpMeta?.riskTier === "high").length;

              return (
                <div key={`${bucket.key}-${group.clientKey}`} className="border-b border-gray-800/40 last:border-b-0">
                  <button
                    onClick={() => toggleClient(group.clientKey)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-gray-800/40 transition-colors text-left group/client"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    )}
                    <FolderKanban className="w-3.5 h-3.5 text-orange-400/60 shrink-0" />
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

                  {!isCollapsed && (
                    <div className="pl-2 pb-2 space-y-1.5">
                      {group.items.map(item => (
                        <AttentionCard
                          key={item.requestId}
                          item={item}
                          onUpdateDueDate={onUpdateDueDate}
                          onAction={onAction}
                          muted={item.followUpMeta?.riskTier === "low"}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      ))}
    </div>
  );
}