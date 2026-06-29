import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_COLORS = {
  planned: "border-gray-500 text-gray-400",
  ordered: "border-blue-500 text-blue-400",
  completed: "border-green-500 text-green-400",
  billed: "border-purple-500 text-purple-400",
};

function formatMonthYear(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function VendorRecentActivity({ commitments, projectMap, serviceMap }) {
  const timeline = useMemo(() => {
    const items = commitments
      .map(sc => {
        const date = sc.completed_date || sc.ordered_date || sc.created_date;
        const project = projectMap.get(sc.project_id);
        const service = serviceMap.get(sc.service_id);
        return { sc, date, project, service };
      })
      .filter(item => item.project)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 25);

    // Group by month
    const groups = [];
    let currentMonth = null;
    for (const item of items) {
      const month = item.date ? formatMonthYear(item.date) : "Unknown";
      if (month !== currentMonth) {
        currentMonth = month;
        groups.push({ month, items: [] });
      }
      groups[groups.length - 1].items.push(item);
    }
    return groups;
  }, [commitments, projectMap, serviceMap]);

  if (timeline.length === 0) return null;

  return (
    <div className="bg-gray-800/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Activity className="w-3.5 h-3.5 text-green-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Recent Activity</span>
      </div>
      <div className="space-y-3">
        {timeline.map(group => (
          <div key={group.month}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">{group.month}</p>
            <div className="space-y-1.5 pl-2 border-l border-gray-700/50">
              {group.items.map(item => (
                <Link
                  key={item.sc.id}
                  to={`/projectdetail?id=${item.sc.project_id}`}
                  className="block p-1.5 rounded hover:bg-gray-700/30 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white font-medium group-hover:text-red-400 transition-colors truncate">
                      {item.project.name}
                    </span>
                    <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-gray-400 shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-500 truncate">
                      {item.service?.name || item.sc.description}
                    </span>
                    <Badge variant="outline" className={cn("text-[9px] px-1 py-0 ml-auto shrink-0", STATUS_COLORS[item.sc.status] || STATUS_COLORS.planned)}>
                      {item.sc.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}