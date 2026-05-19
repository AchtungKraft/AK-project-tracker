import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Build a chronological feed of recent operational events from enriched requests.
 */
function buildMomentumEvents(allRequests, maxEvents = 8) {
  const events = [];

  for (const r of allRequests) {
    const pName = r._projectName || 'Project';
    const base = { requestId: r.id, projectId: r.project_id, title: r.title, projectName: pName };

    if (r.approvedAt) {
      events.push({ ...base, type: 'approved', symbol: '✓', color: 'text-emerald-400', timestamp: r.approvedAt });
    }

    if (r.latestActivityActor === 'client' && r.latestActivityAt && !r.approvedAt) {
      events.push({ ...base, type: 'replied', symbol: '↺', color: 'text-blue-400', timestamp: r.latestActivityAt });
    }

    if (r.isOverdue && r.due_date) {
      const daysPast = Math.ceil((Date.now() - new Date(r.due_date).getTime()) / (1000 * 60 * 60 * 24));
      events.push({ ...base, type: 'overdue', symbol: '!', color: 'text-red-400', extra: `${daysPast}d`, timestamp: r.due_date });
    }
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, maxEvents);
}

/**
 * MomentumFeed — minimal inline activity ticker.
 * Single-line flow. No borders. No header chrome.
 */
export default function MomentumFeed({ allRequests }) {
  const events = useMemo(() => buildMomentumEvents(allRequests), [allRequests]);

  if (events.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5 px-1">
      {events.map((evt, i) => (
        <Link
          key={`${evt.requestId}-${evt.type}-${i}`}
          to={createPageUrl("ClientFeedbackDetail") + `?id=${evt.requestId}&projectId=${evt.projectId}&from=hub`}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] transition-colors",
            "hover:bg-white/[0.04] group"
          )}
        >
          <span className={cn("font-bold", evt.color)}>{evt.symbol}</span>
          <span className="text-gray-500">
            <span className="text-gray-400 font-medium">{evt.projectName}</span>
            {' '}{evt.type === 'approved' ? 'approved' : evt.type === 'replied' ? 'replied' : `overdue ${evt.extra}`}
          </span>
          <span className="text-gray-700 tabular-nums">
            {formatDistanceToNow(new Date(evt.timestamp), { addSuffix: false })}
          </span>
        </Link>
      ))}
    </div>
  );
}