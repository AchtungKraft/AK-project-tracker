import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ClipboardList, AlertTriangle, Package, Image, FileText, FolderOpen, Lightbulb, BookOpen } from "lucide-react";
import SubsystemSummaryStrip from "./SubsystemSummaryStrip";
import { TYPE_CONFIG } from "./KnowledgeListView";

function SectionHeader({ icon: Icon, title, count, color, isOpen, onToggle }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-2 w-full p-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-colors mb-1">
      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      <Icon className={cn("w-4 h-4", color)} />
      <span className="text-sm font-semibold text-white flex-1 text-left">{title}</span>
      <span className="text-xs text-gray-500">{count}</span>
    </button>
  );
}

function CompactItemRow({ item, onItemClick }) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
  const Icon = config.icon;
  return (
    <div onClick={() => onItemClick(item)} className="flex items-center gap-2 p-2 ml-4 rounded-lg bg-gray-800/30 border border-gray-800 hover:border-red-900/40 cursor-pointer transition-colors group">
      <Icon className={cn("w-4 h-4 shrink-0", config.color.split(' ')[1])} />
      <span className="text-sm text-gray-200 flex-1 truncate group-hover:text-red-400 transition-colors">{item.title}</span>
      {item.status === 'draft' && <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-[10px]">Draft</Badge>}
      <span className="text-[10px] text-gray-600">v{item.version || 1}</span>
    </div>
  );
}

function IssueRow({ issue }) {
  return (
    <div className="p-2 ml-4 rounded-lg bg-gray-800/30 border border-gray-800">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-sm text-white flex-1">{issue.title}</span>
        <Badge className={cn("text-[10px]",
          issue.severity === 'critical' ? 'bg-red-600/30 text-red-400' :
          issue.severity === 'high' ? 'bg-amber-600/30 text-amber-400' :
          'bg-gray-600/30 text-gray-400'
        )}>{issue.severity}</Badge>
      </div>
      {issue.resolution && <p className="text-xs text-green-400 ml-6 mt-0.5">{issue.resolution}</p>}
    </div>
  );
}

