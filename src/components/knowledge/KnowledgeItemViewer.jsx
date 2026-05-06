import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Clock, User, Tag, AlertTriangle, Lightbulb, Package, History } from "lucide-react";
import { format } from "date-fns";
import { TYPE_CONFIG } from "./KnowledgeItemList";
import KnowledgeContentRenderer from "./KnowledgeContentRenderer";
import KnowledgePartLinks from "./KnowledgePartLinks";
import KnowledgeProjectNotes from "./KnowledgeProjectNotes";
import { cn } from "@/lib/utils";

export default function KnowledgeItemViewer({ item, categories, onEdit }) {
  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Select an item to view</p>
      </div>
    );
  }

  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
  const Icon = config.icon;

  const cat = categories.find(c => c.id === item.category_id);
  const subcat = categories.find(c => c.id === item.subcategory_id);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Badge className={cn("text-xs", config.color)}>
            <Icon className="w-3 h-3 mr-1" />
            {config.label}
          </Badge>
          {item.status === 'draft' && (
            <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-xs">Draft</Badge>
          )}
          {item.status === 'archived' && (
            <Badge variant="outline" className="border-gray-600/50 text-gray-500 text-xs">Archived</Badge>
          )}
          <div className="ml-auto">
            <Button size="sm" variant="ghost" onClick={() => onEdit(item)} className="text-gray-400 hover:text-white gap-1">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">{item.title}</h1>
        
        {item.summary && (
          <p className="text-gray-400 text-sm mb-3">{item.summary}</p>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          {cat && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
              {cat.name}{subcat ? ` › ${subcat.name}` : ''}
            </span>
          )}
          {item.vehicle_tags?.length > 0 && (
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {item.vehicle_tags.join(', ')}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            v{item.version || 1} · Updated {item.updated_date ? format(new Date(item.updated_date), 'MMM d, yyyy') : 'N/A'}
          </span>
        </div>
      </div>

      {/* Warnings at top */}
      {item.warnings?.length > 0 && (
        <div className="mb-4 space-y-2">
          {item.warnings.map(w => (
            <div key={w.id} className={cn(
              "flex items-start gap-2 p-3 rounded-lg border",
              w.severity === 'danger' ? "bg-red-900/30 border-red-600/40 text-red-300" :
              w.severity === 'warning' ? "bg-amber-900/30 border-amber-600/40 text-amber-300" :
              "bg-yellow-900/30 border-yellow-600/40 text-yellow-300"
            )}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-sm">{w.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content blocks */}
      <div className="mb-6">
        <KnowledgeContentRenderer blocks={item.content_blocks} />
      </div>

      {/* Known Issues */}
      {item.known_issues?.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Known Issues
          </h3>
          <div className="space-y-2">
            {item.known_issues.map(issue => (
              <div key={issue.id} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white">{issue.title}</span>
                  <Badge className={cn("text-[10px]",
                    issue.severity === 'critical' ? 'bg-red-600/30 text-red-400' :
                    issue.severity === 'high' ? 'bg-amber-600/30 text-amber-400' :
                    issue.severity === 'medium' ? 'bg-yellow-600/30 text-yellow-400' :
                    'bg-gray-600/30 text-gray-400'
                  )}>{issue.severity}</Badge>
                </div>
                {issue.description && <p className="text-xs text-gray-400 mb-1">{issue.description}</p>}
                {issue.resolution && (
                  <p className="text-xs text-green-400">
                    <span className="font-semibold">Resolution:</span> {issue.resolution}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {item.tips?.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" /> Tips
          </h3>
          <div className="space-y-2">
            {item.tips.map(tip => (
              <div key={tip.id} className="p-3 rounded-lg bg-yellow-900/15 border border-yellow-700/30">
                <p className="text-sm text-yellow-200">{tip.text}</p>
                {tip.source && <p className="text-xs text-gray-500 mt-1">— {tip.source}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Parts */}
      <KnowledgePartLinks knowledgeItemId={item.id} />

      {/* Project-Specific Notes */}
      <KnowledgeProjectNotes knowledgeItemId={item.id} />

      {/* Changelog */}
      {item.changelog?.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-700/50">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Version History
          </h3>
          <div className="space-y-1">
            {[...item.changelog].reverse().map((entry, i) => (
              <div key={i} className="flex items-start gap-3 text-xs text-gray-400">
                <span className="text-gray-500 shrink-0">v{entry.version}</span>
                <span className="text-gray-500 shrink-0">{entry.date ? format(new Date(entry.date), 'MMM d, yyyy') : ''}</span>
                <span className="text-gray-300">{entry.notes}</span>
                {entry.author && <span className="text-gray-500 ml-auto shrink-0">by {entry.author}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}