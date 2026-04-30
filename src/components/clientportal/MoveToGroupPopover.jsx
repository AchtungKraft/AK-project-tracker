import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, FolderOpen, Check, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function MoveToGroupPopover({
  task,
  groups = [],
  requestId,
  queryKey,
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(null); // group id being moved to
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const currentGroupId = task.group_id || null;
  const sortedGroups = [...groups].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const handleMove = async (targetGroupId) => {
    if (targetGroupId === currentGroupId) return;
    setMoving(targetGroupId);

    // Optimistic update
    queryClient.setQueryData(queryKey, (old) => {
      if (!old) return old;
      // Try to patch the task in-place within the cached data
      if (old.todoTasks) {
        return {
          ...old,
          todoTasks: old.todoTasks.map((t) =>
            t.id === task.id ? { ...t, group_id: targetGroupId } : t
          ),
        };
      }
      return old;
    });

    setOpen(false);
    // Same mutation as drag-and-drop: update group_id on ToDoListTask
    await base44.entities.ToDoListTask.update(task.id, { group_id: targetGroupId });
    queryClient.invalidateQueries({ queryKey });
    setMoving(null);
  };

  const handleCreateAndMove = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const maxOrder = groups.reduce((max, g) => Math.max(max, g.sort_order || 0), 0);
    const newGroup = await base44.entities.TaskGroup.create({
      request_id: requestId,
      name,
      sort_order: maxOrder + 1,
    });
    // Move task to new group
    await base44.entities.ToDoListTask.update(task.id, { group_id: newGroup.id });
    setCreating(false);
    setNewName("");
    setShowCreate(false);
    setOpen(false);
    queryClient.invalidateQueries({ queryKey });
    toast.success(`Moved to "${name}"`);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setShowCreate(false); setNewName(""); } }}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 text-gray-500 hover:text-white"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-[220px] p-0 bg-gray-900 border-gray-700"
      >
        <div className="px-3 py-2 border-b border-gray-800">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <FolderOpen className="w-3 h-3" />
            Move to Group
          </p>
        </div>

        <div className="py-1 max-h-[240px] overflow-y-auto">
          {/* Ungrouped option */}
          <button
            onClick={() => handleMove(null)}
            disabled={currentGroupId === null}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors",
              currentGroupId === null
                ? "text-gray-500 cursor-default bg-gray-800/40"
                : "text-gray-200 hover:bg-gray-800 cursor-pointer"
            )}
          >
            <span className="flex-1 truncate">Ungrouped</span>
            {currentGroupId === null && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
          </button>

          {/* Group options */}
          {sortedGroups.map((g) => {
            const isCurrent = currentGroupId === g.id;
            const isMoving = moving === g.id;
            return (
              <button
                key={g.id}
                onClick={() => handleMove(g.id)}
                disabled={isCurrent}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors",
                  isCurrent
                    ? "text-gray-500 cursor-default bg-gray-800/40"
                    : "text-gray-200 hover:bg-gray-800 cursor-pointer"
                )}
              >
                <span className="flex-1 truncate">{g.name}</span>
                {isCurrent && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                {isMoving && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Divider + Create new */}
        <div className="border-t border-gray-800">
          {showCreate ? (
            <div className="p-2 flex items-center gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateAndMove()}
                placeholder="Group name..."
                autoFocus
                className="h-7 bg-gray-800 border-gray-700 text-white text-xs flex-1"
              />
              <Button
                size="sm"
                onClick={handleCreateAndMove}
                disabled={!newName.trim() || creating}
                className="h-7 bg-blue-600 hover:bg-blue-700 text-xs px-2"
              >
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Go"}
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Group</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}