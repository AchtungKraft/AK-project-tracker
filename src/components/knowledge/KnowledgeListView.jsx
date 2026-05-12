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
      <div className="text-center py-16 text-gray-600">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No procedures yet</p>
        <p className="text-xs text-gray-700 mt-0.5">Create your first procedure to get started</p>
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
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-red-900/30">
            <Crown className="w-3.5 h-3.5 text-red-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-red-400">Procedures</h3>
            <span className="text-[10px] text-gray-600 ml-auto">{masterGroups.length}</span>
          </div>
          <div className="space-y-5">
            {masterGroups.map(group => (
              <div key={group.master.id}>
                {renderCard(group.master)}
                {group.children.length > 0 && (
                  <div className="ml-3 md:ml-5 mt-2 border-l border-gray-800/40 pl-3 space-y-2">
                   <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">
                     Related Notes ({group.children.length})
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
          <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-gray-800/40">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">Pinned</h3>
            <span className="text-[10px] text-gray-600 ml-auto">{pinnedItems.length}</span>
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
            <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-gray-800/40">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600">Notes & References</h3>
              <span className="text-[10px] text-gray-700 ml-auto">{recentItems.length}</span>
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