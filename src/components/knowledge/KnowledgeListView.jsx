import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ClipboardList, BookOpen, AlertTriangle, FileText, CheckSquare, Lightbulb, File, Package, Tag } from "lucide-react";
import { format } from "date-fns";

const TYPE_CONFIG = {
  procedure: { icon: ClipboardList, label: "Procedure", color: "bg-blue-600/20 text-blue-400", dot: "bg-blue-500" },
  guide: { icon: BookOpen, label: "Guide", color: "bg-emerald-600/20 text-emerald-400", dot: "bg-emerald-500" },
  issue: { icon: AlertTriangle, label: "Issue", color: "bg-amber-600/20 text-amber-400", dot: "bg-amber-500" },
  reference: { icon: FileText, label: "Reference", color: "bg-purple-600/20 text-purple-400", dot: "bg-purple-500" },
  checklist: { icon: CheckSquare, label: "Checklist", color: "bg-cyan-600/20 text-cyan-400", dot: "bg-cyan-500" },
  tip: { icon: Lightbulb, label: "Tip", color: "bg-yellow-600/20 text-yellow-400", dot: "bg-yellow-500" },
  document: { icon: File, label: "Document", color: "bg-gray-600/20 text-gray-400", dot: "bg-gray-500" },
};

export { TYPE_CONFIG };

function KnowledgeRow({ item, onItemClick }) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
  const Icon = config.icon;
  const blockCount = item.content_blocks?.length || 0;
  const warningCount = item.warnings?.length || 0;
  const issueCount = item.known_issues?.length || 0;
  const tipCount = item.tips?.length || 0;

  return (
    <div
      onClick={() => onItemClick(item)}
      className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-gray-900/30 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group"
    >
      {/* Icon + Info */}
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", config.color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start gap-2 flex-wrap">
            <h4 className="text-white text-sm font-medium line-clamp-1 flex-1 group-hover:text-red-400 transition-colors">
              {item.title}
            </h4>
            {item.status === 'draft' && (
              <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-[10px] shrink-0">Draft</Badge>
            )}
            {item.status === 'archived' && (
              <Badge variant="outline" className="border-gray-600/50 text-gray-500 text-[10px] shrink-0">Archived</Badge>
            )}
          </div>
          {item.summary && (
            <p className="text-xs text-gray-400 line-clamp-1">{item.summary}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn("text-[10px] px-1.5 py-0 h-4", config.color)}>{config.label}</Badge>
            {item.vehicle_tags?.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <Tag className="w-3 h-3" />
                {item.vehicle_tags.slice(0, 3).join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats — mirrors Parts Tracker column layout */}
      <div className="flex justify-around md:justify-end md:gap-4 text-xs shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-800">
        <div className="text-center min-w-[50px]">
          <div className="text-gray-500 mb-0.5">Blocks</div>
          <div className="text-white font-semibold">{blockCount || '—'}</div>
        </div>
        <div className="text-center min-w-[50px]">
          <div className="text-gray-500 mb-0.5">Warnings</div>
          <div className={cn("font-semibold", warningCount > 0 ? "text-amber-400" : "text-gray-600")}>
            {warningCount || '—'}
          </div>
        </div>
        <div className="text-center min-w-[50px]">
          <div className="text-gray-500 mb-0.5">Issues</div>
          <div className={cn("font-semibold", issueCount > 0 ? "text-red-400" : "text-gray-600")}>
            {issueCount || '—'}
          </div>
        </div>
        <div className="text-center min-w-[50px]">
          <div className="text-gray-500 mb-0.5">Tips</div>
          <div className={cn("font-semibold", tipCount > 0 ? "text-yellow-400" : "text-gray-600")}>
            {tipCount || '—'}
          </div>
        </div>
        <div className="text-center min-w-[50px]">
          <div className="text-gray-500 mb-0.5">Version</div>
          <div className="text-gray-300">v{item.version || 1}</div>
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeListView({ items, categories, selectedCategoryId, showGrouping, onItemClick }) {
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Build hierarchical groups mirroring PartsListView
  const groups = useMemo(() => {
    if (!showGrouping) return [{ label: 'All Items', items, color: '#6B7280', children: [] }];

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
            <span className="text-xs text-gray-400">{total} item{total !== 1 ? 's' : ''}</span>
          </button>
        )}
        {isExpanded && (
          <div className="space-y-2 mb-3">
            {group.items.map(item => <KnowledgeRow key={item.id} item={item} onItemClick={onItemClick} />)}
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
        <p>No knowledge items found</p>
        <p className="text-xs mt-1">Create your first item to get started</p>
      </div>
    );
  }

  return <div className="space-y-3">{groups.map(g => renderGroup(g))}</div>;
}