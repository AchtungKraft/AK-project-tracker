import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Clock, Tag, ExternalLink, Package, ListChecks, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import KnowledgePartLinks from "./KnowledgePartLinks";
import KnowledgeProjectNotes from "./KnowledgeProjectNotes";
import KnowledgeLegacyContent from "./KnowledgeLegacyContent";

function SectionLabel({ icon: Icon, title, count, color }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
      <Icon className={cn("w-3.5 h-3.5", color)} /> {title}
      {count !== undefined && <span className="text-gray-600">({count})</span>}
    </h3>
  );
}

export default function KnowledgeDetailDrawer({ item, categories, onClose, onEdit }) {
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

  const cat = categories.find(c => c.id === item.category_id);
  const subcat = categories.find(c => c.id === item.subcategory_id);
  const linkedTasks = tasks.filter(t => taskLinks.some(l => l.task_id === t.id));
  const hasHtmlContent = item.content_html && item.content_html !== '<p><br></p>';
  const hasLegacyContent = item.content_blocks?.length > 0;
  const imageUrls = item.image_urls || [];
  const legacyMediaUrls = item.media_urls || [];
  const allImages = [...imageUrls, ...legacyMediaUrls];
  const siblingItems = allItems.filter(i =>
    i.id !== item.id &&
    (i.category_id === item.category_id || i.subcategory_id === item.subcategory_id)
  ).slice(0, 5);

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="p-4 pb-3 shrink-0 space-y-0">
          <SheetDescription className="sr-only">Knowledge entry detail view</SheetDescription>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
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
              <Clock className="w-3 h-3" />
              v{item.version || 1} · {item.updated_date ? format(new Date(item.updated_date), 'MMM d, yyyy') : 'N/A'}
            </span>
            {item.created_by && <span className="text-gray-600">by {item.created_by}</span>}
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* WYSIWYG Content */}
          {hasHtmlContent && (
            <section className="mb-5">
              <div
                className="prose prose-sm prose-invert max-w-none text-gray-200 
                  [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-white
                  [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white
                  [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white
                  [&_a]:text-blue-400 [&_a]:underline
                  [&_img]:rounded-lg [&_img]:my-2
                  [&_blockquote]:border-l-red-600 [&_blockquote]:text-gray-400
                  [&_code]:bg-gray-800 [&_code]:text-red-400 [&_code]:px-1 [&_code]:rounded
                  [&_pre]:bg-gray-800 [&_pre]:rounded-lg [&_pre]:p-3"
                dangerouslySetInnerHTML={{ __html: item.content_html }}
              />
            </section>
          )}

          {/* Legacy block content (backward compat) */}
          {!hasHtmlContent && hasLegacyContent && (
            <section className="mb-5">
              <KnowledgeLegacyContent item={item} />
            </section>
          )}

          {!hasHtmlContent && !hasLegacyContent && (
            <p className="text-gray-500 text-sm italic mb-5">No content yet.</p>
          )}

          {/* Image Gallery */}
          {allImages.length > 0 && (
            <section className="mb-5">
              <SectionLabel icon={Image} title="Images" count={allImages.length} color="text-purple-400" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {allImages.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt="" className="rounded-lg h-32 w-full object-cover bg-gray-800 hover:opacity-90 transition-opacity" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Attachments */}
          {item.attachments?.length > 0 && (
            <section className="mb-5">
              <SectionLabel icon={FileText} title="Attachments" count={item.attachments.length} color="text-red-400" />
              <div className="space-y-1">
                {item.attachments.map(att => (
                  <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50 hover:bg-gray-800 transition-colors">
                    <FileText className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm text-gray-200">{att.name}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Reference URL */}
          {item.reference_url && (
            <section className="mb-5">
              <SectionLabel icon={ExternalLink} title="Reference" color="text-blue-400" />
              <a href={item.reference_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg bg-gray-800/40 border border-gray-700/50 hover:bg-gray-800 transition-colors">
                <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-sm text-blue-400 truncate">{item.reference_url}</span>
              </a>
            </section>
          )}

          <hr className="border-gray-700/50 mb-4" />

          {/* Related Parts */}
          <KnowledgePartLinks knowledgeItemId={item.id} />

          {/* Related Tasks */}
          {linkedTasks.length > 0 && (
            <section className="mb-5">
              <SectionLabel icon={ListChecks} title="Related Tasks" count={linkedTasks.length} color="text-green-400" />
              <div className="space-y-1">
                {linkedTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                    <ListChecks className="w-4 h-4 text-green-400 shrink-0" />
                    <span className="text-sm text-gray-200 flex-1 truncate">{task.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Project Notes */}
          <KnowledgeProjectNotes knowledgeItemId={item.id} />

          {/* Related Entries in same category */}
          {siblingItems.length > 0 && (
            <section className="mb-5">
              <SectionLabel icon={FileText} title="Related Entries" count={siblingItems.length} color="text-gray-400" />
              <div className="space-y-1">
                {siblingItems.map(sib => (
                  <div key={sib.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-200 flex-1 truncate">{sib.title}</span>
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
            <Pencil className="w-4 h-4" /> Edit
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}