import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, ChevronsUpDown, FolderKanban, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getTime } from "./feedbackTimeline";
import AttentionCard from "./AttentionCard";

const STORAGE_KEY = "activereview_collapsed_projects";

function groupByProject(items) {
  const map = {};
  items.forEach(item => {
    const name = item.project?.name || "Unknown Project";
    const key = (item.project?.id || name).toLowerCase().trim();
    if (!map[key]) {
      map[key] = { clientKey: key, clientName: name, items: [], overdueCount: 0, approvedCount: 0, latestActivityAt: 0 };
    }
    map[key].items.push(item);
    if (item.isOverdue) map[key].overdueCount++;
    if (item.type === 'approved_recent') map[key].approvedCount++;
    const t = getTime(item.lastActivityAt);
    if (t > map[key].latestActivityAt) map[key].latestActivityAt = t;
  });

  return Object.values(map).sort((a, b) => {
    if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
    if (a.items.length !== b.items.length) return b.items.length - a.items.length;
    return b.latestActivityAt - a.latestActivityAt;
  });
}

function loadState() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export default function ActiveReviewGroups({ items, onUpdateDueDate }) {
  const groups = useMemo(() => groupByProject(items), [items]);
  const allKeys = useMemo(() => groups.map(g => g.clientKey), [groups]);

  // Multi-request groups default collapsed; single-request default expanded
  const [collapsed, setCollapsed] = useState(() => {
    const saved = loadState();
    if (saved) {
      const merged = {};
      allKeys.forEach((k, i) => { merged[k] = saved[k] !== undefined ? saved[k] : (groups[i]?.items.length > 1); });
      return merged;
    }
    const init = {};
    groups.forEach(g => { init[g.clientKey] = g.items.length > 1; });
    return init;
  });

  useEffect(() => { saveState(collapsed); }, [collapsed]);

  useEffect(() => {
    setCollapsed(prev => {
      const next = { ...prev };
      let changed = false;
      groups.forEach(g => {
        if (next[g.clientKey] === undefined) { next[g.clientKey] = g.items.length > 1; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [groups]);

  const toggleProject = useCallback((key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const allCollapsed = allKeys.every(k => collapsed[k]);
  const toggleAll = useCallback(() => {
    const val = !allCollapsed;
    setCollapsed(() => {
      const next = {};
      allKeys.forEach(k => { next[k] = val; });
      return next;
    });
  }, [allCollapsed, allKeys]);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {groups.length > 1 && (
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1 mb-0.5"
        >
          <ChevronsUpDown className="w-3 h-3" />
          {allCollapsed ? "Expand All" : "Collapse All"}
        </button>
      )}

      {groups.map(group => {
        // Single-item project: render card directly
        if (group.items.length === 1) {
          return (
            <AttentionCard
              key={group.items[0].requestId}
              item={group.items[0]}
              onUpdateDueDate={onUpdateDueDate}
            />
          );
        }

        const isCollapsed = collapsed[group.clientKey] === true;
        const reviewCount = group.items.filter(i => i.request?.review_state === 'in_review').length;

        return (
          <div key={group.clientKey} className="rounded-lg bg-gray-900/30 border border-gray-800/60 overflow-hidden">
            {/* Project group header */}
            <button
              onClick={() => toggleProject(group.clientKey)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-150 hover:bg-amber-950/15 group/header"
            >
              <div className="shrink-0 text-gray-500 group-hover/header:text-gray-300 transition-colors">
                {isCollapsed
                  ? <ChevronRight className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />
                }
              </div>
              <FolderKanban className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
              <span className="text-[13px] font-semibold text-gray-100 group-hover/header:text-white truncate flex-1 min-w-0 transition-colors">
                {group.clientName}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0">
                  {group.items.length}
                </Badge>
                {group.overdueCount > 0 && (
                  <Badge className="bg-red-600/25 text-red-400 border-red-600/40 text-[10px] px-1.5 py-0 font-semibold">
                    {group.overdueCount} overdue
                  </Badge>
                )}
                {group.approvedCount > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] px-1.5 py-0">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                    {group.approvedCount}
                  </Badge>
                )}
                {reviewCount > 0 && group.approvedCount === 0 && (
                  <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/40 text-[10px] px-1.5 py-0">
                    {reviewCount} review
                  </Badge>
                )}
              </div>
            </button>

            {!isCollapsed && (
              <div className="px-2 pb-2.5 pt-1 space-y-1.5 border-t border-gray-800/40">
                {group.items.map(item => (
                  <AttentionCard
                    key={item.requestId}
                    item={item}
                    onUpdateDueDate={onUpdateDueDate}
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