import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { FileText, Crown } from "lucide-react";
import KnowledgeFeedCard, { POST_TYPE_CONFIG } from "./KnowledgeFeedCard";

export { POST_TYPE_CONFIG as TYPE_CONFIG };

/**
 * Feed layout:
 * 1. MASTER PROCEDURES section — dedicated header, always expanded
 * 2. PINNED section
 * 3. RECENT FIELD NOTES — everything else newest-first
 * 
 * Child posts grouped under their master procedure.
 */
export default function KnowledgeListView({ items, categories, selectedCategoryId, showGrouping, onItemClick }) {
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
  const { data: allParts = [] } = useQuery({
    queryKey: ['parts_for_knowledge'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 120000,
  });
  const { data: allEntries = [] } = useQuery({
    queryKey: ['allProcedureEntries'],
    queryFn: () => base44.entities.ProcedureEntry.list(),
    staleTime: 60000,
  });

  // Entry count per item
  const entryCountByItem = useMemo(() => {
    const map = {};
    allEntries.forEach(e => {
      if (e.procedure_id) map[e.procedure_id] = (map[e.procedure_id] || 0) + 1;
    });
    return map;
  }, [allEntries]);

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

  // Separate into sections
  const { masterGroups, pinnedItems, recentItems } = useMemo(() => {
    const masterIds = new Set();
    const masters = [];
    const pinned = [];
    const regular = [];

    items.forEach(item => {
      if (item.is_master_procedure) { masters.push(item); masterIds.add(item.id); }
      else if (item.is_pinned) pinned.push(item);
      else regular.push(item);
    });

    // Build master groups with children
    const groups = masters.map(master => {
      const children = items
        .filter(i => i.parent_procedure_id === master.id && !i.is_master_procedure)
        .sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0));
      return { master, children };
    });

    // Filter regular items that are NOT children of a master
    const childIds = new Set();
    groups.forEach(g => g.children.forEach(c => childIds.add(c.id)));
    const filteredRegular = regular.filter(i => !childIds.has(i.id));
    const filteredPinned = pinned.filter(i => !childIds.has(i.id));

    return { masterGroups: groups, pinnedItems: filteredPinned, recentItems: filteredRegular };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">No posts in this feed yet</p>
        <p className="text-xs mt-1 text-gray-600">Add a field note or procedure to get started</p>
      </div>
    );
  }

  const renderCard = (item, compact) => (
    <KnowledgeFeedCard
      key={item.id}
      item={item}
      onItemClick={onItemClick}
      partLinks={partLinksByItem[item.id]}
      taskLinks={taskLinksByItem[item.id]}
      parts={allParts}
      compact={compact}
      entryCount={entryCountByItem[item.id]}
    />
  );

  return (
    <div className="space-y-6">
      {/* MASTER PROCEDURES SECTION */}
      {masterGroups.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-red-800/50">
            <Crown className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-red-400">Master Procedures</h3>
            <span className="text-xs text-gray-600 ml-auto">{masterGroups.length}</span>
          </div>
          <div className="space-y-5">
            {masterGroups.map(group => (
              <div key={group.master.id}>
                {renderCard(group.master)}
                {group.children.length > 0 && (
                  <div className="ml-3 md:ml-5 mt-3 border-l-2 border-gray-700/50 pl-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gray-600" />
                      Field Intelligence ({group.children.length})
                    </p>
                    {group.children.map(child => renderCard(child, true))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* PINNED SECTION */}
      {pinnedItems.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-900/30">
            <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">Pinned References</h3>
            <span className="text-xs text-gray-600 ml-auto">{pinnedItems.length}</span>
          </div>
          <div className="space-y-3">
            {pinnedItems.map(item => renderCard(item))}
          </div>
        </section>
      )}

      {/* FIELD INTELLIGENCE */}
      {recentItems.length > 0 && (
        <section>
          {(masterGroups.length > 0 || pinnedItems.length > 0) && (
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-800/60">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">Field Intelligence</h3>
              <span className="text-xs text-gray-600 ml-auto">{recentItems.length}</span>
            </div>
          )}
          <div className="space-y-3">
            {recentItems.map(item => renderCard(item))}
          </div>
        </section>
      )}
    </div>
  );
}