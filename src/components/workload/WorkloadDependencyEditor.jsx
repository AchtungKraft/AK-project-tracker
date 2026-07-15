import React, { useState, useMemo, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link2, Search, X, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

function detectCycle(taskId, newDepId, allTasks) {
  const taskMap = new Map();
  allTasks.forEach(t => taskMap.set(t.id, t));
  const visited = new Set();
  const stack = [newDepId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const t = taskMap.get(current);
    if (t?.dependencies) t.dependencies.forEach(d => stack.push(d));
  }
  return false;
}

export default function WorkloadDependencyEditor({
  task,
  projectTasks = [],
  allTasks = [],
  bucketMap = new Map(),
  teamMemberMap = new Map(),
  updateTaskMutation,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);

  const currentDeps = task.dependencies || [];

  const successors = useMemo(() => {
    return projectTasks.filter(t => 
      t.id !== task.id && 
      t.dependencies?.includes(task.id)
    );
  }, [projectTasks, task.id]);

  const filteredCandidates = useMemo(() => {
    const q = search.toLowerCase();
    return projectTasks
      .filter(t => {
        if (t.id === task.id) return false;
        if (!q) return true;
        const bucket = bucketMap.get(t.kanban_bucket_id);
        const assignee = teamMemberMap.get(t.assigned_team_member_id);
        return (
          t.name.toLowerCase().includes(q) ||
          (bucket?.name || "").toLowerCase().includes(q) ||
          (assignee?.full_name || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [projectTasks, task.id, search, bucketMap, teamMemberMap]);

  const toggleDep = useCallback((depId) => {
    setError(null);
    const isAdding = !currentDeps.includes(depId);
    
    if (isAdding) {
      if (detectCycle(task.id, depId, allTasks)) {
        setError("Cannot add — would create a circular dependency.");
        return;
      }
    }

    const newDeps = isAdding
      ? [...currentDeps, depId]
      : currentDeps.filter(id => id !== depId);

    updateTaskMutation.mutate({ id: task.id, data: { dependencies: newDeps } });
  }, [currentDeps, task.id, allTasks, updateTaskMutation]);

  const depCount = currentDeps.length;
  const successorCount = successors.length;
  const hasRelationships = depCount > 0 || successorCount > 0;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); setSearch(""); setError(null); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "shrink-0 p-0.5 rounded transition-colors",
            hasRelationships
              ? "text-blue-400 hover:text-blue-300"
              : "text-gray-700 hover:text-blue-400 opacity-0 group-hover/row:opacity-100"
          )}
          title={hasRelationships ? `${depCount} predecessor${depCount !== 1 ? 's' : ''}, ${successorCount} successor${successorCount !== 1 ? 's' : ''}` : "Manage dependencies"}
        >
          <Link2 className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-gray-900 border-gray-700" side="left" align="start">
        <div className="p-2 border-b border-gray-800">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Dependencies — {task.name}</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="h-7 pl-6 text-xs bg-gray-800 border-gray-700 text-white"
              autoFocus
            />
          </div>
        </div>

        {error && (
          <div className="px-2 py-1.5 bg-red-950/40 border-b border-red-900/50 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
            <span className="text-[10px] text-red-300">{error}</span>
          </div>
        )}

        {/* Predecessors section */}
        <div className="max-h-48 overflow-y-auto">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider px-2 pt-2 pb-1">
            Must finish before this task ({currentDeps.length})
          </p>
          {filteredCandidates.map(t => {
            const isSelected = currentDeps.includes(t.id);
            const isDone = t.status_id === DONE_STATUS_ID;
            const bucket = bucketMap.get(t.kanban_bucket_id);
            return (
              <button
                key={t.id}
                onClick={() => toggleDep(t.id)}
                className={cn(
                  "w-full text-left px-2 py-1 flex items-center gap-1.5 hover:bg-gray-800 transition-colors",
                  isSelected && "bg-blue-950/30"
                )}
              >
                <Checkbox
                  checked={isSelected}
                  className="h-3 w-3 border-gray-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 pointer-events-none"
                />
                <div className="flex-1 min-w-0">
                  <span className={cn("text-xs truncate block", isDone ? "text-green-400 line-through" : "text-gray-200")}>
                    {t.name}
                  </span>
                  <span className="text-[9px] text-gray-600 truncate block">
                    {bucket?.name || "No phase"}{teamMemberMap.get(t.assigned_team_member_id) ? ` · ${teamMemberMap.get(t.assigned_team_member_id).full_name.split(" ")[0]}` : ""}
                  </span>
                </div>
                {isDone && <Check className="w-3 h-3 text-green-500 shrink-0" />}
              </button>
            );
          })}
          {filteredCandidates.length === 0 && (
            <p className="text-[10px] text-gray-600 text-center py-2">No matching tasks</p>
          )}
        </div>

        {/* Successors section (read-only) */}
        {successors.length > 0 && (
          <div className="border-t border-gray-800">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider px-2 pt-2 pb-1">
              This task unlocks ({successors.length})
            </p>
            {successors.map(t => (
              <div key={t.id} className="px-2 py-1 flex items-center gap-1.5">
                <span className="text-[9px] text-gray-500">→</span>
                <span className="text-xs text-gray-400 truncate">{t.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-800 px-2 py-1.5">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="w-full h-6 text-xs text-gray-400 hover:text-white">
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}