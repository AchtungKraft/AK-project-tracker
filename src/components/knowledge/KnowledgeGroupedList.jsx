import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronRight, FolderOpen, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import KnowledgeCompactRow from "./KnowledgeCompactRow";

/**
 * Groups procedures by category → subcategory with collapsible headers.
 * Replaces the old feed-style KnowledgeListView in the explorer.
 */
export default function KnowledgeGroupedList({ items, categories, onItemClick }) {
  const [collapsed, setCollapsed] = useState({});

  const { data: allEntries = [] } = useQuery({
    queryKey: ['allProcedureEntries'],
    queryFn: () => base44.entities.ProcedureEntry.list(),
    staleTime: 60000,
  });

  const entryCountByItem = useMemo(() => {
    const map = {};
    allEntries.forEach(e => {
      if (e.procedure_id) map[e.procedure_id] = (map[e.procedure_id] || 0) + 1;
    });
    return map;
  }, [allEntries]);

  // Build category lookup
  const catMap = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  // Group items: category → subcategory → items
  const groups = useMemo(() => {
    const catGroups = {};
    const uncategorized = [];

    items.forEach(item => {
      const catId = item.category_id;
      if (!catId || !catMap[catId]) {
        uncategorized.push(item);
        return;
      }
      // Determine if catId is a parent or child
      const cat = catMap[catId];
      const parentId = cat.parent_id || catId;
      const subId = cat.parent_id ? catId : (item.subcategory_id || null);

      if (!catGroups[parentId]) catGroups[parentId] = { subs: {} };
      const subKey = subId || '__direct__';
      if (!catGroups[parentId].subs[subKey]) catGroups[parentId].subs[subKey] = [];
      catGroups[parentId].subs[subKey].push(item);
    });

    // Also handle subcategory_id pointing to a child of the category
    // (already covered above since we resolve parent from cat.parent_id)

    // Convert to sorted array
    const result = Object.entries(catGroups).map(([parentId, data]) => {
      const parent = catMap[parentId];
      const subEntries = Object.entries(data.subs).map(([subId, subItems]) => ({
        subId,
        subCategory: subId !== '__direct__' ? catMap[subId] : null,
        items: subItems.sort((a, b) => {
          // Master procedures first, then pinned, then by date
          if (a.is_master_procedure && !b.is_master_procedure) return -1;
          if (!a.is_master_procedure && b.is_master_procedure) return 1;
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return new Date(b.updated_date || 0) - new Date(a.updated_date || 0);
        }),
      }));
      // Sort subs: direct items first, then alphabetical
      subEntries.sort((a, b) => {
        if (a.subId === '__direct__') return -1;
        if (b.subId === '__direct__') return 1;
        return (a.subCategory?.name || '').localeCompare(b.subCategory?.name || '');
      });
      const totalCount = subEntries.reduce((sum, s) => sum + s.items.length, 0);
      return { parentId, parent, subs: subEntries, totalCount };
    });

    // Sort parent groups by name
    result.sort((a, b) => (a.parent?.name || '').localeCompare(b.parent?.name || ''));

    if (uncategorized.length > 0) {
      result.push({
        parentId: '__uncategorized__',
        parent: null,
        subs: [{ subId: '__direct__', subCategory: null, items: uncategorized }],
        totalCount: uncategorized.length,
      });
    }

    return result;
  }, [items, catMap]);

  const toggleCollapse = (key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-600">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No articles found</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-800/30">
      {groups.map(group => {
        const parentKey = group.parentId;
        const isParentCollapsed = collapsed[parentKey];

        return (
          <div key={parentKey}>
            {/* Parent category header */}
            <button
              onClick={() => toggleCollapse(parentKey)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-900/60 hover:bg-gray-900/80 transition-colors text-left sticky top-0 z-10"
            >
              {isParentCollapsed
                ? <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
              }
              {group.parent?.color && (
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: group.parent.color }} />
              )}
              <span className="text-xs font-bold uppercase tracking-widest text-gray-300 flex-1 truncate">
                {group.parent?.name || 'Uncategorized'}
              </span>
              <span className="text-[10px] text-gray-600 px-2 py-0.5 rounded-full bg-gray-800/60 shrink-0">
                {group.totalCount}
              </span>
            </button>

            {!isParentCollapsed && (
              <div>
                {group.subs.map(sub => {
                  const subKey = `${parentKey}__${sub.subId}`;
                  const isSubCollapsed = collapsed[subKey];
                  const hasSubHeader = sub.subCategory != null;

                  return (
                    <div key={sub.subId}>
                      {/* Subcategory header */}
                      {hasSubHeader && (
                        <button
                          onClick={() => toggleCollapse(subKey)}
                          className="w-full flex items-center gap-2 pl-7 pr-3 py-1.5 bg-gray-900/30 hover:bg-gray-900/50 transition-colors text-left"
                        >
                          {isSubCollapsed
                            ? <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                          }
                          {sub.subCategory?.color && (
                            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: sub.subCategory.color }} />
                          )}
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 flex-1 truncate">
                            {sub.subCategory.name}
                          </span>
                          <span className="text-[10px] text-gray-700 shrink-0">{sub.items.length}</span>
                        </button>
                      )}

                      {/* Items */}
                      {!(hasSubHeader && isSubCollapsed) && (
                        <div>
                          {sub.items.map(item => (
                            <KnowledgeCompactRow
                              key={item.id}
                              item={item}
                              onClick={onItemClick}
                              entryCount={entryCountByItem[item.id]}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}