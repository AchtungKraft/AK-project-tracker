import React, { useMemo } from "react";
import { AlertTriangle, UserX, ArrowRight } from "lucide-react";

export default function ShopTeamSummaryBar({ tasks, teamMembers, onFilterByMember, activeFilterId }) {
  const summary = useMemo(() => {
    const byMember = {};
    let unassigned = 0;
    let overdue = 0;
    const now = new Date();

    tasks.forEach(t => {
      if (t.due_date && new Date(t.due_date) <= now) overdue++;
      if (!t.assigned_team_member_id) {
        unassigned++;
        return;
      }
      byMember[t.assigned_team_member_id] = (byMember[t.assigned_team_member_id] || 0) + 1;
    });

    const members = Object.entries(byMember)
      .map(([id, count]) => {
        const tm = teamMembers.find(m => m.id === id);
        return {
          id,
          name: tm?.full_name || "Unknown",
          initials: (tm?.full_name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
          count,
        };
      })
      .sort((a, b) => b.count - a.count);

    const lowestMember = members.length > 0 ? members[members.length - 1] : null;
    const highestMember = members.length > 0 ? members[0] : null;

    return { members, unassigned, overdue, total: tasks.length, lowestMember, highestMember };
  }, [tasks, teamMembers]);

  if (summary.total === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {summary.members.map(m => {
          const isActive = activeFilterId === m.id;
          const isHighest = summary.highestMember?.id === m.id && summary.members.length > 1;
          const isLowest = summary.lowestMember?.id === m.id && summary.members.length > 1;
          return (
            <button
              key={m.id}
              onClick={() => onFilterByMember(m.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                isActive
                  ? "bg-red-600/30 border border-red-500/50 text-white"
                  : "bg-gray-800/60 border border-gray-700 hover:border-gray-500 text-gray-300"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isHighest ? "bg-red-600/30 text-red-400" : isLowest ? "bg-green-600/30 text-green-400" : "bg-blue-600/30 text-blue-400"
              }`}>
                {m.initials}
              </span>
              <span>{m.name.split(" ")[0]}</span>
              <span className="font-semibold text-white">{m.count}</span>
            </button>
          );
        })}
        {summary.unassigned > 0 && (
          <button
            onClick={() => onFilterByMember("unassigned")}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              activeFilterId === "unassigned"
                ? "bg-yellow-600/30 border border-yellow-500/50 text-white"
                : "bg-gray-800/60 border border-yellow-700/40 hover:border-yellow-600 text-yellow-400"
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Unassigned</span>
            <span className="font-semibold text-white">{summary.unassigned}</span>
          </button>
        )}
        {summary.overdue > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-900/20 border border-red-800/40 text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{summary.overdue} overdue</span>
          </div>
        )}
      </div>
      {summary.lowestMember && summary.members.length > 1 && (
        <div className="flex items-center gap-1 text-[11px] text-gray-500 px-0.5">
          <ArrowRight className="w-3 h-3 text-green-500" />
          <span>Best to assign next: <span className="text-green-400 font-medium">{summary.lowestMember.name.split(" ")[0]}</span> ({summary.lowestMember.count} tasks)</span>
        </div>
      )}
    </div>
  );
}