export default function SubsystemWorkspace({ items, categories, categoryId, onItemClick }) {
  const [openSections, setOpenSections] = useState({
    procedures: true, issues: true, parts: true, media: false, documents: false, observations: false
  });
  const toggle = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Fetch part links for all items in this category
  const itemIds = items.map(i => i.id);
  const { data: allPartLinks = [] } = useQuery({
    queryKey: ['knowledgePartLinksCategory', categoryId],
    queryFn: async () => {
      const links = await base44.entities.BuildKnowledgePartLink.list();
      return links.filter(l => itemIds.includes(l.knowledge_item_id));
    },
    enabled: itemIds.length > 0,
  });

  const { data: allTaskLinks = [] } = useQuery({
    queryKey: ['knowledgeTaskLinksCategory', categoryId],
    queryFn: async () => {
      const links = await base44.entities.BuildKnowledgeTaskLink.list();
      return links.filter(l => itemIds.includes(l.knowledge_item_id));
    },
    enabled: itemIds.length > 0,
  });

  const { data: allNotes = [] } = useQuery({
    queryKey: ['knowledgeProjectNotesCategory', categoryId],
    queryFn: async () => {
      const notes = await base44.entities.BuildKnowledgeProjectNote.list('-created_date');
      return notes.filter(n => itemIds.includes(n.knowledge_item_id));
    },
    enabled: itemIds.length > 0,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 60000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 60000,
  });

  // Grouped items
  const procedures = items.filter(i => ['procedure', 'guide', 'checklist'].includes(i.type));
  const documents = items.filter(i => ['document', 'reference'].includes(i.type));
  const tipItems = items.filter(i => i.type === 'tip');

  // Aggregate known issues across all items
  const allIssues = items.flatMap(i => (i.known_issues || []).map(issue => ({ ...issue, _sourceTitle: i.title, _sourceId: i.id })));

  // Aggregate media from content blocks
  const allMedia = items.flatMap(i => (i.content_blocks || []).filter(b => ['image', 'gallery', 'video'].includes(b.type)).map(b => ({ ...b, _sourceTitle: i.title })));
  const mediaUrls = items.flatMap(i => (i.media_urls || []).map(url => ({ url, _sourceTitle: i.title })));

  // Unique part IDs
  const partMap = useMemo(() => {
    const map = {};
    parts.forEach(p => { map[p.id] = p; });
    return map;
  }, [parts]);

  const uniquePartLinks = useMemo(() => {
    const seen = new Set();
    return allPartLinks.filter(l => {
      if (seen.has(l.part_id)) return false;
      seen.add(l.part_id);
      return true;
    });
  }, [allPartLinks]);

  return (
    <div className="space-y-3">
      {/* Summary Strip */}
      <SubsystemSummaryStrip
        items={items}
        partLinksCount={uniquePartLinks.length}
        taskLinksCount={allTaskLinks.length}
        notesCount={allNotes.length}
      />

      {/* PROCEDURES */}
      <div>
        <SectionHeader icon={ClipboardList} title="Procedures & Guides" count={procedures.length} color="text-blue-400" isOpen={openSections.procedures} onToggle={() => toggle('procedures')} />
        {openSections.procedures && (
          <div className="space-y-1 mb-3">
            {procedures.length === 0 ? <p className="text-xs text-gray-600 ml-4 py-2">No procedures documented yet</p> :
              procedures.map(item => <CompactItemRow key={item.id} item={item} onItemClick={onItemClick} />)
            }
          </div>
        )}
      </div>

      {/* KNOWN ISSUES */}
      <div>
        <SectionHeader icon={AlertTriangle} title="Known Issues" count={allIssues.length} color="text-amber-400" isOpen={openSections.issues} onToggle={() => toggle('issues')} />
        {openSections.issues && (
          <div className="space-y-1 mb-3">
            {allIssues.length === 0 ? <p className="text-xs text-gray-600 ml-4 py-2">No known issues</p> :
              allIssues.map((issue, i) => <IssueRow key={issue.id || i} issue={issue} />)
            }
          </div>
        )}
      </div>

      {/* RELATED PARTS */}
      <div>
        <SectionHeader icon={Package} title="Related Parts" count={uniquePartLinks.length} color="text-cyan-400" isOpen={openSections.parts} onToggle={() => toggle('parts')} />
        {openSections.parts && (
          <div className="space-y-1 mb-3">
            {uniquePartLinks.length === 0 ? <p className="text-xs text-gray-600 ml-4 py-2">No parts linked</p> :
              uniquePartLinks.map(link => {
                const part = partMap[link.part_id];
                if (!part) return null;
                return (
                  <div key={link.id} className="flex items-center gap-2 p-2 ml-4 rounded-lg bg-gray-800/30 border border-gray-800">
                    <Package className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-sm text-gray-200 flex-1 truncate">{part.part_name}</span>
                    {link.estimated_qty && <span className="text-xs text-gray-500">×{link.estimated_qty}</span>}
                    <Badge className={cn("text-[10px]",
                      link.requirement === 'required' ? 'bg-red-600/20 text-red-400' :
                      link.requirement === 'optional' ? 'bg-gray-600/20 text-gray-400' :
                      'bg-amber-600/20 text-amber-400'
                    )}>{link.requirement}</Badge>
                  </div>
                );
              })
            }
          </div>
        )}
      </div>

      {/* MEDIA */}
      <div>
        <SectionHeader icon={Image} title="Media References" count={allMedia.length + mediaUrls.length} color="text-purple-400" isOpen={openSections.media} onToggle={() => toggle('media')} />
        {openSections.media && (
          <div className="ml-4 mb-3">
            {allMedia.length + mediaUrls.length === 0 ? <p className="text-xs text-gray-600 py-2">No media</p> : (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {allMedia.filter(b => b.type === 'image').slice(0, 12).map((b, i) => (
                  <img key={i} src={b.data?.url} alt="" className="rounded-lg h-24 w-full object-cover bg-gray-800" />
                ))}
                {mediaUrls.slice(0, 8).map((m, i) => (
                  <img key={`u-${i}`} src={m.url} alt="" className="rounded-lg h-24 w-full object-cover bg-gray-800" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DOCUMENTS */}
      <div>
        <SectionHeader icon={FileText} title="Documents & References" count={documents.length} color="text-gray-400" isOpen={openSections.documents} onToggle={() => toggle('documents')} />
        {openSections.documents && (
          <div className="space-y-1 mb-3">
            {documents.length === 0 ? <p className="text-xs text-gray-600 ml-4 py-2">No documents</p> :
              documents.map(item => <CompactItemRow key={item.id} item={item} onItemClick={onItemClick} />)
            }
          </div>
        )}
      </div>

      {/* PROJECT OBSERVATIONS */}
      <div>
        <SectionHeader icon={FolderOpen} title="Project Observations" count={allNotes.length} color="text-yellow-400" isOpen={openSections.observations} onToggle={() => toggle('observations')} />
        {openSections.observations && (
          <div className="space-y-1 ml-4 mb-3">
            {allNotes.length === 0 ? <p className="text-xs text-gray-600 py-2">No project observations</p> :
              allNotes.slice(0, 10).map(note => {
                const project = projects.find(p => p.id === note.project_id);
                return (
                  <div key={note.id} className="p-2 rounded-lg bg-gray-800/30 border border-gray-800">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-gray-400">{project?.name || 'Unknown'}</span>
                      <Badge className={cn("text-[10px]",
                        note.discovery_type === 'issue' ? 'bg-red-600/20 text-red-400' :
                        note.discovery_type === 'deviation' ? 'bg-amber-600/20 text-amber-400' :
                        'bg-blue-600/20 text-blue-400'
                      )}>{note.discovery_type}</Badge>
                    </div>
                    <p className="text-sm text-gray-200">{note.note}</p>
                    {note.photos?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {note.photos.slice(0, 3).map((url, i) => <img key={i} src={url} alt="" className="w-12 h-12 rounded object-cover bg-gray-800" />)}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        )}
      </div>
    </div>
  );
}