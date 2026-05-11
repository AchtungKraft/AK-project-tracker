import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function ExecutionCompletedSection({
  completedTasks = [],
  categories = [],
  teamMembers = [],
  onToggleComplete,
  onTaskClick,
}) {
  const [expanded, setExpanded] = useState(false);

  if (completedTasks.length === 0) return null;

  const teamMap = {};
  teamMembers.forEach(tm => { teamMap[tm.id] = tm.full_name; });

  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c.name; });

  // Sort by completed_date descending (most recent first)
  const sorted = [...completedTasks].sort((a, b) => {
    const da = a.completed_date ? new Date(a.completed_date) : new Date(a.updated_date);
    const db = b.completed_date ? new Date(b.completed_date) : new Date(b.updated_date);
    return db - da;
  });

  return (
    <div className="mt-6 border-t border-gray-700/50 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-2"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        <span>Completed Tasks</span>
        <span className="text-gray-600">({completedTasks.length})</span>
      </button>

      {expanded && (
        <div className="ml-2 space-y-0">
          {sorted.map(task => (
            <div key={task.id} className="flex items-center gap-2 py-[3px] border-b border-white/5">
              <span onClick={e => e.stopPropagation()} className="shrink-0">
                <Checkbox
                  checked={true}
                  onCheckedChange={() => onToggleComplete(task)}
                  className="h-4 w-4 border-2 border-green-700 rounded-sm data-[state=checked]:bg-green-700 data-[state=checked]:border-green-700"
                />
              </span>

              <button
                onClick={() => onTaskClick(task)}
                className="flex-1 min-w-0 text-sm text-gray-500 line-through text-left truncate"
              >
                {task.name}
              </button>

              <span className="text-[10px] text-gray-600 shrink-0 hidden md:block">
                {catMap[task.category_id] || ""}
              </span>

              <span className="text-xs text-gray-600 shrink-0 w-20 text-right truncate hidden md:block">
                {teamMap[task.assigned_team_member_id] || "—"}
              </span>

              <span className="text-[10px] text-gray-600 shrink-0 w-16 text-right">
                {task.completed_date
                  ? format(new Date(task.completed_date), 'M/d')
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}