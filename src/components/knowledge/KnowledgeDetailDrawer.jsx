import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Clock, Tag, AlertTriangle, Lightbulb, History } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import KnowledgeContentRenderer from "./KnowledgeContentRenderer";
import KnowledgePartLinks from "./KnowledgePartLinks";
import KnowledgeProjectNotes from "./KnowledgeProjectNotes";
import { TYPE_CONFIG } from "./KnowledgeListView";

export default function KnowledgeDetailDrawer({ item, categories, onClose, onEdit }) {
  if (!item) return null;

  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
  const Icon = config.icon;
  const cat = categories.find(c => c.id === item.category_id);
  const subcat = categories.find(c => c.id === item.subcategory_id);

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col">
        <SheetHeader className="pb-0 shrink-0 space-y-0">
          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
            <Badge className={cn("text-xs", config.color)}>
              <Icon className="w-3 h-3 mr-1" />{config.label}
            </Badge>
            {item.status === 'draft' && <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-xs">Draft</Badge>}
            {item.status === 'archived' && <Badge variant="outline" className="border-gray-600/50 text-gray-500 text-xs">Archived</Badge>}
          </div>
          {/* Category */}
          {cat && (
            <p className="text-xs text-gray-500">
              <span className="w-2 h-2 inline-block rounded-full mr-1" style={{ backgroundColor: cat.color }} />
              {cat.name}{subcat ? ` › ${subcat.name}` : ''}
            </p>
          )}
          <SheetTitle className="text-white text-xl font-bold leading-tight mt-1">{item.title}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pt-0 pb-3">
          {/* Summary */}
          {item.summary && <p className="text-gray-400 text-sm mt-1 mb-3">{item.summary}</p>}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
            {item.vehicle_tags?.length > 0 && (
              <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{item.vehicle_tags.join(', ')}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />v{item.version || 1} · {item.updated_date ? format(new Date(item.updated_date), 'MMM d, yyyy') : 'N/A'}
            </span>
          </div>

          <hr className="border-gray-700/50 mb-4" />

          {/* Warnings at top */}
          {item.warnings?.length > 0 && (
            <div className="mb-4 space-y-2">
              {item.warnings.map(w => (
                <div key={w.id} className={cn("flex items-start gap-2 p-3 rounded-lg border",
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
          <section className="mb-5">
            <KnowledgeContentRenderer blocks={item.content_blocks} />
          </section>

          <hr className="border-gray-700/50 mb-4" />

          {/* Known Issues */}
          {item.known_issues?.length > 0 && (
            <section className="mb-5">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
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
                    {issue.resolution && <p className="text-xs text-green-400"><span className="font-semibold">Resolution:</span> {issue.resolution}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tips */}
          {item.tips?.length > 0 && (
            <section className="mb-5">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
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
            </section>
          )}

          <hr className="border-gray-700/50 mb-4" />

          {/* Related Parts */}
          <KnowledgePartLinks knowledgeItemId={item.id} />

          {/* Project Notes */}
          <KnowledgeProjectNotes knowledgeItemId={item.id} />

          {/* Changelog */}
          {item.changelog?.length > 0 && (
            <section className="mt-4 pt-4 border-t border-gray-700/50">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
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
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-red-900/30 p-4 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700">Close</Button>
          <Button onClick={() => onEdit(item)} className="flex-1 bg-red-600 hover:bg-red-700 gap-1">
            <Pencil className="w-4 h-4" /> Edit
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}