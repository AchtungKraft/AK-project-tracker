import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Clock, Tag, ExternalLink, Package, ListChecks, FileText, Image, Pin, Crown, Link2, AlertOctagon, ArrowRight, Plus, ListOrdered, StickyNote, AlertTriangle, Lightbulb, Camera, Play } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { POST_TYPE_CONFIG } from "./KnowledgeFeedCard";
import KnowledgePartLinks from "./KnowledgePartLinks";
import KnowledgeProjectNotes from "./KnowledgeProjectNotes";
import KnowledgeLegacyContent from "./KnowledgeLegacyContent";
import ProcedureEntryTimeline from "./ProcedureEntryTimeline";
import ProcedureEntryEditor from "./ProcedureEntryEditor";
import ImageLightbox from "./ImageLightbox";
import ExecutionModeView from "./ExecutionModeView";

function getCoverImage(item) {
  if (item.cover_image_url) return item.cover_image_url;
  if (item.image_urls?.length > 0) return item.image_urls[0];
  if (item.media_urls?.length > 0) return item.media_urls[0];
  return null;
}

const QUICK_ADD = [
  { type: "step", label: "Step", icon: ListOrdered },
  { type: "note", label: "Observation", icon: StickyNote },
  { type: "issue", label: "Issue", icon: AlertTriangle },
  { type: "tip", label: "Tip", icon: Lightbulb },
  { type: "media", label: "Photos", icon: Camera },
];

