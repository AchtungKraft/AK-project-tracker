import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, Search, ArrowRight, ArrowDown, AlertTriangle, CheckCircle2, Circle, User, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStateConfig } from "./useProjectWorkflow";

function DepStateIndicator({ task }) {
  const isDone = task.operational_state === 'COMPLETED' || !!task.completed_date;
  if (isDone) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  return <Circle className="w-3.5 h-3.5 text-gray-600 shrink-0" />;
}

function DepRow({ task, buckets, teamMembers, onRemove }) {
  const bucket = buckets?.find(b => b.id === task.kanban_bucket_id);
  const assignee = teamMembers?.find(m => m.id === task.assigned_team_member_id);
  const stateConfig = task.operational_state ? getStateConfig(task.operational_state) : null;
  const isDone = task.operational_state === 'COMPLETED' || !!task.completed_date;
  const isBlocked = ['BLOCKED', 'WAITING_ON_PARTS', 'WAITING_ON_VENDOR', 'WAITING_ON_CUSTOMER'].includes(task.operational_state);

  return (
    <div className={cn(
      "flex items-start gap-2 rounded-md px-2.5 py-2 border",
      isDone ? "bg-emerald-950/10 border-emerald-900/30" :
      isBlocked ? "bg-red-950/10 border-red-900/20" :
      "bg-gray-800/40 border-gray-800"
    )}>
      <DepStateIndicator task={task} />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white leading-tight block truncate">{task.name}</span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          {bucket && (
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: bucket.color || '#3B82F6' }} />
              {bucket.name}
            </span>
          )}
          {stateConfig && !isDone && (
            <span className={cn("text-[10px] font-medium", stateConfig.textClass)}>
              {stateConfig.label}
            </span>
          )}
          {assignee && (
            <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
              <User className="w-2.5 h-2.5" />
              {assignee.full_name}
            </span>
          )}
          {isBlocked && task.blocking_reasons?.[0] && (
            <span className="text-[10px] text-red-400 flex items-center gap-0.5">
              <Ban className="w-2.5 h-2.5" />
              {task.blocking_reasons[0].label?.replace('Blocked by: ', '').replace('Waiting for: ', '')}
            </span>
          )}
        </div>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="text-gray-600 hover:text-red-400 p-0.5 mt-0.5 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function SuccessorRow({ task, buckets, teamMembers }) {
  return <DepRow task={task} buckets={buckets} teamMembers={teamMembers} />;
}

