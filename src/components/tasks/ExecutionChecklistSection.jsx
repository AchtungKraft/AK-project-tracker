import React, { useState, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const inputRef = useRef(null);
  const [newItemTitle, setNewItemTitle] = useState("");

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
      const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order || 0), 0);
      return base44.entities.TaskChecklistItem.create({
        task_id: taskId,
        title,
        is_complete: false,
        sort_order: maxOrder + 10,
        visibility: "internal",
      });
    },
    onSuccess: () => {
      invalidateChecklist();
      setNewItemTitle("");
      inputRef.current?.focus();
    },
  });

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

  // Empty-CTA variant: lightweight inline prompt when no items exist
  if (variant === "empty-cta" && totalCount === 0) {
    return (
      <div className="flex items-center gap-3 py-3">
        <span className="text-sm text-gray-500">No checklist yet</span>
        <Button
          size="sm"
          variant="outline"
          className="border-gray-700 text-gray-300 gap-1.5 h-8 text-xs"
          onClick={() => inputRef.current?.focus()}
        >
          <Plus className="w-3 h-3" />
          Add First Step
        </Button>
        {/* Hidden input that appears on focus */}
        <Input
          ref={inputRef}
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Step description…"
          disabled={createMutation.isPending}
          className="bg-gray-800/50 border-gray-700 text-white text-sm h-8 flex-1 max-w-[220px]"
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

      {/* Checklist rows */}
      <div className="space-y-0">
        {sortedItems.map((item) => (
          <div
            key={item.id}
            onClick={() => toggleMutation.mutate({ id: item.id, is_complete: !item.is_complete })}
            className={cn(
              "flex items-center gap-3 py-3 px-3 -mx-3 rounded cursor-pointer transition-colors",
              "hover:bg-gray-800/50 active:bg-gray-800/70",
              "min-h-[48px]"
            )}
          >
            <Checkbox
              checked={item.is_complete}
              onCheckedChange={() => {}}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 pointer-events-none"
            />
            <span className={cn(
              "text-sm leading-snug flex-1",
              item.is_complete ? "line-through text-gray-500" : "text-gray-200"
            )}>
              {item.title}
            </span>
          </div>
        ))}

        {sortedItems.length === 0 && (
          <p className="text-sm text-gray-500 py-2">No checklist items yet</p>
        )}
      </div>

      {/* Add item */}
      <div className="mt-2">
        <Input
          ref={inputRef}
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add item…"
          disabled={createMutation.isPending}
          className="bg-gray-800/50 border-gray-700 text-white text-sm h-10"
        />
      </div>
    </div>
  );
}