import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, AlertTriangle, Package, X, Lightbulb, FileText, ChevronDown, ChevronRight, Crown, Image, AlertOctagon, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPE_CONFIG } from "./KnowledgeListView";
import { getCoverImage, getExcerpt } from "./KnowledgeFeedCard";
import ExecutionTimeline from "./ExecutionTimeline";
import { toast } from "sonner";

const TASK_ICON_MAP = {
  procedure:   { icon: BookOpen, color: "text-blue-400" },
  observation: { icon: BookOpen, color: "text-emerald-400" },
  known_issue: { icon: AlertTriangle, color: "text-amber-400" },
  reference:   { icon: FileText, color: "text-purple-400" },
  tip:         { icon: Lightbulb, color: "text-yellow-400" },
  guide:       { icon: BookOpen, color: "text-emerald-400" },
  issue:       { icon: AlertTriangle, color: "text-amber-400" },
  checklist:   { icon: BookOpen, color: "text-cyan-400" },
  document:    { icon: FileText, color: "text-gray-400" },
};

function InlineWarnings({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <div className="space-y-1 mt-1.5">
      {warnings.slice(0, 3).map(w => (
        <div key={w.id} className={cn("flex items-start gap-1.5 text-xs p-1.5 rounded",
          w.severity === 'danger' ? "bg-red-900/30 text-red-300" :
          w.severity === 'warning' ? "bg-amber-900/30 text-amber-300" :
          "bg-yellow-900/20 text-yellow-300"
        )}>
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{w.text}</span>
        </div>
      ))}
    </div>
  );
}

