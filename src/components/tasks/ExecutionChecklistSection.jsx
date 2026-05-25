import React, { useState, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { getNextSortOrder, updateChecklistOrder } from "./checklistHelpers";
import BulkChecklistImportModal from "./BulkChecklistImportModal";

/**
 * Execution-first checklist: checkbox + label only.
 * No reorder arrows, no delete icons, no collapse toggle.
 * Entire row is clickable. Optimistic-feel toggling.
 *
 * variant="full" (default) — shows section header + progress bar + items + add input
 * variant="empty-cta" — shows only the "Add First Step" CTA (no header, no divider)
 */
export default function ExecutionChecklistSection({ taskId, variant = "full" }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const inputRef = useRef(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [isReordering, setIsReordering] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['taskChecklistItems', 'task', taskId],
    queryFn: () => base44.entities.TaskChecklistItem.filter({ task_id: taskId }),
    enabled: !!taskId,
    staleTime: 30000,
  });

  const sortedItems = useMemo(() => {
    const incomplete = items.filter(i => !i.is_complete).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const complete = items.filter(i => i.is_complete).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return [...incomplete, ...complete];
  }, [items]);

  const completedCount = items.filter(i => i.is_complete).length;
  const totalCount = items.length;

  const invalidateChecklist = () => {
    queryClient.invalidateQueries({ queryKey: ['taskChecklistItems'] });
    queryClient.invalidateQueries({ queryKey: ['executionChecklist'] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_complete }) => base44.entities.TaskChecklistItem.update(id, {
      is_complete,
      completed_at: is_complete ? new Date().toISOString() : null,
    }),
    onSuccess: invalidateChecklist,
  });

  const createMutation = useMutation({
    mutationFn: (title) => {
      return base44.entities.TaskChecklistItem.create({
        task_id: taskId,
        title,
        is_complete: false,
        sort_order: getNextSortOrder(items),
        visibility: "internal",
      });
    },
    onSuccess: () => {
      invalidateChecklist();
      setNewItemTitle("");
      inputRef.current?.focus();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TaskChecklistItem.delete(id),
    onSuccess: invalidateChecklist,
  });

  const updateTitleMutation = useMutation({
    mutationFn: ({ id, title }) => base44.entities.TaskChecklistItem.update(id, { title }),
    onSuccess: invalidateChecklist,
  });

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditingText(item.title);
  };

  const saveEdit = (itemId) => {
    const trimmed = editingText.trim();
    setEditingId(null);
    if (!trimmed) {
      deleteMutation.mutate(itemId);
    } else {
      const original = items.find(i => i.id === itemId);
      if (original && trimmed !== original.title) {
        updateTitleMutation.mutate({ id: itemId, title: trimmed });
      }
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const incompleteItems = useMemo(
    () => items.filter(i => !i.is_complete).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [items]
  );

  const handleMove = async (itemId, direction) => {
    const idx = incompleteItems.findIndex(i => i.id === itemId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= incompleteItems.length) return;
    setIsReordering(true);
    const newOrder = [...incompleteItems.map(i => i.id)];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    await updateChecklistOrder(taskId, newOrder, items);
    invalidateChecklist();
    setIsReordering(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = newItemTitle.trim();
      if (trimmed) createMutation.mutate(trimmed);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading checklist...
      </div>
    );
  }

  // Empty-CTA variant: action-first prompt when no items exist
  if (variant === "empty-cta" && totalCount === 0) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Button
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white gap-1.5 h-9 text-xs font-medium"
          onClick={() => inputRef.current?.focus()}
        >
          <Plus className="w-3.5 h-3.5" />
          Start Checklist
        </Button>
        <Input
          ref={inputRef}
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="First step…"
          disabled={createMutation.isPending}
          className="bg-gray-800/50 border-gray-700 text-white text-sm h-9 flex-1 max-w-[220px]"
        />
      </div>
    );
  }

  return (
    <div>
      {/* Progress line */}
      {totalCount > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <span className={cn(
            "text-xs font-medium",
            completedCount === totalCount ? "text-green-400" : "text-gray-400"
          )}>
            {completedCount} / {totalCount}
          </span>
          <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                completedCount === totalCount ? "bg-green-600" : "bg-red-600"
              )}
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Checklist rows — checkbox toggles, text clicks to edit */}
      <div className="space-y-0">
        {sortedItems.map((item) => {
          const incIdx = incompleteItems.findIndex(i => i.id === item.id);
          const isFirst = incIdx === 0;
          const isLast = incIdx === incompleteItems.length - 1;
          const showReorder = !item.is_complete && incompleteItems.length > 1;

          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 py-2 px-3 -mx-3 rounded transition-colors group/cl",
                "hover:bg-gray-800/50",
                "min-h-[40px]"
              )}
            >
              <Checkbox
                checked={item.is_complete}
                onCheckedChange={(checked) =>
                  toggleMutation.mutate({ id: item.id, is_complete: !!checked })
                }
                className="shrink-0"
              />
              {editingId === item.id ? (
                <Input
                  autoFocus
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onBlur={() => saveEdit(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveEdit(item.id); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                  }}
                  className="flex-1 bg-gray-800/50 border-gray-700 text-white text-sm h-7 py-0"
                />
              ) : (
                <span
                  onClick={() => !item.is_complete && startEdit(item)}
                  className={cn(
                    "text-sm leading-snug flex-1",
                    item.is_complete
                      ? "line-through text-gray-500"
                      : "text-gray-200 cursor-pointer hover:text-white"
                  )}
                >
                  {item.title}
                </span>
              )}
              {/* Hover actions: edit, reorder, delete */}
              {editingId !== item.id && (
                <div className={cn(
                  "flex items-center gap-0.5 shrink-0",
                  isMobile ? "opacity-100" : "opacity-0 group-hover/cl:opacity-100",
                  "transition-opacity"
                )}>
                  {!item.is_complete && (
                    <Button type="button" variant="ghost" size="icon"
                      onClick={() => startEdit(item)}
                      className="h-6 w-6 text-gray-500 hover:text-white hover:bg-gray-700">
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                  {showReorder && (
                    <>
                      <Button type="button" variant="ghost" size="icon"
                        disabled={isFirst || isReordering}
                        onClick={() => handleMove(item.id, 'up')}
                        className="h-6 w-6 text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30">
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon"
                        disabled={isLast || isReordering}
                        onClick={() => handleMove(item.id, 'down')}
                        className="h-6 w-6 text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30">
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                  <Button type="button" variant="ghost" size="icon"
                    onClick={() => deleteMutation.mutate(item.id)}
                    className="h-6 w-6 text-gray-500 hover:text-red-400 hover:bg-red-950/30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {sortedItems.length === 0 && (
          <p className="text-sm text-gray-500 py-2">No checklist items yet</p>
        )}
      </div>

      {/* Add item + Paste List */}
      <div className="mt-2 flex items-center gap-2">
        <Input
          ref={inputRef}
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add item…"
          disabled={createMutation.isPending}
          className="bg-gray-800/50 border-gray-700 text-white text-sm h-10 flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setBulkOpen(true)}
          className="h-10 px-2.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 gap-1 shrink-0"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Paste List</span>
        </Button>
      </div>

      <BulkChecklistImportModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        isImporting={bulkImporting}
        onImport={async (parsedItems) => {
          setBulkImporting(true);
          const startOrder = getNextSortOrder(items);
          const records = parsedItems.map((item, idx) => ({
            task_id: taskId,
            title: item.label,
            is_complete: item.completed,
            completed_at: item.completed ? new Date().toISOString() : null,
            sort_order: startOrder + (idx + 1) * 10,
            visibility: "internal",
          }));
          await base44.entities.TaskChecklistItem.bulkCreate(records);
          invalidateChecklist();
          setBulkImporting(false);
          setBulkOpen(false);
        }}
      />
    </div>
  );
}