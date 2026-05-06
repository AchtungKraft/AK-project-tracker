import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Clock, Tag, AlertTriangle, Lightbulb, History, Package, ListChecks, ClipboardList, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import KnowledgeContentRenderer from "./KnowledgeContentRenderer";
import KnowledgePartLinks from "./KnowledgePartLinks";
import KnowledgeProjectNotes from "./KnowledgeProjectNotes";
import QuickAddActions from "./QuickAddActions";
import { TYPE_CONFIG } from "./KnowledgeListView";

function RelationshipPanel({ icon: Icon, title, count, color, children }) {
  if (count === 0) return null;
  return (
    <section className="mb-4">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
        <Icon className={cn("w-3.5 h-3.5", color)} /> {title} <span className="text-gray-600">({count})</span>
      </h3>
      {children}
    </section>
  );
}

export default function KnowledgeDetailDrawer({ item, categories, onClose, onEdit }) {
  const queryClient = useQueryClient();

  // All hooks must be called before any early return
  const { data: taskLinks = [] } = useQuery({
    queryKey: ['knowledgeTaskLinks_detail', item?.id],
    queryFn: () => base44.entities.BuildKnowledgeTaskLink.filter({ knowledge_item_id: item.id }),
    enabled: !!item?.id,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
    staleTime: 60000,
  });
  const { data: allItems = [] } = useQuery({
    queryKey: ['buildKnowledgeItems'],
    queryFn: () => base44.entities.BuildKnowledgeItem.list('-updated_date'),
    staleTime: 30000,
  });

  if (!item) return null;

  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
  const Icon = config.icon;
  const cat = categories.find(c => c.id === item.category_id);
  const subcat = categories.find(c => c.id === item.subcategory_id);

  const siblingProcedures = allItems.filter(i =>
    i.id !== item.id &&
    (i.category_id === item.category_id || i.subcategory_id === item.subcategory_id) &&
    ['procedure', 'guide', 'checklist'].includes(i.type)
  );
  const siblingDocuments = allItems.filter(i =>
    i.id !== item.id &&
    (i.category_id === item.category_id || i.subcategory_id === item.subcategory_id) &&
    ['document', 'reference'].includes(i.type)
  );

  const linkedTasks = tasks.filter(t => taskLinks.some(l => l.task_id === t.id));
  const warningCount = item.warnings?.length || 0;
  const issueCount = item.known_issues?.length || 0;
  const tipCount = item.tips?.length || 0;
  const mediaCount = (item.media_urls?.length || 0) + (item.content_blocks?.filter(b => ['image', 'gallery', 'video'].includes(b.type)).length || 0);
  const attachmentCount = item.attachments?.length || 0;

  const handleItemUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
  };

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="p-4 pb-2 shrink-0 space-y-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
            <Badge className={cn("text-xs", config.color)}>
              <Icon className="w-3 h-3 mr-1" />{config.label}
            </Badge>
            {item.status === 'draft' && <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-xs">Draft</Badge>}
            {item.status === 'archived' && <Badge variant="outline" className="border-gray-600/50 text-gray-500 text-xs">Archived</Badge>}
          </div>
          {cat && (
            <p className="text-xs text-gray-500">
              <span className="w-2 h-2 inline-block rounded-full mr-1" style={{ backgroundColor: cat.color }} />
              {cat.name}{subcat ? ` › ${subcat.name}` : ''}
            </p>
          )}
          <SheetTitle className="text-white text-xl font-bold leading-tight mt-1">{item.title}</SheetTitle>
          {item.summary && <p className="text-gray-400 text-sm mt-1">{item.summary}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
            {item.vehicle_tags?.length > 0 && (
              <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{item.vehicle_tags.join(', ')}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />v{item.version || 1} · {item.updated_date ? format(new Date(item.updated_date), 'MMM d, yyyy') : 'N/A'}
            </span>
          </div>
        </SheetHeader>

        {/* Quick Add Actions */}
        <div className="px-4">
          <QuickAddActions knowledgeItemId={item.id} onItemUpdated={handleItemUpdated} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {/* Warnings at top */}
          {warningCount > 0 && (
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

          {/* === RELATIONSHIP INTELLIGENCE PANELS === */}

          {/* Known Issues */}
          <RelationshipPanel icon={AlertTriangle} title="Known Issues" count={issueCount} color="text-amber-400">
            <div className="space-y-2">
              {item.known_issues?.map(issue => (
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
          </RelationshipPanel>

          {/* Tips */}
          <RelationshipPanel icon={Lightbulb} title="Tips" count={tipCount} color="text-yellow-400">
            <div className="space-y-2">
              {item.tips?.map(tip => (
                <div key={tip.id} className="p-3 rounded-lg bg-yellow-900/15 border border-yellow-700/30">
                  <p className="text-sm text-yellow-200">{tip.text}</p>
                  {tip.source && <p className="text-xs text-gray-500 mt-1">— {tip.source}</p>}
                </div>
              ))}
            </div>
          </RelationshipPanel>

          {/* Related Parts */}
          <KnowledgePartLinks knowledgeItemId={item.id} />

          {/* Related Tasks */}
          <RelationshipPanel icon={ListChecks} title="Related Tasks" count={linkedTasks.length} color="text-green-400">
            <div className="space-y-1">
              {linkedTasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                  <ListChecks className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-sm text-gray-200 flex-1 truncate">{task.name}</span>
                </div>
              ))}
            </div>
          </RelationshipPanel>

          {/* Project Observations */}
          <KnowledgeProjectNotes knowledgeItemId={item.id} />

          {/* Related Procedures (siblings) */}
          <RelationshipPanel icon={ClipboardList} title="Related Procedures" count={siblingProcedures.length} color="text-blue-400">
            <div className="space-y-1">
              {siblingProcedures.slice(0, 5).map(proc => {
                const pConfig = TYPE_CONFIG[proc.type] || TYPE_CONFIG.document;
                return (
                  <div key={proc.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                    <pConfig.icon className={cn("w-4 h-4 shrink-0", pConfig.color.split(' ')[1])} />
                    <span className="text-sm text-gray-200 flex-1 truncate">{proc.title}</span>
                  </div>
                );
              })}
            </div>
          </RelationshipPanel>

          {/* Related Documents (siblings) */}
          <RelationshipPanel icon={FileText} title="Related Documents" count={siblingDocuments.length} color="text-gray-400">
            <div className="space-y-1">
              {siblingDocuments.slice(0, 5).map(doc => (
                <div key={doc.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-200 flex-1 truncate">{doc.title}</span>
                </div>
              ))}
            </div>
          </RelationshipPanel>

          {/* Attachments / Media count */}
          {(mediaCount > 0 || attachmentCount > 0) && (
            <RelationshipPanel icon={Image} title="Media & Attachments" count={mediaCount + attachmentCount} color="text-purple-400">
              <div className="space-y-1">
                {item.media_urls?.map((url, i) => (
                  <img key={i} src={url} alt="" className="rounded-lg h-24 w-auto object-cover bg-gray-800 inline-block mr-2 mb-2" />
                ))}
                {item.attachments?.map(att => (
                  <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50 hover:bg-gray-800 transition-colors">
                    <FileText className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm text-gray-200">{att.name}</span>
                  </a>
                ))}
              </div>
            </RelationshipPanel>
          )}

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
        <div className="shrink-0 bg-gray-900 border-t border-red-900/30 p-4 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700">Close</Button>
          <Button onClick={() => onEdit(item)} className="flex-1 bg-red-600 hover:bg-red-700 gap-1">
            <Pencil className="w-4 h-4" /> Edit Structure
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}