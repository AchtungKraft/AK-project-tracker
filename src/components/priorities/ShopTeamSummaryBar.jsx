import React, { useMemo } from "react";
import { User, AlertTriangle, UserX } from "lucide-react";

export default function ShopTeamSummaryBar({ tasks, teamMembers, onFilterByMember }) {
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
        return { id, name: tm?.full_name || "Unknown", initials: (tm?.full_name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(), count };
      })
      .sort((a, b) => b.count - a.count);

    return { members, unassigned, overdue, total: tasks.length };
  }, [tasks, teamMembers]);

  if (summary.total === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {summary.members.map(m => (
        <button
          key={m.id}
          onClick={() => onFilterByMember(m.id)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800/60 border border-gray-700 hover:border-gray-500 transition-colors text-xs"
        >
          <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-[10px] font-bold">
            {m.initials}
          </span>
          <span className="text-gray-300">{m.name.split(" ")[0]}</span>
          <span className="text-white font-semibold">{m.count}</span>
        </button>
      ))}
      {summary.unassigned > 0 && (
        <button
          onClick={() => onFilterByMember("unassigned")}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800/60 border border-yellow-700/50 hover:border-yellow-600 transition-colors text-xs"
        >
          <UserX className="w-3.5 h-3.5 text-yellow-500" />
          <span className="text-yellow-400">Unassigned</span>
          <span className="text-white font-semibold">{summary.unassigned}</span>
        </button>
      )}
      {summary.overdue > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-900/30 border border-red-700/50 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-red-400">{summary.overdue} overdue</span>
        </div>
      )}
    </div>
  );
}