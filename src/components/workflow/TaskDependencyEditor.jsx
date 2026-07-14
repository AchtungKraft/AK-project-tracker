import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, Search, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TaskDependencyEditor({ taskId, projectId, dependencies = [], allTasks = [], onChange }) {
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const availableTasks = useMemo(() =>
    allTasks.filter(t =>
      t.id !== taskId && t.project_id === projectId &&
      !dependencies.includes(t.id) &&
      t.name.toLowerCase().includes(search.toLowerCase())
    ), [allTasks, taskId, projectId, dependencies, search]);

  const selectedTasks = useMemo(() =>
    dependencies.map(id => allTasks.find(t => t.id === id)).filter(Boolean),
    [dependencies, allTasks]);

  const successorTasks = useMemo(() =>
    allTasks.filter(t => t.id !== taskId && t.dependencies?.includes(taskId)),
    [allTasks, taskId]);

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
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">
          Must Complete Before This Task
        </label>
        {selectedTasks.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No dependencies</p>
        ) : (
          <div className="space-y-1">
            {selectedTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-gray-800/50 rounded px-2 py-1.5">
                <ArrowRight className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="text-sm text-white flex-1 truncate">{t.name}</span>
                <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-400">
                  {t.operational_state === 'COMPLETED' || t.completed_date ? '✓ Done' : 'Pending'}
                </Badge>
                <button onClick={() => onChange(dependencies.filter(id => id !== t.id))} className="text-gray-500 hover:text-red-400 p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showPicker ? (
          <div className="mt-2 border border-gray-700 rounded-lg bg-gray-900 p-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..."
                className="pl-7 h-8 text-sm bg-gray-800 border-gray-700 text-white" autoFocus />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {availableTasks.slice(0, 20).map(t => {
                const cyclic = wouldCreateCycle(t.id);
                return (
                  <button key={t.id} disabled={cyclic}
                    onClick={() => { onChange([...dependencies, t.id]); setSearch(""); }}
                    className={cn("w-full text-left px-2 py-1.5 rounded text-sm",
                      cyclic ? "text-red-400 opacity-50 cursor-not-allowed" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    )}>
                    <span className="flex items-center gap-2">
                      {t.name}
                      {cyclic && <AlertTriangle className="w-3 h-3 text-red-400" />}
                    </span>
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

      {successorTasks.length > 0 && (
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 block">
            Tasks That Depend on This Task
          </label>
          <div className="space-y-1">
            {successorTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-gray-800/30 rounded px-2 py-1.5">
                <ArrowRight className="w-3 h-3 text-amber-500/50 shrink-0" />
                <span className="text-sm text-gray-400 flex-1 truncate">{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}