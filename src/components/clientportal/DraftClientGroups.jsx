import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, ChevronsUpDown, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AttentionCard from "./AttentionCard";

const STORAGE_KEY = "drafts_collapsed_clients";

function groupByProject(items) {
  const map = {};
  items.forEach(item => {
    const name = item.project?.name || "Unknown Project";
    const key = (item.project?.id || name).toLowerCase().trim();
    if (!map[key]) {
      map[key] = { clientKey: key, clientName: name, items: [] };
    }
    map[key].items.push(item);
  });
  return Object.values(map).sort((a, b) => b.items.length - a.items.length);
}

function loadState() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export default function DraftClientGroups({ items, onUpdateDueDate, onAction }) {
  const groups = useMemo(() => groupByProject(items), [items]);
  const allKeys = useMemo(() => groups.map(g => g.clientKey), [groups]);

  const [collapsed, setCollapsed] = useState(() => {
    const saved = loadState();
    if (saved) {
      const merged = {};
      allKeys.forEach(k => { merged[k] = saved[k] !== undefined ? saved[k] : true; });
      return merged;
    }
    const init = {};
    allKeys.forEach(k => { init[k] = true; });
    return init;
  });

  useEffect(() => { saveState(collapsed); }, [collapsed]);

  useEffect(() => {
    setCollapsed(prev => {
      const next = { ...prev };
      let changed = false;
      allKeys.forEach(k => { if (next[k] === undefined) { next[k] = true; changed = true; } });
      return changed ? next : prev;
    });
  }, [allKeys]);

  const toggleClient = useCallback((key) => {
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
    <div className="space-y-1">
      {groups.length > 1 && (
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1 mb-1"
        >
          <ChevronsUpDown className="w-3 h-3" />
          {allCollapsed ? "Expand All" : "Collapse All"}
        </button>
      )}

      {groups.map(group => {
        const isCollapsed = collapsed[group.clientKey] !== false;
        return (
          <div key={group.clientKey} className="border-b border-gray-800/40 last:border-b-0">
            <button
              onClick={() => toggleClient(group.clientKey)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-gray-800/40 transition-colors text-left"
            >
              {isCollapsed
                ? <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              }
              <FolderKanban className="w-3.5 h-3.5 text-purple-400/60 shrink-0" />
              <span className="text-xs font-semibold text-gray-200 truncate flex-1 min-w-0">
                {group.clientName}
              </span>
              <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[10px] px-1.5 py-0">
                {group.items.length}
              </Badge>
            </button>

            {!isCollapsed && (
              <div className="pl-2 pb-2 space-y-1.5">
                {group.items.map(item => (
                  <AttentionCard
                    key={item.requestId}
                    item={item}
                    onUpdateDueDate={onUpdateDueDate}
                    onAction={onAction}
                    muted
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