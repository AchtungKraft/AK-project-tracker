import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { FileText, Crown, Pin } from "lucide-react";
import KnowledgeFeedCard, { POST_TYPE_CONFIG } from "./KnowledgeFeedCard";

// Re-export for TaskKnowledgeSection backward compat
export { POST_TYPE_CONFIG as TYPE_CONFIG };

/**
 * Feed-first list:
 * 1. Pinned master procedures at top
 * 2. Other pinned items
 * 3. Everything else newest-first
 * 
 * Items attached to a master procedure are grouped underneath it.
 */
export default function KnowledgeListView({ items, categories, selectedCategoryId, showGrouping, onItemClick }) {
  // Fetch relationship counts for chips
  const { data: allPartLinks = [] } = useQuery({
    queryKey: ['allKnowledgePartLinks'],
    queryFn: () => base44.entities.BuildKnowledgePartLink.list(),
    staleTime: 60000,
  });
  const { data: allTaskLinks = [] } = useQuery({
    queryKey: ['allKnowledgeTaskLinks'],
    queryFn: () => base44.entities.BuildKnowledgeTaskLink.list(),
    staleTime: 60000,
  });

  const partLinksByItem = useMemo(() => {
    const map = {};
    allPartLinks.forEach(l => {
      if (!map[l.knowledge_item_id]) map[l.knowledge_item_id] = [];
      map[l.knowledge_item_id].push(l);
    });
    return map;
  }, [allPartLinks]);

  const taskLinksByItem = useMemo(() => {
    const map = {};
    allTaskLinks.forEach(l => {
      if (!map[l.knowledge_item_id]) map[l.knowledge_item_id] = [];
      map[l.knowledge_item_id].push(l);
    });
    return map;
  }, [allTaskLinks]);

  // Sort: pinned masters → pinned → newest first
  const sortedItems = useMemo(() => {
    const masters = [];
    const pinned = [];
    const regular = [];

    items.forEach(item => {
      if (item.is_master_procedure) masters.push(item);
      else if (item.is_pinned) pinned.push(item);
      else regular.push(item);
    });

    // Masters sorted by updated, pinned by updated, regular by updated (newest first — already sorted from API)
    return [...masters, ...pinned, ...regular];
  }, [items]);

  // Group items by master procedure
  const { masterGroups, ungrouped } = useMemo(() => {
    const masterIds = new Set(sortedItems.filter(i => i.is_master_procedure).map(i => i.id));
    const groups = {};
    const ungroupedItems = [];

    sortedItems.forEach(item => {
      if (item.is_master_procedure) {
        if (!groups[item.id]) groups[item.id] = { master: item, children: [] };
        else groups[item.id].master = item;
      } else if (item.parent_procedure_id && masterIds.has(item.parent_procedure_id)) {
        if (!groups[item.parent_procedure_id]) groups[item.parent_procedure_id] = { master: null, children: [] };
        groups[item.parent_procedure_id].children.push(item);
      } else {
        ungroupedItems.push(item);
      }
    });

    return {
      masterGroups: Object.values(groups).filter(g => g.master),
      ungrouped: ungroupedItems,
    };
  }, [sortedItems]);

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">No posts in this feed yet</p>
        <p className="text-xs mt-1 text-gray-600">Add a field note or procedure to get started</p>
      </div>
    );
  }

  const renderCard = (item) => (
    <KnowledgeFeedCard
      key={item.id}
      item={item}
      onItemClick={onItemClick}
      partLinks={partLinksByItem[item.id]}
      taskLinks={taskLinksByItem[item.id]}
    />
  );

  return (
    <div className="space-y-3">
      {/* Master procedure groups */}
      {masterGroups.map(group => (
        <div key={group.master.id}>
          {renderCard(group.master)}
          {group.children.length > 0 && (
            <div className="ml-3 md:ml-5 mt-1 border-l-2 border-red-900/30 pl-3 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold pt-1">
                Linked Field Posts
              </p>
              {group.children.map(child => renderCard(child))}
            </div>
          )}
        </div>
      ))}

      {/* Ungrouped items */}
      {ungrouped.map(item => renderCard(item))}
    </div>
  );
}