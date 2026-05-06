import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Clock, Tag, ExternalLink, Package, ListChecks, FileText, Image, Pin, Crown, Link2, AlertOctagon, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { POST_TYPE_CONFIG } from "./KnowledgeFeedCard";
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

function getCoverImage(item) {
  if (item.cover_image_url) return item.cover_image_url;
  if (item.image_urls?.length > 0) return item.image_urls[0];
  if (item.media_urls?.length > 0) return item.media_urls[0];
  return null;
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

  const postType = item.post_type || item.type || 'procedure';
  const config = POST_TYPE_CONFIG[postType] || POST_TYPE_CONFIG.procedure;
  const cat = categories.find(c => c.id === item.category_id);
  const subcat = categories.find(c => c.id === item.subcategory_id);
  const linkedTasks = tasks.filter(t => taskLinks.some(l => l.task_id === t.id));
  const hasHtmlContent = item.content_html && item.content_html !== '<p><br></p>';
  const hasLegacyContent = item.content_blocks?.length > 0;
  const imageUrls = item.image_urls || [];
  const legacyMediaUrls = item.media_urls || [];
  const allImages = [...imageUrls, ...legacyMediaUrls];
  const coverImg = getCoverImage(item);

  // Child posts (attached to this master)
  const childPosts = item.is_master_procedure
    ? allItems.filter(i => i.parent_procedure_id === item.id)
    : [];

  // Parent procedure
  const parentProcedure = item.parent_procedure_id
    ? allItems.find(i => i.id === item.parent_procedure_id)
    : null;

  // Superseded-by item
  const supersededBy = item.superseded_by_id
    ? allItems.find(i => i.id === item.superseded_by_id)
    : null;

  // Related posts — group by type for better rails
  const relatedPosts = allItems.filter(i =>
    i.id !== item.id &&
    !childPosts.some(c => c.id === i.id) &&
    !i.is_obsolete &&
    (i.category_id === item.category_id || i.subcategory_id === item.subcategory_id)
  ).slice(0, 8);

  const relatedProcedures = relatedPosts.filter(i => (i.post_type || i.type) === 'procedure' || i.is_master_procedure);
  const relatedNotes = relatedPosts.filter(i => {
    const pt = i.post_type || i.type;
    return pt !== 'procedure' && !i.is_master_procedure;
  });

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{item.title}</SheetTitle>
          <SheetDescription>Knowledge post detail view</SheetDescription>
        </SheetHeader>

        {/* IMAGE-FIRST: Cover */}
        {coverImg && (
          <div className="w-full h-48 md:h-56 overflow-hidden bg-gray-800 shrink-0">
            <img src={coverImg} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Header */}
        <div className="p-4 pb-3 shrink-0">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {item.is_master_procedure && (
              <Badge className="bg-red-900/50 text-red-300 text-[10px] gap-1 border-0">
                <Crown className="w-2.5 h-2.5" /> MASTER PROCEDURE
              </Badge>
            )}
            {item.is_pinned && !item.is_master_procedure && (
              <Badge className="bg-amber-900/40 text-amber-300 text-[10px] gap-1 border-0">
                <Pin className="w-2.5 h-2.5" /> PINNED
              </Badge>
            )}
            <Badge className="text-[10px] border-0 bg-gray-800 text-gray-300 gap-1">
              <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
              {config.label}
            </Badge>
            {item.is_obsolete && (
              <Badge className="bg-gray-700/60 text-gray-400 text-[10px] gap-1 border-0">
                <AlertOctagon className="w-2.5 h-2.5" /> OBSOLETE
              </Badge>
            )}
            {item.status === 'draft' && <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-xs">Draft</Badge>}
            {item.status === 'archived' && <Badge variant="outline" className="border-gray-600/50 text-gray-500 text-xs">Archived</Badge>}
          </div>

          {/* Obsolete / superseded notice */}
          {item.is_obsolete && (
            <div className="rounded-lg bg-amber-950/30 border border-amber-900/40 p-3 mb-2">
              <p className="text-xs text-amber-300 font-medium flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5" /> This post has been marked obsolete
              </p>
              {supersededBy && (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" /> Replaced by: <span className="text-red-400 font-medium">{supersededBy.title}</span>
                </p>
              )}
            </div>
          )}

          {/* Category breadcrumb */}
          {cat && (
            <p className="text-xs text-gray-500 mb-1">
              <span className="w-2 h-2 inline-block rounded-full mr-1" style={{ backgroundColor: cat.color }} />
              {cat.name}{subcat ? ` › ${subcat.name}` : ''}
            </p>
          )}

          <h2 className="text-xl md:text-2xl font-bold text-white leading-tight">{item.title}</h2>
          {item.summary && <p className="text-gray-400 text-sm mt-1.5">{item.summary}</p>}

          {/* Parent procedure link */}
          {parentProcedure && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <Link2 className="w-3 h-3" />
              <span>Attached to:</span>
              <span className="text-red-400 font-medium">{parentProcedure.title}</span>
            </div>
          )}

          {/* Vehicle tags + meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500 mt-3">
            {item.vehicle_tags?.map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] border-gray-700 text-gray-300 gap-0.5 py-0 h-5">
                <Tag className="w-2.5 h-2.5" /> {tag}
              </Badge>
            ))}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {item.updated_date ? format(new Date(item.updated_date), 'MMM d, yyyy') : 'N/A'}
            </span>
            {item.created_by && <span className="text-gray-600">by {item.created_by.split('@')[0]}</span>}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* WYSIWYG Content (with inline images) */}
          {hasHtmlContent && (
            <section className="mb-5">
              <div
                className="prose prose-sm prose-invert max-w-none text-gray-200 
                  [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-white
                  [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white
                  [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white
                  [&_a]:text-blue-400 [&_a]:underline
                  [&_img]:rounded-lg [&_img]:my-3 [&_img]:max-w-full
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

          {/* Gallery Images (separate from inline) */}
          {allImages.length > 0 && (
            <section className="mb-5">
              <SectionLabel icon={Image} title="Photos" count={allImages.length} color="text-purple-400" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {allImages.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt="" className="rounded-lg h-32 w-full object-cover bg-gray-800 hover:opacity-90 transition-opacity" />
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

          {/* Child posts timeline (for master procedures) */}
          {childPosts.length > 0 && (
            <section className="mb-5">
              <SectionLabel icon={Link2} title="Field Intelligence Timeline" count={childPosts.length} color="text-red-400" />
              <div className="border-l-2 border-red-900/30 ml-2 pl-3 space-y-3">
                {childPosts
                  .sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0))
                  .map(child => {
                    const childConfig = POST_TYPE_CONFIG[child.post_type || child.type] || POST_TYPE_CONFIG.procedure;
                    return (
                      <div key={child.id} className="relative">
                        <div className="absolute -left-[19px] top-1.5 w-2.5 h-2.5 rounded-full bg-gray-800 border-2 border-red-800" />
                        <div className="p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm text-gray-200 font-medium flex-1 truncate">{child.title}</span>
                            <Badge className="text-[9px] bg-gray-700/50 text-gray-400 border-0">{childConfig.label}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500">
                            <Clock className="w-2.5 h-2.5" />
                            {child.updated_date ? format(new Date(child.updated_date), 'MMM d, yyyy') : '—'}
                            {child.created_by && <span>· {child.created_by.split('@')[0]}</span>}
                          </div>
                          {child.summary && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{child.summary}</p>}
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </section>
          )}

          {/* Project Notes */}
          <KnowledgeProjectNotes knowledgeItemId={item.id} />

          {/* Related Procedures */}
          {relatedProcedures.length > 0 && (
            <section className="mb-5">
              <SectionLabel icon={Crown} title="Related Procedures" count={relatedProcedures.length} color="text-blue-400" />
              <div className="space-y-1">
                {relatedProcedures.map(sib => (
                  <div key={sib.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-gray-200 flex-1 truncate">{sib.title}</span>
                    {sib.is_master_procedure && <Crown className="w-3 h-3 text-red-400 shrink-0" />}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Related Field Notes */}
          {relatedNotes.length > 0 && (
            <section className="mb-5">
              <SectionLabel icon={FileText} title="Related Field Notes" count={relatedNotes.length} color="text-gray-400" />
              <div className="space-y-1">
                {relatedNotes.map(sib => (
                  <div key={sib.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-200 flex-1 truncate">{sib.title}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer — large touch targets for shop floor */}
        <div className="shrink-0 bg-gray-900 border-t border-red-900/30 p-4 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700 h-11 text-base">Close</Button>
          <Button onClick={() => onEdit(item)} className="flex-1 bg-red-600 hover:bg-red-700 gap-1 h-11 text-base">
            <Pencil className="w-4 h-4" /> Update Post
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}