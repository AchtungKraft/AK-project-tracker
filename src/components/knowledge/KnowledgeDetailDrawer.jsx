import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Clock, Tag, ExternalLink, Package, ListChecks, FileText, Image, Pin, Crown, Link2, AlertOctagon, ArrowRight, Plus, ListOrdered, StickyNote, AlertTriangle, Lightbulb } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { POST_TYPE_CONFIG } from "./KnowledgeFeedCard";
import KnowledgePartLinks from "./KnowledgePartLinks";
import KnowledgeProjectNotes from "./KnowledgeProjectNotes";
import KnowledgeLegacyContent from "./KnowledgeLegacyContent";
import ProcedureEntryTimeline from "./ProcedureEntryTimeline";
import ProcedureEntryEditor from "./ProcedureEntryEditor";

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

const ADD_ENTRY_OPTIONS = [
  { type: "step", label: "Add Step", icon: ListOrdered },
  { type: "note", label: "Add Observation", icon: StickyNote },
  { type: "issue", label: "Add Issue", icon: AlertTriangle },
  { type: "reference", label: "Add Reference", icon: FileText },
  { type: "tip", label: "Add Tip", icon: Lightbulb },
];

export default function KnowledgeDetailDrawer({ item, categories, onClose, onEdit }) {
  const [entryEditorOpen, setEntryEditorOpen] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

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
  const { data: entries = [] } = useQuery({
    queryKey: ['procedureEntries', item?.id],
    queryFn: () => base44.entities.ProcedureEntry.filter({ procedure_id: item.id }),
    enabled: !!item?.id,
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
  const isMasterProcedure = item.is_master_procedure;

  // Parent procedure
  const parentProcedure = item.parent_procedure_id
    ? allItems.find(i => i.id === item.parent_procedure_id)
    : null;

  // Superseded-by item
  const supersededBy = item.superseded_by_id
    ? allItems.find(i => i.id === item.superseded_by_id)
    : null;

  // Related posts
  const relatedPosts = allItems.filter(i =>
    i.id !== item.id &&
    !i.is_obsolete &&
    (i.category_id === item.category_id || i.subcategory_id === item.subcategory_id)
  ).slice(0, 6);

  // Has entries (new model) or legacy content (old model)?
  const hasEntries = entries.length > 0;
  // Show legacy inline content only if no entries exist (backward compat)
  const showLegacyContent = !hasEntries && (hasHtmlContent || hasLegacyContent);

  return (
    <>
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
              {isMasterProcedure && (
                <Badge className="bg-red-900/50 text-red-300 text-[10px] gap-1 border-0">
                  <Crown className="w-2.5 h-2.5" /> PROCEDURE
                </Badge>
              )}
              {item.is_pinned && !isMasterProcedure && (
                <Badge className="bg-amber-900/40 text-amber-300 text-[10px] gap-1 border-0">
                  <Pin className="w-2.5 h-2.5" /> PINNED
                </Badge>
              )}
              <Badge className="text-[10px] border-0 bg-gray-800 text-gray-300 gap-1">
                <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
                {config.label}
              </Badge>
              {hasEntries && (
                <Badge className="text-[10px] border-0 bg-gray-800 text-gray-400">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</Badge>
              )}
              {item.is_obsolete && (
                <Badge className="bg-gray-700/60 text-gray-400 text-[10px] gap-1 border-0">
                  <AlertOctagon className="w-2.5 h-2.5" /> OBSOLETE
                </Badge>
              )}
              {item.status === 'draft' && <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-xs">Draft</Badge>}
              {item.status === 'archived' && <Badge variant="outline" className="border-gray-600/50 text-gray-500 text-xs">Archived</Badge>}
            </div>

            {/* Obsolete notice */}
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
                <span>Part of:</span>
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

            {/* ===== ENTRY TIMELINE (new model) ===== */}
            {(hasEntries || isMasterProcedure) && (
              <section className="mb-5">
                <SectionLabel
                  icon={ListOrdered}
                  title={isMasterProcedure ? "Procedure Entries" : "Entries"}
                  count={entries.length}
                  color="text-red-400"
                />
                <ProcedureEntryTimeline procedureId={item.id} />
              </section>
            )}

            {/* ===== LEGACY CONTENT (backward compat — shows only if no entries) ===== */}
            {showLegacyContent && (
              <>
                {hasHtmlContent && (
                  <section className="mb-5">
                    <SectionLabel icon={FileText} title="Content (Legacy)" color="text-gray-400" />
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
                {!hasHtmlContent && hasLegacyContent && (
                  <section className="mb-5">
                    <KnowledgeLegacyContent item={item} />
                  </section>
                )}
              </>
            )}

            {!hasEntries && !showLegacyContent && !isMasterProcedure && (
              <p className="text-gray-500 text-sm italic mb-5">No content yet. Add an entry to get started.</p>
            )}

            {/* Gallery Images (container-level) */}
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

            {/* Reference URL (container-level) */}
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

            {/* Project Notes */}
            <KnowledgeProjectNotes knowledgeItemId={item.id} />

            {/* Related posts */}
            {relatedPosts.length > 0 && (
              <section className="mb-5">
                <SectionLabel icon={Link2} title="Related" count={relatedPosts.length} color="text-gray-400" />
                <div className="space-y-1">
                  {relatedPosts.map(sib => (
                    <div key={sib.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-200 flex-1 truncate">{sib.title}</span>
                      {sib.is_master_procedure && <Crown className="w-3 h-3 text-red-400 shrink-0" />}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Footer — ADDITIVE workflow */}
          <div className="shrink-0 bg-gray-900 border-t border-red-900/30 p-3 space-y-2">
            {/* Add Entry quick actions — always visible */}
            {showAddMenu && (
              <div className="grid grid-cols-2 gap-2">
                {ADD_ENTRY_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <Button key={opt.type} variant="outline" size="sm"
                      onClick={() => { setShowAddMenu(false); setEntryEditorOpen(true); }}
                      className="border-gray-700 text-gray-300 gap-2 h-10 justify-start text-xs">
                      <Icon className="w-3.5 h-3.5" /> {opt.label}
                    </Button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="border-gray-700 h-11 text-base px-6">Close</Button>
              <Button onClick={() => setShowAddMenu(m => !m)} className="flex-1 bg-red-600 hover:bg-red-700 gap-2 h-11 text-base">
                <Plus className="w-4 h-4" /> Add Entry
              </Button>
              <Button variant="ghost" onClick={() => onEdit(item)} className="h-11 px-3 text-gray-400 hover:text-white" title="Edit container metadata">
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Entry Editor Sheet */}
      <ProcedureEntryEditor
        procedureId={item.id}
        procedureTitle={item.title}
        existingEntryCount={entries.length}
        isOpen={entryEditorOpen}
        onClose={() => setEntryEditorOpen(false)}
      />
    </>
  );
}