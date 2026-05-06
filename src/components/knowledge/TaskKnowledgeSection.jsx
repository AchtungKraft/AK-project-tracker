import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, ExternalLink, AlertTriangle, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPE_CONFIG } from "./KnowledgeListView";
import { toast } from "sonner";

export default function TaskKnowledgeSection({ taskId }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");

  // Get links for this task
  const { data: links = [] } = useQuery({
    queryKey: ['taskKnowledgeLinks', taskId],
    queryFn: () => base44.entities.BuildKnowledgeTaskLink.filter({ task_id: taskId }),
    enabled: !!taskId,
  });

  // Get all knowledge items for linking and display
  const { data: allItems = [] } = useQuery({
    queryKey: ['buildKnowledgeItems'],
    queryFn: () => base44.entities.BuildKnowledgeItem.filter({ status: 'published' }),
    staleTime: 60000,
  });

  const linkedItemIds = links.map(l => l.knowledge_item_id);
  const linkedItems = allItems.filter(item => linkedItemIds.includes(item.id));
  const availableItems = allItems.filter(item => !linkedItemIds.includes(item.id));

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
                const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
                return (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="flex items-center gap-2">
                      <config.icon className="w-3 h-3" />
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
        const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.document;
        const Icon = config.icon;
        const link = links.find(l => l.knowledge_item_id === item.id);
        
        return (
          <div key={item.id} className="p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 mb-1.5">
            <div className="flex items-start gap-2">
              <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", config.color.split(' ')[1])} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-white truncate">{item.title}</span>
                  <Badge className={cn("text-[10px] px-1 py-0 h-4", config.color)}>{config.label}</Badge>
                </div>
                {item.summary && (
                  <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{item.summary}</p>
                )}
                {/* Quick warnings */}
                {item.warnings?.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {item.warnings.slice(0, 2).map(w => (
                      <div key={w.id} className="flex items-start gap-1.5 text-xs">
                        <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                        <span className="text-amber-300 line-clamp-1">{w.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => link && removeLinkMutation.mutate(link.id)}
                className="h-6 w-6 p-0 text-gray-500 hover:text-red-400 shrink-0">
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}