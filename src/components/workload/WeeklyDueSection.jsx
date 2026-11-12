import React, { useMemo } from "react";
import { summarizeWeek, sortByDue } from "@/lib/weeklyDueGrouping";
import { groupByPhase } from "@/components/workload/workPacketShared";
import { formatDuration } from "@/lib/estimateUtils";

function Chip({ children, tone = "gray" }) {
  const tones = {
    gray: "text-gray-300 bg-gray-800/80 border-gray-700",
    amber: "text-amber-300 bg-amber-950/40 border-amber-800/60",
    red: "text-red-300 bg-red-950/50 border-red-800/60",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${tones[tone]}`}>{children}</span>;
}

export default function WeeklyDueSection({ title, tasks, buckets, renderTaskRow }) {
  const summary = useMemo(() => summarizeWeek(tasks), [tasks]);
  const phases = useMemo(() => {
    const { groups, unphased } = groupByPhase(tasks, buckets);
    const list = groups.map(g => ({ key: g.bucket.id, name: g.bucket.name, color: g.bucket.color, tasks: sortByDue(g.tasks) }));
    if (unphased.length > 0) list.push({ key: "__unphased__", name: "General / No Phase", color: "#6B7280", tasks: sortByDue(unphased) });
    return list;
  }, [tasks, buckets]);

  return (
    <section className="border-b-2 border-gray-700/60 last:border-b-0">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-gray-800/70 border-b border-gray-700/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-white">{title}</span>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <Chip>{summary.total} task{summary.total !== 1 ? "s" : ""}</Chip>
          <Chip>{summary.estHours > 0 ? formatDuration(summary.estHours) : "0h"} est.</Chip>
          {summary.missing > 0 && <Chip tone="amber">{summary.missing} missing estimate{summary.missing !== 1 ? "s" : ""}</Chip>}
          {summary.overdue > 0 && <Chip tone="red">{summary.overdue} overdue</Chip>}
        </div>
      </div>
      {phases.map(p => (
        <div key={p.key}>
          <div className="flex items-center gap-1.5 pl-4 md:pl-5 pr-3 py-1 bg-gray-900/40 border-b border-gray-800/40">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || "#6B7280" }} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-300">{p.name}</span>
            <span className="text-[10px] text-gray-500">{p.tasks.length}</span>
          </div>
          {p.tasks.map(t => renderTaskRow(t))}
        </div>
      ))}
    </section>
  );
}