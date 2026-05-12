import React, { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, AlertTriangle, Package, ExternalLink,
  ChevronUp, ChevronDown, Crown, Plus, ListOrdered,
  StickyNote, Camera, Settings2, Pencil, Play, FileText,
  ListChecks, Link2, AlertOctagon
} from "lucide-react";
import { format } from "date-fns";
import ImageLightbox from "@/components/knowledge/ImageLightbox";
import ProcedureEntryTimeline from "@/components/knowledge/ProcedureEntryTimeline";
import ProcedureEntryEditor from "@/components/knowledge/ProcedureEntryEditor";
import KnowledgePartLinks from "@/components/knowledge/KnowledgePartLinks";
import KnowledgeProjectNotes from "@/components/knowledge/KnowledgeProjectNotes";
import KnowledgeLegacyContent from "@/components/knowledge/KnowledgeLegacyContent";
import ProcedureExecutionFlow from "@/components/knowledge/ProcedureExecutionFlow";

const QUICK_ADD = [
  { type: "step", label: "Step", icon: ListOrdered },
  { type: "note", label: "Note", icon: StickyNote },
  { type: "issue", label: "Warning", icon: AlertTriangle },
  { type: "media", label: "Photos", icon: Camera },
];

export default function ProcedurePage() {
  const urlParams = new URLSearchParams(window.location.search);
  const procedureId = urlParams.get('id');

  const [entryEditorOpen, setEntryEditorOpen] = useState(false);
  const [entryEditorType, setEntryEditorType] = useState("step");
  const [editingEntry, setEditingEntry] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [executionMode, setExecutionMode] = useState(false);
  const [coverLightbox, setCoverLightbox] = useState(false);

  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ['buildKnowledgeItem', procedureId],
    queryFn: async () => {
      const items = await base44.entities.BuildKnowledgeItem.filter({ id: procedureId });
      return items[0] || null;
    },
    enabled: !!procedureId,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['procedureEntries', procedureId],
    queryFn: () => base44.entities.ProcedureEntry.filter({ procedure_id: procedureId }, 'order_index'),
    enabled: !!procedureId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
    staleTime: 60000,
  });

  const { data: taskLinks = [] } = useQuery({
    queryKey: ['knowledgeTaskLinks_detail', procedureId],
    queryFn: () => base44.entities.BuildKnowledgeTaskLink.filter({ knowledge_item_id: procedureId }),
    enabled: !!procedureId,
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

  if (itemLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-gray-400 p-6">
        <p className="text-lg mb-2">Procedure not found</p>
        <Link to="/buildknowledge" className="text-blue-400 text-sm hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Procedures
        </Link>
      </div>
    );
  }

  const cat = categories.find(c => c.id === item.category_id);
  const subcat = categories.find(c => c.id === item.subcategory_id);
  const linkedTasks = tasks.filter(t => taskLinks.some(l => l.task_id === t.id));
  const hasEntries = entries.length > 0;
  const hasHtmlContent = item.content_html && item.content_html !== '<p><br></p>';
  const hasLegacyContent = item.content_blocks?.length > 0;
  const showLegacyContent = !hasEntries && (hasHtmlContent || hasLegacyContent);
  const coverImg = item.cover_image_url || item.image_urls?.[0] || item.media_urls?.[0];
  const supersededBy = item.superseded_by_id ? allItems.find(i => i.id === item.superseded_by_id) : null;
  const parentProcedure = item.parent_procedure_id ? allItems.find(i => i.id === item.parent_procedure_id) : null;
  const stepCount = entries.filter(e => (e.entry_type || 'step') === 'step').length;

  const openEntryEditor = (type) => {
    setEditingEntry(null);
    setEntryEditorType(type);
    setEntryEditorOpen(true);
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setEntryEditorType(entry.entry_type || 'step');
    setEntryEditorOpen(true);
  };

  // Execution mode = full immersive flow, no chrome
  if (executionMode) {
    return (
      <>
        <ProcedureExecutionFlow
          item={item}
          entries={entries}
          categories={categories}
          onClose={() => setExecutionMode(false)}
        />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-950">
        {/* Sticky header — procedural, not admin */}
        <div className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/40">
          <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
            <Link to="/buildknowledge"
              className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-white active:bg-gray-800 transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-white truncate">{item.title}</h1>
              <div className="flex items-center gap-2 text-[10px] text-gray-600">
                {cat && <span>{cat.name}{subcat ? ` › ${subcat.name}` : ''}</span>}
                {hasEntries && <span>· {stepCount} steps</span>}
              </div>
            </div>

            {/* Primary actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {hasEntries && (
                <button onClick={() => setExecutionMode(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium active:bg-blue-700 transition-colors">
                  <Play className="w-3.5 h-3.5" /> Execute
                </button>
              )}
              {hasEntries && (
                <button onClick={() => setEditMode(!editMode)}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    editMode ? "bg-amber-600 text-white" : "text-gray-500 hover:text-white hover:bg-gray-800"
                  )}>
                  <Settings2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Natural browser scroll content */}
        <div className="max-w-3xl mx-auto">
          {/* Cover image */}
          {coverImg && (
            <button onClick={() => setCoverLightbox(true)} className="w-full h-48 md:h-64 overflow-hidden bg-gray-900 block">
              <img src={coverImg} alt="" className="w-full h-full object-cover" />
            </button>
          )}

          {/* Procedure header */}
          <div className="px-5 pt-5 pb-4">
            {item.is_obsolete && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-2">
                <AlertOctagon className="w-3.5 h-3.5 shrink-0" /> Obsolete
                {supersededBy && <span className="text-gray-500">→ {supersededBy.title}</span>}
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-1">
              {cat && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  {cat.name}{subcat ? ` › ${subcat.name}` : ''}
                </span>
              )}
              {item.is_master_procedure && (
                <span className="flex items-center gap-1 text-red-400 text-[10px] font-semibold uppercase tracking-wide">
                  <Crown className="w-3 h-3" /> Procedure
                </span>
              )}
              {item.status === 'draft' && <span className="text-yellow-500 text-[10px]">Draft</span>}
            </div>

            <h1 className="text-2xl font-bold text-white leading-tight">{item.title}</h1>
            {item.summary && <p className="text-gray-400 text-base mt-1 leading-relaxed">{item.summary}</p>}

            <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-600 flex-wrap">
              {item.vehicle_tags?.map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-400">{tag}</span>
              ))}
              {hasEntries && <span>{entries.length} entries · {stepCount} steps</span>}
              {item.updated_date && <span className="ml-auto">{format(new Date(item.updated_date), 'MMM d, yyyy')}</span>}
            </div>

            {parentProcedure && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-500">
                <Link2 className="w-3 h-3" /> Part of: <span className="text-red-400">{parentProcedure.title}</span>
              </div>
            )}
          </div>

          {/* Quick-add strip */}
          <div className="px-5 pb-4 flex gap-2 overflow-x-auto scrollbar-hide">
            {QUICK_ADD.map(qa => {
              const QIcon = qa.icon;
              return (
                <button key={qa.type} onClick={() => openEntryEditor(qa.type)}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gray-800/60 text-gray-400 active:bg-gray-700 text-sm transition-colors">
                  <QIcon className="w-3.5 h-3.5" /> {qa.label}
                </button>
              );
            })}
          </div>

          <div className="border-t border-gray-800/30 mx-5" />

          {/* Procedure entries — native scroll */}
          <div className="px-5 pt-4 pb-8">
            {(hasEntries || item.is_master_procedure) && (
              <ProcedureEntryTimeline
                procedureId={item.id}
                editMode={editMode}
                onEditEntry={handleEditEntry}
              />
            )}

            {showLegacyContent && (
              <div className="mb-6">
                {hasHtmlContent ? (
                  <div className="prose prose-sm prose-invert max-w-none text-gray-200
                    [&_a]:text-blue-400 [&_a]:underline [&_img]:rounded-lg [&_img]:my-3 [&_img]:max-w-full
                    [&_blockquote]:border-l-red-600 [&_blockquote]:text-gray-400"
                    dangerouslySetInnerHTML={{ __html: item.content_html }}
                  />
                ) : (
                  <KnowledgeLegacyContent item={item} />
                )}
              </div>
            )}

            {!hasEntries && !showLegacyContent && !item.is_master_procedure && (
              <div className="text-center py-12">
                <ListOrdered className="w-6 h-6 mx-auto mb-2 text-gray-700" />
                <p className="text-sm text-gray-500">No steps yet</p>
                <p className="text-xs text-gray-600 mt-0.5">Add your first step to begin building this procedure</p>
                <button onClick={() => openEntryEditor("step")}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-red-600 text-white text-sm font-medium active:bg-red-700 transition-colors">
                  <Plus className="w-4 h-4" /> Add First Step
                </button>
              </div>
            )}
          </div>

          {/* Context sections */}
          <div className="px-5 pb-8 space-y-5">
            {/* Container gallery */}
            {(item.image_urls?.length > 0 || item.media_urls?.length > 0) && (
              <ContainerGallery images={[...(item.image_urls || []), ...(item.media_urls || [])]} />
            )}

            {item.reference_url && (
              <a href={item.reference_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg bg-gray-900/60 hover:bg-gray-800/50 transition-colors text-sm">
                <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-blue-400 truncate">{item.reference_url}</span>
              </a>
            )}

            {item.attachments?.length > 0 && (
              <div className="space-y-1.5">
                {item.attachments.map(att => (
                  <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-900/60 hover:bg-gray-800/50 transition-colors text-sm">
                    <FileText className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-gray-300">{att.name}</span>
                  </a>
                ))}
              </div>
            )}

            <KnowledgePartLinks knowledgeItemId={item.id} />

            {linkedTasks.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2 flex items-center gap-1">
                  <ListChecks className="w-3 h-3" /> Linked Tasks ({linkedTasks.length})
                </h4>
                <div className="space-y-1">
                  {linkedTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-900/40 text-sm text-gray-300">
                      <ListChecks className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="truncate">{task.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <KnowledgeProjectNotes knowledgeItemId={item.id} />
          </div>

          {/* Bottom spacer for safe area */}
          <div className="h-24" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>

      {/* Cover lightbox */}
      {coverLightbox && coverImg && (
        <ImageLightbox images={[coverImg]} initialIndex={0} onClose={() => setCoverLightbox(false)} />
      )}

      {/* Entry editor sheet */}
      <ProcedureEntryEditor
        procedureId={item.id}
        procedureTitle={item.title}
        existingEntryCount={entries.length}
        isOpen={entryEditorOpen}
        onClose={() => { setEntryEditorOpen(false); setEditingEntry(null); }}
        initialEntryType={entryEditorType}
        existingEntry={editingEntry}
      />
    </>
  );
}

function ContainerGallery({ images }) {
  const [lightbox, setLightbox] = useState(null);
  if (!images.length) return null;
  return (
    <>
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">Photos ({images.length})</h4>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {images.map((url, i) => (
            <button key={i} onClick={() => setLightbox({ images, index: i })}
              className="shrink-0 rounded-lg overflow-hidden bg-gray-800 hover:ring-2 hover:ring-blue-500/50 transition-all">
              <img src={url} alt="" loading="lazy" className="h-24 w-32 object-cover" />
            </button>
          ))}
        </div>
      </div>
      {lightbox && <ImageLightbox images={lightbox.images} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </>
  );
}