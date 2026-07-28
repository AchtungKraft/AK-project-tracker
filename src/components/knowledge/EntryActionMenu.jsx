import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, ChevronUp, ChevronDown, Trash2, Archive, Plus, Copy, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { KNOWLEDGE_QUERY_KEYS } from "./knowledgeHelpers";

export default function EntryActionMenu({ entry, procedureId, sortedEntries, onEdit, onAddAbove, onAddBelow }) {
  const queryClient = useQueryClient();
  const idx = sortedEntries.findIndex(e => e.id === entry.id);
  const canMoveUp = idx > 0;
  const canMoveDown = idx < sortedEntries.length - 1;
  const isArchived = (entry.lifecycle_state || 'active') === 'archived';

  const invalidateEntries = () => {
    queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEYS.entries(procedureId) });
    queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEYS.allEntries });
  };

  const reorderMutation = useMutation({
    mutationFn: async ({ entryId, newIndex }) => {
      const target = sortedEntries[newIndex];
      const currentOrder = entry.order_index ?? idx;
      const targetOrder = target.order_index ?? newIndex;
      await Promise.all([
        base44.entities.ProcedureEntry.update(entryId, { order_index: targetOrder }),
        base44.entities.ProcedureEntry.update(target.id, { order_index: currentOrder }),
      ]);
    },
    onSuccess: invalidateEntries,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProcedureEntry.delete(id),
    onSuccess: () => { invalidateEntries(); toast.success("Entry removed"); },
  });

  const archiveMutation = useMutation({
    mutationFn: (id) => base44.entities.ProcedureEntry.update(id, { lifecycle_state: "archived" }),
    onSuccess: () => { invalidateEntries(); toast.success("Entry archived"); },
  });

  const restoreMutation = useMutation({
    mutationFn: (id) => base44.entities.ProcedureEntry.update(id, { lifecycle_state: "active" }),
    onSuccess: () => { invalidateEntries(); toast.success("Entry restored"); },
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const newEntry = {
        procedure_id: procedureId,
        headline: `${entry.headline} (copy)`,
        entry_type: entry.entry_type || 'step',
        content_html: entry.content_html || '',
        image_urls: entry.image_urls || [],
        reference_url: entry.reference_url || '',
        order_index: (entry.order_index ?? idx) + 0.5,
        lifecycle_state: 'active',
        part_ids: entry.part_ids || [],
        group_label: entry.group_label || '',
      };
      return base44.entities.ProcedureEntry.create(newEntry);
    },
    onSuccess: () => { invalidateEntries(); toast.success("Entry duplicated"); },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800/60 transition-colors shrink-0">
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-800 text-gray-200 min-w-[160px]">
        <DropdownMenuItem onClick={() => onEdit(entry)} className="gap-2 text-sm">
          <Pencil className="w-3.5 h-3.5" /> Edit
        </DropdownMenuItem>
        {onAddAbove && (
          <DropdownMenuItem onClick={() => onAddAbove(entry)} className="gap-2 text-sm">
            <Plus className="w-3.5 h-3.5" /> Add Above
          </DropdownMenuItem>
        )}
        {onAddBelow && (
          <DropdownMenuItem onClick={() => onAddBelow(entry)} className="gap-2 text-sm">
            <Plus className="w-3.5 h-3.5" /> Add Below
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => duplicateMutation.mutate()} className="gap-2 text-sm">
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-gray-800" />
        <DropdownMenuItem onClick={() => canMoveUp && reorderMutation.mutate({ entryId: entry.id, newIndex: idx - 1 })}
          disabled={!canMoveUp} className="gap-2 text-sm">
          <ChevronUp className="w-3.5 h-3.5" /> Move Up
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => canMoveDown && reorderMutation.mutate({ entryId: entry.id, newIndex: idx + 1 })}
          disabled={!canMoveDown} className="gap-2 text-sm">
          <ChevronDown className="w-3.5 h-3.5" /> Move Down
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-gray-800" />
        {isArchived ? (
          <DropdownMenuItem onClick={() => restoreMutation.mutate(entry.id)} className="gap-2 text-sm text-emerald-400">
            <ArchiveRestore className="w-3.5 h-3.5" /> Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => archiveMutation.mutate(entry.id)} className="gap-2 text-sm text-gray-400">
            <Archive className="w-3.5 h-3.5" /> Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => {
          if (window.confirm('Permanently delete this entry?')) deleteMutation.mutate(entry.id);
        }} className="gap-2 text-sm text-red-400">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}