import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, AlertTriangle, Package, X, Lightbulb, Image, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPE_CONFIG } from "./KnowledgeListView";

// Local icon/color mapping for task knowledge cards (decoupled from list view)
const TASK_ICON_MAP = {
  procedure: { icon: BookOpen, color: "text-blue-400" },
  guide: { icon: BookOpen, color: "text-emerald-400" },
  issue: { icon: AlertTriangle, color: "text-amber-400" },
  reference: { icon: FileText, color: "text-purple-400" },
  checklist: { icon: BookOpen, color: "text-cyan-400" },
  tip: { icon: Lightbulb, color: "text-yellow-400" },
  document: { icon: FileText, color: "text-gray-400" },
};
import { toast } from "sonner";

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

function InlineIssues({ issues }) {
  if (!issues?.length) return null;
  return (
    <div className="space-y-1 mt-1">
      {issues.slice(0, 2).map(issue => (
        <div key={issue.id} className="flex items-start gap-1.5 text-xs">
          <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-amber-300 font-medium">{issue.title}</span>
            {issue.resolution && <span className="text-green-400 ml-1">→ {issue.resolution}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function InlineTips({ tips }) {
  if (!tips?.length) return null;
  return (
    <div className="space-y-1 mt-1">
      {tips.slice(0, 2).map(tip => (
        <div key={tip.id} className="flex items-start gap-1.5 text-xs">
          <Lightbulb className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
          <span className="text-yellow-200 line-clamp-1">{tip.text}</span>
        </div>
      ))}
    </div>
  );
}

function KnowledgeItemCard({ item, link, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
  const iconMap = TASK_ICON_MAP[item.type] || TASK_ICON_MAP.document;
  const Icon = iconMap.icon;
  const hasWarnings = item.warnings?.length > 0;
  const hasIssues = item.known_issues?.length > 0;
  const hasTips = item.tips?.length > 0;
  const mediaCount = (item.image_urls?.length || 0) + (item.media_urls?.length || 0);

  return (
    <div className="rounded-lg bg-gray-800/40 border border-gray-700/50 mb-1.5 overflow-hidden">
      {/* Header row — always visible */}
      <div className="flex items-start gap-2 p-2.5">
        <button onClick={() => setExpanded(!expanded)} className="mt-0.5 shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
        </button>
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", iconMap.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-white truncate">{item.title}</span>
            <Badge className="text-[10px] px-1 py-0 h-4 bg-gray-700/50 text-gray-300">{config.label}</Badge>
          </div>
          {/* Inline stat chips */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {hasWarnings && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400">{item.warnings.length} warning{item.warnings.length !== 1 ? 's' : ''}</span>}
            {hasIssues && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400">{item.known_issues.length} issue{item.known_issues.length !== 1 ? 's' : ''}</span>}
            {hasTips && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400">{item.tips.length} tip{item.tips.length !== 1 ? 's' : ''}</span>}
            {mediaCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">{mediaCount} media</span>}
          </div>
          {/* Always show warnings (critical operational info) */}
          <InlineWarnings warnings={item.warnings} />
        </div>
        <Button size="sm" variant="ghost" onClick={() => link && onRemove(link.id)}
          className="h-6 w-6 p-0 text-gray-500 hover:text-red-400 shrink-0">
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Expanded section — issues, tips, parts inline */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-700/30 pt-2 ml-6 space-y-2">
          {item.summary && <p className="text-xs text-gray-400">{item.summary}</p>}
          <InlineIssues issues={item.known_issues} />
          <InlineTips tips={item.tips} />
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

  const linkedItemIds = links.map(l => l.knowledge_item_id);
  const linkedItems = allItems.filter(item => linkedItemIds.includes(item.id));
  const availableItems = allItems.filter(item => !linkedItemIds.includes(item.id) && item.status !== 'archived');

  const createLinkMutation = useMutation({
    mutationFn: (data) => base44.entities.BuildKnowledgeTaskLink.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskKnowledgeLinks', taskId] });
      setShowAdd(false);
      setSelectedItemId("");
      toast.success("Knowledge item linked");
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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" /> Build Knowledge
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setShowAdd(!showAdd)} className="text-gray-400 hover:text-white gap-1 h-6 text-xs">
          <Plus className="w-3 h-3" /> Link
        </Button>
      </div>

      {showAdd && (
        <div className="flex gap-2 mb-3">
          <Select value={selectedItemId} onValueChange={setSelectedItemId}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-sm flex-1">
              <SelectValue placeholder="Select knowledge item..." />
            </SelectTrigger>
            <SelectContent>
              {availableItems.map(item => {
                const iconCfg = TASK_ICON_MAP[item.type] || TASK_ICON_MAP.document;
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
          <Button size="sm" onClick={handleAdd} disabled={!selectedItemId || createLinkMutation.isPending} className="bg-red-600 hover:bg-red-700 h-8">
            Add
          </Button>
        </div>
      )}

      {linkedItems.length === 0 && !showAdd && (
        <p className="text-xs text-gray-500 mb-2">No knowledge items linked</p>
      )}

      {linkedItems.map(item => {
        const link = links.find(l => l.knowledge_item_id === item.id);
        return <KnowledgeItemCard key={item.id} item={item} link={link} onRemove={(id) => removeLinkMutation.mutate(id)} />;
      })}
    </div>
  );
}