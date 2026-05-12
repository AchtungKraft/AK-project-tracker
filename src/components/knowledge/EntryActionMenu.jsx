import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, ChevronUp, ChevronDown, Trash2, Archive } from "lucide-react";
import { toast } from "sonner";

export default function EntryActionMenu({ entry, procedureId, sortedEntries, onEdit }) {
  const queryClient = useQueryClient();
  const idx = sortedEntries.findIndex(e => e.id === entry.id);
  const canMoveUp = idx > 0;
  const canMoveDown = idx < sortedEntries.length - 1;

  const reorderMutation = useMutation({
    mutationFn: async ({ entryId, newIndex }) => {
      // Swap order_index with adjacent entry
      const target = sortedEntries[newIndex];
      const currentOrder = entry.order_index ?? idx;
      const targetOrder = target.order_index ?? newIndex;
      await Promise.all([
        base44.entities.ProcedureEntry.update(entryId, { order_index: targetOrder }),
        base44.entities.ProcedureEntry.update(target.id, { order_index: currentOrder }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedureEntries', procedureId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProcedureEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedureEntries', procedureId] });
      toast.success("Entry removed");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id) => base44.entities.ProcedureEntry.update(id, { lifecycle_state: "archived" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedureEntries', procedureId] });
      toast.success("Entry archived");
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800/60 transition-colors shrink-0">
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-800 text-gray-200 min-w-[140px]">
        <DropdownMenuItem onClick={() => onEdit(entry)} className="gap-2 text-sm">
          <Pencil className="w-3.5 h-3.5" /> Edit
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
        <DropdownMenuItem onClick={() => archiveMutation.mutate(entry.id)} className="gap-2 text-sm text-gray-400">
          <Archive className="w-3.5 h-3.5" /> Archive
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => deleteMutation.mutate(entry.id)} className="gap-2 text-sm text-red-400">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}