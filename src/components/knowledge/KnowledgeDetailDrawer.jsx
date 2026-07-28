import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Pencil, ExternalLink, Package, ListChecks, FileText, Image, AlertOctagon, Plus, ListOrdered, StickyNote, AlertTriangle, Camera, Play, Link2, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { FORMAT_CONFIG, getCoverImage } from "./knowledgeHelpers";
import KnowledgeHtmlContent from "./KnowledgeHtmlContent";
import KnowledgePartLinks from "./KnowledgePartLinks";
import KnowledgeProjectNotes from "./KnowledgeProjectNotes";
import KnowledgeLegacyContent from "./KnowledgeLegacyContent";
import ProcedureEntryTimeline from "./ProcedureEntryTimeline";
import ProcedureEntryEditor from "./ProcedureEntryEditor";
import ImageLightbox from "./ImageLightbox";
import ExecutionModeView from "./ExecutionModeView";

const QUICK_ADD = [
  { type: "step", label: "Step", icon: ListOrdered },
  { type: "note", label: "Note", icon: StickyNote },
  { type: "issue", label: "Warning", icon: AlertTriangle },
  { type: "media", label: "Photos", icon: Camera },
];

export default function KnowledgeDetailDrawer({ item, categories, onClose, onEdit }) {
  const [entryEditorOpen, setEntryEditorOpen] = useState(false);
  const [entryEditorType, setEntryEditorType] = useState("step");
  const [editingEntry, setEditingEntry] = useState(null);
  const [insertAtIndex, setInsertAtIndex] = useState(null);
  const [coverLightbox, setCoverLightbox] = useState(false);
  const [executionMode, setExecutionMode] = useState(false);
  const [editMode, setEditMode] = useState(false);

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
    setEditingEntry(null);
    setEntryEditorType(type);
    setInsertAtIndex(null);
    setEntryEditorOpen(true);
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setEntryEditorType(entry.entry_type || 'step');
    setInsertAtIndex(null);
    setEntryEditorOpen(true);
  };

  const handleAddAtIndex = (index) => {
    setEditingEntry(null);
    setEntryEditorType("step");
    setInsertAtIndex(index);
    setEntryEditorOpen(true);
  };

  return (
    <>
      <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent className="bg-gray-950 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{item.title}</SheetTitle>
            <SheetDescription>Procedure detail</SheetDescription>
          </SheetHeader>

          {/* ===== CONDENSED HEADER ===== */}
          <div className="shrink-0">
            {coverImg && (
              <button onClick={() => setCoverLightbox(true)} className="w-full h-36 md:h-44 overflow-hidden bg-gray-900 block">
                <img src={coverImg} alt="" className="w-full h-full object-cover" />
              </button>
            )}

            <div className="px-4 pt-3 pb-2">
              {item.is_obsolete && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-1.5">
                  <AlertOctagon className="w-3 h-3 shrink-0" /> Obsolete
                  {supersededBy && <span className="text-gray-500">→ {supersededBy.title}</span>}
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-0.5">
                {cat && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    {cat.name}{subcat ? ` › ${subcat.name}` : ''}
                  </span>
                )}
                {item.is_master_procedure && <span className="text-red-400 text-[10px] font-semibold uppercase tracking-wide">Procedure</span>}
                {item.status === 'draft' && <span className="text-yellow-500 text-[10px]">Draft</span>}
              </div>

              <h2 className="text-lg font-bold text-white leading-tight">{item.title}</h2>
              {item.summary && <p className="text-gray-400 text-sm mt-0.5 leading-snug">{item.summary}</p>}

              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-600 flex-wrap">
                {item.vehicle_tags?.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-400">{tag}</span>
                ))}
                {hasEntries && <span>{entries.length} steps</span>}
                <span className="ml-auto">{item.updated_date ? format(new Date(item.updated_date), 'MMM d') : ''}</span>
              </div>

              {parentProcedure && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
                  <Link2 className="w-2.5 h-2.5" /> Part of: <span className="text-red-400">{parentProcedure.title}</span>
                </div>
              )}
            </div>

            {/* Action strip */}
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
              {hasEntries && (
                <button onClick={() => setExecutionMode(true)}
                  className="shrink-0 flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-medium active:bg-blue-700 transition-colors">
                  <Play className="w-4 h-4" /> Execute
                </button>
              )}
              {/* Edit mode toggle */}
              {hasEntries && (
                <button onClick={() => setEditMode(!editMode)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm transition-colors",
                    editMode ? "bg-amber-600 text-white" : "bg-gray-800/60 text-gray-400 active:bg-gray-700"
                  )}>
                  <Settings2 className="w-3.5 h-3.5" /> {editMode ? 'Done' : 'Reorder'}
                </button>
              )}
              {QUICK_ADD.map(qa => {
                const QIcon = qa.icon;
                return (
                  <button key={qa.type} onClick={() => openEntryEditor(qa.type)}
                    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-gray-800/60 text-gray-400 active:bg-gray-700 text-sm transition-colors">
                    <QIcon className="w-3.5 h-3.5" /> {qa.label}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-gray-800/40" />
          </div>

          {/* ===== PRIMARY CONTENT ===== */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
            {(hasEntries || item.is_master_procedure) && (
              <ProcedureEntryTimeline
                procedureId={item.id}
                editMode={editMode}
                onEditEntry={handleEditEntry}
                onAddAtIndex={handleAddAtIndex}
              />
            )}

            {showLegacyContent && (
              <div className="mb-4">
                {hasHtmlContent ? (
                  <KnowledgeHtmlContent html={item.content_html} />
                ) : (
                  <KnowledgeLegacyContent item={item} />
                )}
              </div>
            )}

            {!hasEntries && !showLegacyContent && !item.is_master_procedure && (
              <div className="text-center py-8">
                <ListOrdered className="w-5 h-5 mx-auto mb-1 text-gray-700" />
                <p className="text-sm text-gray-500">No steps yet</p>
                <p className="text-xs text-gray-600">Add your first step above</p>
              </div>
            )}

            {/* Context sections */}
            <div className="mt-4 space-y-4">
              {(item.image_urls?.length > 0 || item.media_urls?.length > 0) && (
                <ContainerImages images={[...(item.image_urls || []), ...(item.media_urls || [])]} />
              )}
              {item.reference_url && (
                <a href={item.reference_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-colors text-xs">
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-blue-400 truncate">{item.reference_url}</span>
                </a>
              )}
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

          {/* Footer */}
          <div className="shrink-0 bg-gray-950 border-t border-gray-800/40 px-3 py-2.5 flex items-center gap-2"
            style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
            <Button variant="ghost" onClick={onClose} className="text-gray-500 h-11 px-3 text-sm">Close</Button>
            <Button onClick={() => openEntryEditor("step")} className="flex-1 bg-red-600 hover:bg-red-700 gap-1.5 h-11 text-sm">
              <Plus className="w-4 h-4" /> Add Content
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onEdit(item)} className="h-11 w-11 text-gray-600 hover:text-white shrink-0">
              <Pencil className="w-4 h-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {coverLightbox && coverImg && (
        <ImageLightbox images={[coverImg]} initialIndex={0} onClose={() => setCoverLightbox(false)} />
      )}

      <ProcedureEntryEditor
        procedureId={item.id}
        procedureTitle={item.title}
        existingEntryCount={entries.length}
        isOpen={entryEditorOpen}
        onClose={() => { setEntryEditorOpen(false); setEditingEntry(null); setInsertAtIndex(null); }}
        initialEntryType={entryEditorType}
        existingEntry={editingEntry}
        insertAtIndex={insertAtIndex}
      />

      {executionMode && (
        <ExecutionModeView item={item} onClose={() => setExecutionMode(false)} />
      )}
    </>
  );
}

function ContainerImages({ images }) {
  const [lightbox, setLightbox] = useState(null);
  if (!images.length) return null;
  return (
    <>
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5 flex items-center gap-1">
          <Image className="w-3 h-3" /> Photos ({images.length})
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