function KnowledgeItemCard({ item, link, onRemove, partLinks, parts }) {
  const [expanded, setExpanded] = useState(false);
  const postType = item.post_type || item.type || 'procedure';
  const config = TYPE_CONFIG[postType] || TYPE_CONFIG.procedure;
  const iconMap = TASK_ICON_MAP[postType] || TASK_ICON_MAP.document;
  const Icon = iconMap.icon;
  const coverImg = getCoverImage(item);
  const excerpt = getExcerpt(item);
  const hasWarnings = item.warnings?.length > 0;

  // Resolve part names
  const partNames = (partLinks || []).map(pl => {
    const part = parts?.find(p => p.id === pl.part_id);
    return part?.part_name || part?.name || null;
  }).filter(Boolean).slice(0, 3);

  return (
    <div className={cn(
      "rounded-lg border mb-1.5 overflow-hidden",
      item.is_obsolete ? "bg-gray-800/20 border-gray-700/30 opacity-60" :
      item.is_master_procedure ? "bg-gray-800/40 border-red-900/40" :
      "bg-gray-800/40 border-gray-700/50"
    )}>
      {/* Hero image for procedures */}
      {coverImg && expanded && (
        <div className="w-full h-28 overflow-hidden bg-gray-800">
          <img src={coverImg} alt="" loading="lazy" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start gap-2 p-2.5">
        <button onClick={() => setExpanded(!expanded)} className="mt-0.5 shrink-0 p-1 -m-1">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
        </button>
        {/* Thumbnail when collapsed */}
        {coverImg && !expanded && (
          <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-gray-800">
            <img src={coverImg} alt="" loading="lazy" className="w-full h-full object-cover" />
          </div>
        )}
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", iconMap.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.is_master_procedure && <Crown className="w-3 h-3 text-red-400 shrink-0" />}
            <span className={cn("text-sm font-medium text-white truncate", item.is_obsolete && "line-through")}>{item.title}</span>
            <Badge className="text-[10px] px-1 py-0 h-4 bg-gray-700/50 text-gray-300">{config?.label || postType}</Badge>
            {item.is_obsolete && <Badge className="text-[9px] bg-gray-700/50 text-gray-500 border-0 gap-0.5"><AlertOctagon className="w-2 h-2" />obsolete</Badge>}
          </div>
          {/* Part chips + warnings always visible */}
          {partNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {partNames.map(name => (
                <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 flex items-center gap-0.5">
                  <Package className="w-2.5 h-2.5" /> {name}
                </span>
              ))}
            </div>
          )}
          <InlineWarnings warnings={item.warnings} />
        </div>
        <Button size="sm" variant="ghost" onClick={() => link && onRemove(link.id)}
          className="h-7 w-7 p-0 text-gray-500 hover:text-red-400 shrink-0">
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Expanded: procedure entries + legacy content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-700/30 pt-2 ml-6 space-y-2">
          {excerpt && <p className="text-xs text-gray-400">{excerpt}</p>}
          {/* Procedure entries — execution mode */}
          <ExecutionTimeline procedureId={item.id} />
          {/* Legacy: known issues */}
          {item.known_issues?.length > 0 && (
            <div className="space-y-1">
              {item.known_issues.slice(0, 2).map(issue => (
                <div key={issue.id} className="flex items-start gap-1.5 text-xs">
                  <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-amber-300 font-medium">{issue.title}</span>
                    {issue.resolution && <span className="text-green-400 ml-1">→ {issue.resolution}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Legacy: tips */}
          {item.tips?.length > 0 && (
            <div className="space-y-1">
              {item.tips.slice(0, 2).map(tip => (
                <div key={tip.id} className="flex items-start gap-1.5 text-xs">
                  <Lightbulb className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                  <span className="text-yellow-200 line-clamp-1">{tip.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskKnowledgeSection({ taskId }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");

  const { data: links = [] } = useQuery({
    queryKey: ['taskKnowledgeLinks', taskId],
    queryFn: () => base44.entities.BuildKnowledgeTaskLink.filter({ task_id: taskId }),
    enabled: !!taskId,
  });
  const { data: allItems = [] } = useQuery({
    queryKey: ['buildKnowledgeItems'],
    queryFn: () => base44.entities.BuildKnowledgeItem.list(),
    staleTime: 60000,
  });
  const { data: allPartLinks = [] } = useQuery({
    queryKey: ['allKnowledgePartLinks'],
    queryFn: () => base44.entities.BuildKnowledgePartLink.list(),
    staleTime: 60000,
  });
  const { data: allParts = [] } = useQuery({
    queryKey: ['parts_for_knowledge'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 120000,
  });

  const linkedItemIds = links.map(l => l.knowledge_item_id);
  const linkedItems = allItems.filter(item => linkedItemIds.includes(item.id));
  const availableItems = allItems.filter(item => !linkedItemIds.includes(item.id) && item.status !== 'archived' && !item.is_obsolete);

  const partLinksByItem = {};
  allPartLinks.forEach(l => {
    if (!partLinksByItem[l.knowledge_item_id]) partLinksByItem[l.knowledge_item_id] = [];
    partLinksByItem[l.knowledge_item_id].push(l);
  });

  const createLinkMutation = useMutation({
    mutationFn: (data) => base44.entities.BuildKnowledgeTaskLink.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskKnowledgeLinks', taskId] });
      setShowAdd(false);
      setSelectedItemId("");
      toast.success("Knowledge linked");
    },
  });

  const removeLinkMutation = useMutation({
    mutationFn: (linkId) => base44.entities.BuildKnowledgeTaskLink.delete(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskKnowledgeLinks', taskId] });
      toast.success("Link removed");
    },
  });

  const handleAdd = () => {
    if (!selectedItemId) return;
    createLinkMutation.mutate({ knowledge_item_id: selectedItemId, task_id: taskId, relevance: "primary" });
  };

  // Sort: master procedures first, then by updated
  const sortedLinked = [...linkedItems].sort((a, b) => {
    if (a.is_master_procedure && !b.is_master_procedure) return -1;
    if (!a.is_master_procedure && b.is_master_procedure) return 1;
    return 0;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" /> Build Knowledge
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setShowAdd(!showAdd)} className="text-gray-400 hover:text-white gap-1 h-7 text-xs px-2">
          <Plus className="w-3 h-3" /> Link
        </Button>
      </div>

      {showAdd && (
        <div className="flex gap-2 mb-3">
          <Select value={selectedItemId} onValueChange={setSelectedItemId}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9 text-sm flex-1">
              <SelectValue placeholder="Select knowledge post..." />
            </SelectTrigger>
            <SelectContent>
              {availableItems.map(item => {
                const iconCfg = TASK_ICON_MAP[item.post_type || item.type] || TASK_ICON_MAP.document;
                const ItemIcon = iconCfg.icon;
                return (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="flex items-center gap-2">
                      <ItemIcon className="w-3 h-3" />
                      {item.title}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!selectedItemId || createLinkMutation.isPending} className="bg-red-600 hover:bg-red-700 h-9">
            Add
          </Button>
        </div>
      )}

      {sortedLinked.length === 0 && !showAdd && (
        <p className="text-xs text-gray-500 mb-2">No knowledge items linked</p>
      )}

      {sortedLinked.map(item => {
        const link = links.find(l => l.knowledge_item_id === item.id);
        return (
          <KnowledgeItemCard
            key={item.id}
            item={item}
            link={link}
            onRemove={(id) => removeLinkMutation.mutate(id)}
            partLinks={partLinksByItem[item.id]}
            parts={allParts}
          />
        );
      })}
    </div>
  );
}