export default function TaskDependencyEditor({
  taskId, projectId, dependencies = [], allTasks = [],
  buckets = [], teamMembers = [],
  onChange,
}) {
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const availableTasks = useMemo(() =>
    allTasks.filter(t => {
      if (t.id === taskId || t.project_id !== projectId || dependencies.includes(t.id)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const bucket = buckets?.find(b => b.id === t.kanban_bucket_id);
      const assignee = teamMembers?.find(m => m.id === t.assigned_team_member_id);
      return (
        t.name.toLowerCase().includes(q) ||
        (bucket?.name || '').toLowerCase().includes(q) ||
        (assignee?.full_name || '').toLowerCase().includes(q)
      );
    }), [allTasks, taskId, projectId, dependencies, search, buckets, teamMembers]);

  const selectedTasks = useMemo(() =>
    dependencies.map(id => allTasks.find(t => t.id === id)).filter(Boolean),
    [dependencies, allTasks]);

  // Immediate successors
  const successorTasks = useMemo(() =>
    allTasks.filter(t => t.id !== taskId && t.dependencies?.includes(taskId)),
    [allTasks, taskId]);

  // Deep downstream count
  const downstreamCount = useMemo(() => {
    if (!taskId || !allTasks.length) return 0;
    const visited = new Set();
    const queue = [taskId];
    while (queue.length) {
      const cur = queue.shift();
      for (const t of allTasks) {
        if (t.dependencies?.includes(cur) && !visited.has(t.id)) {
          visited.add(t.id);
          queue.push(t.id);
        }
      }
    }
    return visited.size;
  }, [allTasks, taskId]);

  // Downstream tasks (all, not just immediate)
  const downstreamTasks = useMemo(() => {
    if (!taskId || !allTasks.length) return [];
    const visited = new Set();
    const queue = [taskId];
    while (queue.length) {
      const cur = queue.shift();
      for (const t of allTasks) {
        if (t.dependencies?.includes(cur) && !visited.has(t.id)) {
          visited.add(t.id);
          queue.push(t.id);
        }
      }
    }
    return allTasks.filter(t => visited.has(t.id));
  }, [allTasks, taskId]);

  const wouldCreateCycle = (depId) => {
    const visited = new Set();
    const stack = [depId];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === taskId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const t = allTasks.find(t => t.id === cur);
      if (t?.dependencies) stack.push(...t.dependencies);
    }
    return false;
  };

  return (
    <div className="space-y-4">
      {/* ── Predecessors (editable) ── */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">
          Must Complete Before This Task
        </label>
        {selectedTasks.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No dependencies</p>
        ) : (
          <div className="space-y-1">
            {selectedTasks.map(t => (
              <DepRow
                key={t.id}
                task={t}
                buckets={buckets}
                teamMembers={teamMembers}
                onRemove={() => onChange(dependencies.filter(id => id !== t.id))}
              />
            ))}
          </div>
        )}

        {showPicker ? (
          <div className="mt-2 border border-gray-700 rounded-lg bg-gray-900 p-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by task, phase, or technician..."
                className="pl-7 h-8 text-sm bg-gray-800 border-gray-700 text-white" autoFocus />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {availableTasks.slice(0, 25).map(t => {
                const cyclic = wouldCreateCycle(t.id);
                const bucket = buckets?.find(b => b.id === t.kanban_bucket_id);
                const assignee = teamMembers?.find(m => m.id === t.assigned_team_member_id);
                return (
                  <button key={t.id} disabled={cyclic}
                    onClick={() => { onChange([...dependencies, t.id]); setSearch(""); }}
                    className={cn("w-full text-left px-2 py-1.5 rounded text-sm",
                      cyclic ? "text-red-400 opacity-50 cursor-not-allowed" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    )}>
                    <div className="flex items-center gap-2">
                      {cyclic ? <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" /> : <Circle className="w-3 h-3 text-gray-600 shrink-0" />}
                      <span className="truncate flex-1">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-5 mt-0.5">
                      {bucket && (
                        <span className="text-[9px] text-gray-500 flex items-center gap-0.5">
                          <span className="w-1 h-1 rounded-full" style={{ backgroundColor: bucket.color || '#3B82F6' }} />
                          {bucket.name}
                        </span>
                      )}
                      {assignee && <span className="text-[9px] text-gray-500">{assignee.full_name}</span>}
                      {cyclic && <span className="text-[9px] text-red-400">Creates cycle</span>}
                    </div>
                  </button>
                );
              })}
              {availableTasks.length === 0 && <p className="text-xs text-gray-600 py-2 text-center">No matching tasks</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setShowPicker(false); setSearch(""); }} className="w-full h-7 text-xs text-gray-400">Close</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowPicker(true)} className="mt-2 h-7 text-xs border-gray-700 text-gray-400">+ Add Dependency</Button>
        )}
      </div>

      {/* ── Successors (read-only, derived) ── */}
      {successorTasks.length > 0 && (
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">
            This Task Blocks
          </label>
          <div className="space-y-1">
            {successorTasks.map(t => (
              <SuccessorRow key={t.id} task={t} buckets={buckets} teamMembers={teamMembers} />
            ))}
          </div>
          {downstreamCount > successorTasks.length && (
            <p className="text-[10px] text-amber-500/80 mt-1.5 flex items-center gap-1">
              <ArrowDown className="w-3 h-3" />
              Blocks {downstreamCount} downstream task{downstreamCount !== 1 ? 's' : ''} total
            </p>
          )}
        </div>
      )}
    </div>
  );
}