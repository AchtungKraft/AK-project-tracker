import React, { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function ExecutionCompletedSection({
  completedTasks = [],
  categories = [],
  teamMembers = [],
  buckets = [],
  onToggleComplete,
  onTaskClick,
}) {
  const [expanded, setExpanded] = useState(false);

  const teamMap = useMemo(() => {
    const m = {};
    teamMembers.forEach(tm => { m[tm.id] = tm.full_name; });
    return m;
  }, [teamMembers]);

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [categories]);

  const bucketMap = useMemo(() => {
    const m = {};
    buckets.forEach(b => { m[b.id] = b; });
    return m;
  }, [buckets]);

  // Group tasks by bucket, sorted by bucket order, tasks sorted by completed_date desc
  const groupedByBucket = useMemo(() => {
    const groups = {};
    completedTasks.forEach(task => {
      const bucketId = task.kanban_bucket_id || '__none__';
      if (!groups[bucketId]) groups[bucketId] = [];
      groups[bucketId].push(task);
    });

    // Sort tasks within each group by completed_date descending
    Object.values(groups).forEach(arr => {
      arr.sort((a, b) => {
        const da = a.completed_date ? new Date(a.completed_date) : new Date(a.updated_date);
        const db = b.completed_date ? new Date(b.completed_date) : new Date(b.updated_date);
        return db - da;
      });
    });

    // Build ordered array of { bucket, tasks }
    const ordered = Object.entries(groups)
      .map(([bucketId, tasks]) => ({
        bucketId,
        bucket: bucketId !== '__none__' ? bucketMap[bucketId] : null,
        tasks,
      }))
      .sort((a, b) => {
        // Buckets with data sort by bucket order, no-bucket goes last
        if (!a.bucket && !b.bucket) return 0;
        if (!a.bucket) return 1;
        if (!b.bucket) return -1;
        return (a.bucket.order || 0) - (b.bucket.order || 0);
      });

    return ordered;
  }, [completedTasks, bucketMap]);

  if (completedTasks.length === 0) return null;

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
        <div className="ml-2 space-y-4">
          {groupedByBucket.map(({ bucketId, bucket, tasks }) => (
            <div key={bucketId}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-white/10 pb-1 mb-1 flex items-center gap-2">
                {bucket && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: bucket.color || '#6B7280' }}
                  />
                )}
                {bucket ? bucket.name : 'No Bucket'}
                <span className="text-gray-600 font-normal">({tasks.length})</span>
              </h3>

              <div className="space-y-0">
                {tasks.map(task => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}