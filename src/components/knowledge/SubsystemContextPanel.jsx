import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Package, ListChecks, Camera, AlertTriangle, Crown } from "lucide-react";

/**
 * SubsystemContextPanel — shows operational context when a subsystem (category) is selected.
 * Surfaces: master procedure count, related parts, active tasks, recent photos, known issues.
 */
export default function SubsystemContextPanel({ categoryId, categories, items }) {
  // Get all descendant IDs for this category
  const relevantIds = useMemo(() => {
    if (!categoryId) return [];
    const ids = new Set([categoryId]);
    const queue = [categoryId];
    while (queue.length > 0) {
      const current = queue.shift();
      categories.forEach(cat => {
        if (cat.parent_id === current && !ids.has(cat.id)) {
          ids.add(cat.id);
          queue.push(cat.id);
        }
      });
    }
    return Array.from(ids);
  }, [categoryId, categories]);

  const subsystemItems = useMemo(() => {
    return items.filter(item =>
      relevantIds.includes(item.category_id) || relevantIds.includes(item.subcategory_id)
    );
  }, [items, relevantIds]);

  const { data: allPartLinks = [] } = useQuery({
    queryKey: ['allKnowledgePartLinks'],
    queryFn: () => base44.entities.BuildKnowledgePartLink.list(),
    staleTime: 60000,
  });
  const { data: allParts = [] } = useQuery({
    queryKey: ['parts_for_knowledge'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 120000,
  });
  const { data: allTaskLinks = [] } = useQuery({
    queryKey: ['allKnowledgeTaskLinks'],
    queryFn: () => base44.entities.BuildKnowledgeTaskLink.list(),
    staleTime: 60000,
  });
  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
    staleTime: 60000,
  });

  const stats = useMemo(() => {
    const itemIds = new Set(subsystemItems.map(i => i.id));
    const masterCount = subsystemItems.filter(i => i.is_master_procedure).length;
    const issueCount = subsystemItems.filter(i => (i.post_type || i.type) === 'known_issue').length;

    // Parts linked to these items
    const partIds = new Set();
    allPartLinks.forEach(l => {
      if (itemIds.has(l.knowledge_item_id)) partIds.add(l.part_id);
    });
    const parts = allParts.filter(p => partIds.has(p.id)).slice(0, 6);

    // Tasks linked to these items
    const taskIds = new Set();
    allTaskLinks.forEach(l => {
      if (itemIds.has(l.knowledge_item_id)) taskIds.add(l.task_id);
    });
    const tasks = allTasks.filter(t => taskIds.has(t.id) && !t.completed_date).slice(0, 4);

    // Recent photos across all items
    const photos = [];
    subsystemItems.forEach(item => {
      if (item.cover_image_url) photos.push(item.cover_image_url);
      (item.image_urls || []).forEach(url => photos.push(url));
    });
    const recentPhotos = [...new Set(photos)].slice(0, 6);

    return { masterCount, issueCount, parts, tasks, recentPhotos, totalItems: subsystemItems.length };
  }, [subsystemItems, allPartLinks, allParts, allTaskLinks, allTasks]);

  if (!categoryId || stats.totalItems === 0) return null;

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 p-3 space-y-3">
      {/* Quick stats strip */}
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        {stats.masterCount > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <Crown className="w-3 h-3" /> {stats.masterCount} procedure{stats.masterCount !== 1 ? 's' : ''}
          </span>
        )}
        {stats.issueCount > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="w-3 h-3" /> {stats.issueCount} issue{stats.issueCount !== 1 ? 's' : ''}
          </span>
        )}
        {stats.parts.length > 0 && (
          <span className="flex items-center gap-1 text-blue-400">
            <Package className="w-3 h-3" /> {stats.parts.length} part{stats.parts.length !== 1 ? 's' : ''}
          </span>
        )}
        {stats.tasks.length > 0 && (
          <span className="flex items-center gap-1 text-green-400">
            <ListChecks className="w-3 h-3" /> {stats.tasks.length} active task{stats.tasks.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Related parts chips */}
      {stats.parts.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1">Related Parts</p>
          <div className="flex flex-wrap gap-1">
            {stats.parts.map(part => (
              <span key={part.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800/60 text-[10px] text-gray-300">
                <Package className="w-2.5 h-2.5 text-gray-500" /> {part.part_name || part.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Active tasks */}
      {stats.tasks.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1">Active Tasks</p>
          <div className="space-y-1">
            {stats.tasks.map(task => (
              <div key={task.id} className="flex items-center gap-2 text-xs text-gray-300">
                <ListChecks className="w-3 h-3 text-green-500 shrink-0" />
                <span className="truncate">{task.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent photos — horizontal scroll */}
      {stats.recentPhotos.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1 flex items-center gap-1">
            <Camera className="w-2.5 h-2.5" /> Recent Photos
          </p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            {stats.recentPhotos.map((url, i) => (
              <div key={i} className="shrink-0 rounded-md overflow-hidden bg-gray-800 w-16 h-16">
                <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}