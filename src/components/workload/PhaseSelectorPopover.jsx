import React, { useState, useMemo, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Layers, Plus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Shared phase selector popover used in:
 * - Workload task row (inline hover control)
 * - Task Detail drawer (edit mode)
 * - Bulk action bar
 *
 * Props:
 *  task           — current task (needs .kanban_bucket_id, .project_id, .dependencies)
 *  buckets        — array of ProjectKanbanBucket for the task's project (or Map)
 *  onMove         — (bucketId: string|null) => void  — called on selection
 *  allTasks       — (optional) all tasks to check dependency warnings
 *  triggerVariant — "icon" (default, inline icon) | "select" (full-width select-style)
 *  currentLabel   — label for the current phase (used in select variant)
 */
export default function PhaseSelectorPopover({
  task,
  buckets,
  onMove,
  allTasks,
  triggerVariant = "icon",
  currentLabel,
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const sorted = useMemo(() => {
    const arr = buckets instanceof Map ? Array.from(buckets.values()) : (buckets || []);
    return [...arr].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [buckets]);

  // Dependency warning — check if moving changes cross-phase deps
  const depWarning = useMemo(() => {
    if (!task || !allTasks || allTasks.length === 0) return null;
    const deps = task.dependencies || [];
    const taskMap = new Map();
    allTasks.forEach(t => taskMap.set(t.id, t));

    const dependsOn = deps
      .map(id => taskMap.get(id))
      .filter(Boolean)
      .filter(t => t.kanban_bucket_id !== task.kanban_bucket_id);

    const successors = allTasks
      .filter(t => (t.dependencies || []).includes(task.id))
      .filter(t => t.kanban_bucket_id !== task.kanban_bucket_id);

    if (dependsOn.length === 0 && successors.length === 0) return null;
    return { dependsOn, successors };
  }, [task, allTasks]);

  const handleSelect = useCallback((bucketId) => {
    if (onMove) onMove(bucketId);
    setOpen(false);
    setCreating(false);
  }, [onMove]);

  const handleCreatePhase = useCallback(async () => {
    const name = newPhaseName.trim();
    if (!name || !task?.project_id) return;

    // Check duplicate (case-insensitive)
    const isDup = sorted.some(b => b.name.toLowerCase() === name.toLowerCase());
    if (isDup) {
      toast.error(`Phase "${name}" already exists in this project`);
      return;
    }

    setIsSubmitting(true);
    try {
      const maxOrder = sorted.reduce((max, b) => Math.max(max, b.order || 0), 0);
      const newBucket = await base44.entities.ProjectKanbanBucket.create({
        name,
        project_id: task.project_id,
        order: maxOrder + 1,
        color: "#6B7280",
      });
      queryClient.invalidateQueries({ queryKey: ["workloadBuckets"] });
      queryClient.invalidateQueries({ queryKey: ["projectBuckets", task.project_id] });
      if (onMove) onMove(newBucket.id);
      setNewPhaseName("");
      setCreating(false);
      setOpen(false);
      toast.success(`Created phase "${name}"`);
    } catch {
      toast.error("Failed to create phase");
    } finally {
      setIsSubmitting(false);
    }
  }, [newPhaseName, task, sorted, onMove, queryClient]);

  if (sorted.length === 0 && triggerVariant === "icon") return null;

  const trigger = triggerVariant === "select" ? (
    <button
      type="button"
      className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-white hover:bg-gray-700 transition-colors"
    >
      <span className="flex items-center gap-2 truncate">
        <Layers className="w-3.5 h-3.5 text-gray-400" />
        {currentLabel || "General / No Phase"}
      </span>
      <span className="text-gray-500 text-xs">▾</span>
    </button>
  ) : (
    <button className="text-gray-600 hover:text-blue-400 p-0.5 rounded" title="Move to phase">
      <Layers className="w-3 h-3" />
    </button>
  );

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCreating(false); setNewPhaseName(""); } }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-52 p-1 bg-gray-900 border-gray-700"
        side={triggerVariant === "select" ? "bottom" : "left"}
        align="start"
      >
        <p className="text-[9px] text-gray-500 uppercase tracking-wider px-2 py-1">Move to Phase</p>
        <div className="space-y-px max-h-52 overflow-y-auto">
          {sorted.map(b => (
            <button
              key={b.id}
              onClick={() => handleSelect(b.id)}
              className={cn(
                "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5",
                task?.kanban_bucket_id === b.id
                  ? "bg-blue-900/40 text-blue-300"
                  : "text-gray-300 hover:bg-gray-800"
              )}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color || "#6B7280" }} />
              {b.name}
            </button>
          ))}

          {/* General / No Phase */}
          <button
            onClick={() => handleSelect(null)}
            className={cn(
              "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5",
              !task?.kanban_bucket_id
                ? "bg-blue-900/40 text-blue-300"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            )}
          >
            <span className="w-2 h-2 rounded-full shrink-0 bg-gray-600" />
            General / No Phase
          </button>
        </div>

        {/* Separator + Create New Phase */}
        <div className="border-t border-gray-800 mt-1 pt-1">
          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="w-full text-left px-2 py-1 rounded text-xs text-green-400 hover:bg-green-900/20 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Create New Phase
            </button>
          ) : (
            <div className="px-1 py-1 space-y-1">
              <input
                autoFocus
                type="text"
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                placeholder="Phase name…"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreatePhase(); if (e.key === "Escape") { setCreating(false); setNewPhaseName(""); } }}
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCreatePhase}
                  disabled={!newPhaseName.trim() || isSubmitting}
                  className="flex-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded px-2 py-1 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? "Creating…" : "Create"}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewPhaseName(""); }}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dependency warning */}
        {depWarning && (
          <div className="border-t border-gray-800 mt-1 pt-1 px-2 pb-1">
            <div className="flex items-start gap-1.5 text-[10px] text-amber-400">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <div>
                {depWarning.dependsOn.length > 0 && (
                  <p>Depends on: {depWarning.dependsOn.map(t => t.name).join(", ")}</p>
                )}
                {depWarning.successors.length > 0 && (
                  <p>Unlocks: {depWarning.successors.map(t => t.name).join(", ")}</p>
                )}
                <p className="text-gray-500 mt-0.5">Moving will not change these relationships.</p>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}