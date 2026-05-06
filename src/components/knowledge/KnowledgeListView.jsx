import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Tag, Package, Image, Clock, FileText } from "lucide-react";
import { format } from "date-fns";

// Exported so detail drawer can still reference it
const TYPE_CONFIG = {
  procedure: { label: "Procedure", dot: "bg-blue-500" },
  guide: { label: "Guide", dot: "bg-emerald-500" },
  issue: { label: "Issue", dot: "bg-amber-500" },
  reference: { label: "Reference", dot: "bg-purple-500" },
  checklist: { label: "Checklist", dot: "bg-cyan-500" },
  tip: { label: "Tip", dot: "bg-yellow-500" },
  document: { label: "Document", dot: "bg-gray-500" },
};

export { TYPE_CONFIG };

function getExcerpt(item) {
  if (item.summary) return item.summary;
  if (item.content_html) {
    const text = item.content_html.replace(/<[^>]*>/g, '').trim();
    return text.length > 120 ? text.slice(0, 120) + '…' : text;
  }
  return null;
}

function getPreviewImage(item) {
  if (item.image_urls?.length > 0) return item.image_urls[0];
  if (item.media_urls?.length > 0) return item.media_urls[0];
  const imgBlock = item.content_blocks?.find(b => b.type === 'image');
  if (imgBlock?.data?.url) return imgBlock.data.url;
  return null;
}

function KnowledgeCard({ item, onItemClick }) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
  const excerpt = getExcerpt(item);
  const previewImg = getPreviewImage(item);
  const imageCount = (item.image_urls?.length || 0) + (item.media_urls?.length || 0);

  return (
    <div
      onClick={() => onItemClick(item)}
      className="flex gap-3 p-3 bg-gray-900/40 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group"
    >
      {/* Thumbnail */}
      {previewImg && (
        <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-800">
          <img src={previewImg} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-start gap-2 mb-0.5">
            <h4 className="text-white text-sm font-medium line-clamp-1 flex-1 group-hover:text-red-400 transition-colors">
              {item.title}
            </h4>
            {item.status === 'draft' && <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-[10px] shrink-0">Draft</Badge>}
          </div>
          {excerpt && <p className="text-xs text-gray-400 line-clamp-2 mb-1">{excerpt}</p>}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 flex-wrap text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
            {config.label}
          </span>
          {item.vehicle_tags?.length > 0 && (
            <span className="flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" />{item.vehicle_tags.slice(0, 2).join(', ')}</span>
          )}
          {imageCount > 0 && (
            <span className="flex items-center gap-0.5"><Image className="w-2.5 h-2.5" />{imageCount}</span>
          )}
          <span className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {item.updated_date ? format(new Date(item.updated_date), 'MMM d') : '—'}
          </span>
          {item.created_by && <span className="text-gray-600">{item.created_by.split('@')[0]}</span>}
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeListView({ items, categories, selectedCategoryId, showGrouping, onItemClick }) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const toggleGroup = (key) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const groups = useMemo(() => {
    if (!showGrouping) return [{ label: 'All Entries', items, color: '#6B7280', children: [] }];

    const parentCats = categories.filter(c => !c.parent_id && c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const result = [];

    const noCat = items.filter(i => !i.category_id && !i.subcategory_id);
    if (noCat.length > 0) result.push({ label: 'Uncategorized', items: noCat, color: '#6B7280', children: [] });

    parentCats.forEach(parent => {
      const childCats = categories.filter(c => c.parent_id === parent.id && c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const parentItems = items.filter(i => i.category_id === parent.id && !i.subcategory_id);
      const children = [];

      childCats.forEach(child => {
        const childItems = items.filter(i => i.subcategory_id === child.id || (i.category_id === child.id));
        if (childItems.length > 0) {
          children.push({ label: child.name, items: childItems, color: child.color || parent.color, children: [] });
        }
      });

      if (parentItems.length > 0 || children.length > 0) {
        result.push({ label: parent.name, items: parentItems, color: parent.color || '#6B7280', children });
      }
    });

    return result;
  }, [items, categories, showGrouping]);

  const renderGroup = (group, level = 0) => {
    const key = `${level}-${group.label}`;
    const isExpanded = expandedGroups[key] !== false;
    const total = group.items.length + group.children.reduce((sum, c) => sum + c.items.length, 0);

    return (
      <div key={key} className={level > 0 ? 'ml-4' : ''}>
        {showGrouping && (
          <button
            onClick={() => toggleGroup(key)}
            className="flex items-center gap-2 w-full p-2 mb-2 bg-gray-900/50 rounded-lg border-2 hover:opacity-90 transition-colors"
            style={{ borderColor: group.color }}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            <div className="w-3 h-3 rounded" style={{ backgroundColor: group.color }} />
            <span className="text-sm font-medium text-white flex-1 text-left">{group.label}</span>
            <span className="text-xs text-gray-400">{total}</span>
          </button>
        )}
        {isExpanded && (
          <div className="space-y-2 mb-3">
            {group.items.map(item => <KnowledgeCard key={item.id} item={item} onItemClick={onItemClick} />)}
            {group.children.map(child => renderGroup(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No knowledge entries yet</p>
        <p className="text-xs mt-1">Create your first entry to get started</p>
      </div>
    );
  }

  return <div className="space-y-3">{groups.map(g => renderGroup(g))}</div>;
}