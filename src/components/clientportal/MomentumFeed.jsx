import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CheckCircle2, MessageSquareText, AlertCircle, Clock, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Build a chronological feed of recent operational events from enriched requests.
 * Returns most recent N events across all requests.
 */
function buildMomentumEvents(allRequests, maxEvents = 8) {
  const events = [];

  for (const r of allRequests) {
    const pName = r._projectName || 'Project';
    const base = { requestId: r.id, projectId: r.project_id, title: r.title, projectName: pName };

    // Approved events
    if (r.approvedAt) {
      events.push({
        ...base,
        type: 'approved',
        icon: CheckCircle2,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        label: `approved ${r.title}`,
        timestamp: r.approvedAt,
      });
    }

    // Client replied events
    if (r.latestActivityActor === 'client' && r.latestActivityAt && !r.approvedAt) {
      events.push({
        ...base,
        type: 'client_replied',
        icon: MessageSquareText,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        label: `replied to ${r.title}`,
        timestamp: r.latestActivityAt,
      });
    }

    // Overdue events
    if (r.isOverdue && r.due_date) {
      const dueDate = new Date(r.due_date);
      const daysPast = Math.ceil((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      events.push({
        ...base,
        type: 'overdue',
        icon: AlertCircle,
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        label: `overdue ${daysPast}d — ${r.title}`,
        timestamp: r.due_date,
      });
    }
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, maxEvents);
}

const EVENT_SYMBOLS = {
  approved: '✓',
  client_replied: '↺',
  overdue: '⚠',
};

/**
 * MomentumFeed — compact operational activity ticker.
 * Shows recent approvals, replies, and overdue escalations.
 */
export default function MomentumFeed({ allRequests }) {
  const events = useMemo(() => buildMomentumEvents(allRequests), [allRequests]);

  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-700/40 bg-gray-900/40 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-gray-700/30 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Recent Activity
        </span>
        <span className="text-[10px] text-gray-600">{events.length} events</span>
      </div>
      <div className="flex flex-wrap gap-x-1 gap-y-0 px-2 py-1.5">
        {events.map((evt, i) => {
          const Icon = evt.icon;
          return (
            <Link
              key={`${evt.requestId}-${evt.type}-${i}`}
              to={createPageUrl("ClientFeedbackDetail") + `?id=${evt.requestId}&projectId=${evt.projectId}&from=hub`}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors",
                "hover:bg-gray-800/60 group"
              )}
            >
              <span className={cn("font-bold", evt.color)}>{EVENT_SYMBOLS[evt.type]}</span>
              <span className="text-gray-400 truncate max-w-[180px]">
                <span className="text-gray-300 font-medium">{evt.projectName}</span>
                {' '}{evt.type === 'approved' ? 'approved' : evt.type === 'client_replied' ? 'replied' : 'overdue'}
              </span>
              <span className="text-gray-600 shrink-0">
                {formatDistanceToNow(new Date(evt.timestamp), { addSuffix: false })}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}