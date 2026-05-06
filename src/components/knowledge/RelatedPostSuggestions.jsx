import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle } from "lucide-react";

/**
 * Surfaces "possibly related posts" during creation to prevent duplicates.
 * Matches on title similarity, same category, same vehicle tags.
 */
export default function RelatedPostSuggestions({ title, categoryId, vehicleTags, allItems, currentItemId }) {
  const suggestions = useMemo(() => {
    if (!title || title.length < 4) return [];
    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (titleWords.length === 0) return [];

    return allItems
      .filter(item => item.id !== currentItemId && item.status !== 'archived')
      .map(item => {
        let score = 0;
        const itemTitle = (item.title || '').toLowerCase();
        // Title word overlap
        titleWords.forEach(word => {
          if (itemTitle.includes(word)) score += 3;
        });
        // Same category
        if (categoryId && item.category_id === categoryId) score += 2;
        // Shared vehicle tags
        if (vehicleTags?.length > 0 && item.vehicle_tags?.length > 0) {
          const overlap = vehicleTags.filter(t => item.vehicle_tags.includes(t)).length;
          score += overlap * 2;
        }
        return { item, score };
      })
      .filter(s => s.score >= 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [title, categoryId, vehicleTags, allItems, currentItemId]);

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-900/30 bg-amber-950/20 p-3">
      <p className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold mb-2 flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3" /> Possibly Related Posts
      </p>
      <div className="space-y-1.5">
        {suggestions.map(({ item }) => (
          <div key={item.id} className="flex items-center gap-2 text-xs">
            <FileText className="w-3 h-3 text-gray-500 shrink-0" />
            <span className="text-gray-300 truncate">{item.title}</span>
            {item.is_obsolete && <Badge className="text-[8px] bg-gray-700/50 text-gray-500 border-0">obsolete</Badge>}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-600 mt-2">Consider linking to or updating an existing post instead.</p>
    </div>
  );
}