export default function KnowledgeDetailDrawer({ item, categories, onClose, onEdit }) {
  const [entryEditorOpen, setEntryEditorOpen] = useState(false);
  const [entryEditorType, setEntryEditorType] = useState("step");
  const [coverLightbox, setCoverLightbox] = useState(false);
  const [executionMode, setExecutionMode] = useState(false);

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
  const coverImg = getCoverImage(item);

  const supersededBy = item.superseded_by_id ? allItems.find(i => i.id === item.superseded_by_id) : null;
  const parentProcedure = item.parent_procedure_id ? allItems.find(i => i.id === item.parent_procedure_id) : null;
  const hasEntries = entries.length > 0;
  const showLegacyContent = !hasEntries && (hasHtmlContent || hasLegacyContent);

  const openEntryEditor = (type) => {
    setEntryEditorType(type);
    setEntryEditorOpen(true);
  };

  return (
    <>
      <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{item.title}</SheetTitle>
            <SheetDescription>Procedure detail</SheetDescription>
          </SheetHeader>

          {/* ===== LIGHTWEIGHT HEADER ===== */}
          <div className="shrink-0">
            {/* Cover image — tap to zoom */}
            {coverImg && (
              <button onClick={() => setCoverLightbox(true)} className="w-full h-40 md:h-48 overflow-hidden bg-gray-800 block">
                <img src={coverImg} alt="" className="w-full h-full object-cover hover:scale-[1.02] transition-transform" />
              </button>
            )}

            <div className="px-4 pt-3 pb-2">
              {/* Obsolete banner */}
              {item.is_obsolete && (
                <div className="rounded-md bg-amber-950/30 border border-amber-900/40 px-3 py-2 mb-2 flex items-center gap-2 text-xs text-amber-300">
                  <AlertOctagon className="w-3.5 h-3.5 shrink-0" /> Obsolete
                  {supersededBy && <span className="text-gray-400 ml-1">→ {supersededBy.title}</span>}
                </div>
              )}

              {/* Category + status line */}
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                {cat && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    {cat.name}{subcat ? ` › ${subcat.name}` : ''}
                  </span>
                )}
                {item.is_master_procedure && <Badge className="bg-red-900/50 text-red-300 text-[9px] gap-0.5 border-0 h-4"><Crown className="w-2 h-2" /> PROCEDURE</Badge>}
                {item.is_pinned && !item.is_master_procedure && <Badge className="bg-amber-900/40 text-amber-300 text-[9px] gap-0.5 border-0 h-4"><Pin className="w-2 h-2" /> PINNED</Badge>}
                {item.status === 'draft' && <Badge variant="outline" className="border-yellow-600/40 text-yellow-500 text-[9px] h-4">Draft</Badge>}
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-white leading-tight">{item.title}</h2>
              {item.summary && <p className="text-gray-400 text-sm mt-1 leading-snug">{item.summary}</p>}

              {/* Compact meta row — vehicle tags, parts count, date */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {item.vehicle_tags?.map(tag => (
                  <Badge key={tag} variant="outline" className="text-[9px] border-gray-700 text-gray-400 gap-0.5 py-0 h-[18px]">
                    <Tag className="w-2 h-2" /> {tag}
                  </Badge>
                ))}
                {hasEntries && (
                  <span className="text-[10px] text-gray-500">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</span>
                )}
                <span className="text-[10px] text-gray-600 flex items-center gap-0.5 ml-auto">
                  <Clock className="w-2.5 h-2.5" />
                  {item.updated_date ? format(new Date(item.updated_date), 'MMM d, yyyy') : ''}
                </span>
              </div>

              {parentProcedure && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-500">
                  <Link2 className="w-2.5 h-2.5" /> Part of: <span className="text-red-400">{parentProcedure.title}</span>
                </div>
              )}
            </div>

            {/* Execution mode trigger + Quick-add strip — large touch targets */}
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
              {hasEntries && (
                <button onClick={() => setExecutionMode(true)}
                  className="shrink-0 flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors active:scale-95">
                  <Play className="w-4 h-4" /> Execute
                </button>
              )}
              {QUICK_ADD.map(qa => {
                const QIcon = qa.icon;
                return (
                  <button key={qa.type} onClick={() => openEntryEditor(qa.type)}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm transition-colors active:scale-95">
                    <QIcon className="w-4 h-4" /> {qa.label}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-gray-800/60" />
          </div>

          {/* ===== PRIMARY CONTENT: TIMELINE ===== */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">

            {/* Entry Timeline */}
            {(hasEntries || item.is_master_procedure) && (
              <ProcedureEntryTimeline procedureId={item.id} />
            )}

            {/* Legacy content fallback */}
            {showLegacyContent && (
              <div className="mb-4">
                {hasHtmlContent ? (
                  <div className="prose prose-sm prose-invert max-w-none text-gray-200
                    [&_a]:text-blue-400 [&_a]:underline [&_img]:rounded-lg [&_img]:my-3 [&_img]:max-w-full
                    [&_blockquote]:border-l-red-600 [&_blockquote]:text-gray-400
                    [&_code]:bg-gray-800 [&_code]:text-red-400 [&_code]:px-1 [&_code]:rounded"
                    dangerouslySetInnerHTML={{ __html: item.content_html }}
                  />
                ) : (
                  <KnowledgeLegacyContent item={item} />
                )}
              </div>
            )}

            {!hasEntries && !showLegacyContent && !item.is_master_procedure && (
              <div className="text-center py-8">
                <ListOrdered className="w-6 h-6 mx-auto mb-1.5 text-gray-600" />
                <p className="text-sm text-gray-500">No entries yet</p>
                <p className="text-xs text-gray-600">Tap a button above to add your first step</p>
              </div>
            )}

            {/* ===== SECONDARY: Context sections ===== */}
            <div className="mt-4 space-y-4">
              {/* Container-level gallery */}
              {(item.image_urls?.length > 0 || item.media_urls?.length > 0) && (
                <ContainerImages images={[...(item.image_urls || []), ...(item.media_urls || [])]} />
              )}

              {/* Reference URL */}
              {item.reference_url && (
                <a href={item.reference_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-colors text-xs">
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-blue-400 truncate">{item.reference_url}</span>
                </a>
              )}

              {/* Attachments */}
              {item.attachments?.length > 0 && (
                <div className="space-y-1">
                  {item.attachments.map(att => (
                    <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-colors text-xs">
                      <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="text-gray-300">{att.name}</span>
                    </a>
                  ))}
                </div>
              )}

              <KnowledgePartLinks knowledgeItemId={item.id} />

              {linkedTasks.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5 flex items-center gap-1">
                    <ListChecks className="w-3 h-3" /> Tasks ({linkedTasks.length})
                  </h4>
                  <div className="space-y-1">
                    {linkedTasks.map(task => (
                      <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/30 text-sm text-gray-300">
                        <ListChecks className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <span className="truncate">{task.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <KnowledgeProjectNotes knowledgeItemId={item.id} />
            </div>
          </div>

          {/* ===== FOOTER — large touch targets for shop floor ===== */}
          <div className="shrink-0 bg-gray-900 border-t border-gray-800 p-3 flex items-center gap-2"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <Button variant="outline" onClick={onClose} className="border-gray-700 h-12 px-4 text-sm">Close</Button>
            {hasEntries && (
              <Button onClick={() => setExecutionMode(true)} className="bg-blue-600 hover:bg-blue-700 gap-2 h-12 text-sm">
                <Play className="w-4 h-4" /> Execute
              </Button>
            )}
            <Button onClick={() => openEntryEditor("step")} className="flex-1 bg-red-600 hover:bg-red-700 gap-2 h-12 text-sm">
              <Plus className="w-4 h-4" /> Add Entry
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onEdit(item)} className="h-12 w-12 text-gray-500 hover:text-white" title="Edit metadata">
              <Pencil className="w-5 h-5" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Cover lightbox */}
      {coverLightbox && coverImg && (
        <ImageLightbox images={[coverImg]} initialIndex={0} onClose={() => setCoverLightbox(false)} />
      )}

      {/* Entry Editor */}
      <ProcedureEntryEditor
        procedureId={item.id}
        procedureTitle={item.title}
        existingEntryCount={entries.length}
        isOpen={entryEditorOpen}
        onClose={() => setEntryEditorOpen(false)}
        initialEntryType={entryEditorType}
      />

      {/* Execution Mode */}
      {executionMode && (
        <ExecutionModeView item={item} onClose={() => setExecutionMode(false)} />
      )}
    </>
  );
}

// Lightweight container images section
function ContainerImages({ images }) {
  const [lightbox, setLightbox] = useState(null);
  if (!images.length) return null;
  return (
    <>
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5 flex items-center gap-1">
          <Image className="w-3 h-3" /> Container Photos ({images.length})
        </h4>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {images.map((url, i) => (
            <button key={i} onClick={() => setLightbox({ images, index: i })} className="shrink-0 rounded-lg overflow-hidden bg-gray-800 hover:ring-2 hover:ring-blue-500/50 transition-all">
              <img src={url} alt="" loading="lazy" className="h-20 w-24 object-cover" />
            </button>
          ))}
        </div>
      </div>
      {lightbox && <ImageLightbox images={lightbox.images} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </>
  );
}