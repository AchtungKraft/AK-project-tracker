import React, { useState, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListChecks, ChevronDown, ChevronRight, Trash2, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { getNextSortOrder, updateChecklistOrder } from "./checklistHelpers";

export default function TaskChecklistSection({ taskId }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const inputRef = useRef(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [manualCollapse, setManualCollapse] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['taskChecklistItems', 'task', taskId],
    queryFn: () => base44.entities.TaskChecklistItem.filter({ task_id: taskId }),
    enabled: !!taskId,
    staleTime: 30000,
  });

  const completedCount = items.filter(i => i.is_complete).length;
  const totalCount = items.length;

  // Auto-collapse when > 5 items, but allow manual override
  const isCollapsed = manualCollapse !== null
    ? manualCollapse
    : totalCount > 5;

  const sortedItems = useMemo(() => {
    const incomplete = items.filter(i => !i.is_complete).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const complete = items.filter(i => i.is_complete).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return [...incomplete, ...complete];
  }, [items]);

  // Invalidate entire taskChecklistItems tree — covers task, shop, and print scopes
  const invalidateChecklist = () => {
    queryClient.invalidateQueries({ queryKey: ['taskChecklistItems'] });
  };

  const [isReordering, setIsReordering] = useState(false);

  const createMutation = useMutation({
    mutationFn: (title) => {
      return base44.entities.TaskChecklistItem.create({
        task_id: taskId,
        title,
        is_complete: false,
        completed_at: null,
        sort_order: getNextSortOrder(items),
        visibility: "internal",
      });
    },
    onSuccess: () => {
      invalidateChecklist();
      setNewItemTitle("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_complete }) => base44.entities.TaskChecklistItem.update(id, {
      is_complete,
      completed_at: is_complete ? new Date().toISOString() : null,
    }),
    onSuccess: invalidateChecklist,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TaskChecklistItem.delete(id),
    onSuccess: invalidateChecklist,
  });

  const handleAddItem = () => {
    const trimmed = newItemTitle.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddItem();
    }
  };

  // Reorder: swap item with neighbor within incomplete list only
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

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        type="button"
        onClick={() => setManualCollapse(!isCollapsed)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {isCollapsed
          ? <ChevronRight className="w-4 h-4 text-gray-500" />
          : <ChevronDown className="w-4 h-4 text-gray-500" />
        }
        <ListChecks className="w-5 h-5 text-gray-400" />
        <h3 className="text-lg font-semibold text-white">Checklist</h3>
        {totalCount > 0 && (
          <Badge
            variant="outline"
            className={cn(
              "text-xs ml-1",
              completedCount === totalCount
                ? "border-green-600 text-green-400"
                : "border-gray-600 text-gray-300"
            )}
          >
            {completedCount} / {totalCount}
          </Badge>
        )}
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="space-y-1 pl-2">
          {isLoading ? (
            <div className="flex items-center gap-2 py-3 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : sortedItems.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">No checklist items yet</p>
          ) : (
            sortedItems.map((item) => {
              const incIdx = incompleteItems.findIndex(i => i.id === item.id);
              const isFirst = incIdx === 0;
              const isLast = incIdx === incompleteItems.length - 1;
              const showReorder = !item.is_complete && incompleteItems.length > 1;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-gray-800/50 transition-colors",
                    isMobile ? "min-h-[44px]" : ""
                  )}
                >
                  <Checkbox
                    checked={item.is_complete}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: item.id, is_complete: !!checked })
                    }
                    className="shrink-0"
                  />
                  <span
                    className={cn(
                      "flex-1 text-sm break-words",
                      item.is_complete
                        ? "line-through text-gray-500"
                        : "text-gray-200"
                    )}
                  >
                    {item.title}
                  </span>
                  {/* Reorder controls — only for incomplete items */}
                  {showReorder && (
                    <div className={cn(
                      "flex items-center gap-0.5 shrink-0",
                      isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      "transition-opacity"
                    )}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isFirst || isReordering}
                        onClick={() => handleMove(item.id, 'up')}
                        className="h-6 w-6 text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isLast || isReordering}
                        onClick={() => handleMove(item.id, 'down')}
                        className="h-6 w-6 text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(item.id)}
                    className={cn(
                      "shrink-0 h-7 w-7 text-gray-500 hover:text-red-400 hover:bg-red-950/30",
                      isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      "transition-opacity"
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })
          )}

          {/* Add item input */}
          <div className="flex items-center gap-2 pt-1">
            <Input
              ref={inputRef}
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add checklist item..."
              disabled={createMutation.isPending}
              className={cn(
                "bg-gray-800/50 border-gray-700 text-white text-sm h-9",
                isMobile ? "h-11" : ""
              )}
            />
            {createMutation.isPending && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}