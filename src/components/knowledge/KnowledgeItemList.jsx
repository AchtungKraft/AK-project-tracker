import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  FileText, ClipboardList, AlertTriangle, BookOpen, 
  CheckSquare, Lightbulb, File 
} from "lucide-react";

const TYPE_CONFIG = {
  procedure: { icon: ClipboardList, label: "Procedure", color: "bg-blue-600/20 text-blue-400" },
  guide: { icon: BookOpen, label: "Guide", color: "bg-emerald-600/20 text-emerald-400" },
  issue: { icon: AlertTriangle, label: "Known Issue", color: "bg-amber-600/20 text-amber-400" },
  reference: { icon: FileText, label: "Reference", color: "bg-purple-600/20 text-purple-400" },
  checklist: { icon: CheckSquare, label: "Checklist", color: "bg-cyan-600/20 text-cyan-400" },
  tip: { icon: Lightbulb, label: "Tip", color: "bg-yellow-600/20 text-yellow-400" },
  document: { icon: File, label: "Document", color: "bg-gray-600/20 text-gray-400" },
};

export { TYPE_CONFIG };

export default function KnowledgeItemList({ items, categories, selectedId, onSelect }) {
  const getCategoryPath = (item) => {
    const sub = categories.find(c => c.id === item.subcategory_id);
    const parent = categories.find(c => c.id === item.category_id);
    if (sub && parent) return `${parent.name} › ${sub.name}`;
    if (parent) return parent.name;
    return null;
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No items found</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map(item => {
        const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
        const Icon = config.icon;
        const catPath = getCategoryPath(item);
        const isSelected = selectedId === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={cn(
              "w-full text-left p-3 rounded-lg transition-colors border",
              isSelected
                ? "bg-red-900/30 border-red-500/40"
                : "bg-gray-800/30 border-transparent hover:bg-gray-800/60"
            )}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", config.color.split(' ')[1])} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white truncate">{item.title}</span>
                  {item.status === 'draft' && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-yellow-600/50 text-yellow-500">Draft</Badge>
                  )}
                </div>
                {item.summary && (
                  <p className="text-xs text-gray-400 line-clamp-1">{item.summary}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={cn("text-[10px] px-1.5 py-0 h-4", config.color)}>{config.label}</Badge>
                  {catPath && <span className="text-[10px] text-gray-500">{catPath}</span>}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}