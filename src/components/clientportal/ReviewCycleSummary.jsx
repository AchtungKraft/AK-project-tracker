import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Compact review lifecycle summary — sits above the timeline.
 * Shows key timestamps at a glance. Informational only — no new data.
 */
export default function ReviewCycleSummary({ request, isMobile = false }) {
  if (!request?.posted_at) return null;

  const items = [];

  // Posted
  items.push({
    label: "Posted",
    value: format(new Date(request.posted_at), "MMM d"),
  });

  // Client viewed
  if (request.client_last_viewed_at) {
    items.push({
      label: "Viewed",
      value: format(new Date(request.client_last_viewed_at), "MMM d"),
    });
  }

  // Last client reply
  if (request.latestClientActivityAt) {
    items.push({
      label: "Client Reply",
      value: format(new Date(request.latestClientActivityAt), "MMM d"),
    });
  }

  // Last internal reply
  if (request.last_viewed_by_internal_at) {
    items.push({
      label: "Internal Reply",
      value: format(new Date(request.last_viewed_by_internal_at), "MMM d"),
    });
  }

  // Waiting duration
  const lastActivity = request.latestClientActivityAt || request.client_last_viewed_at || request.posted_at;
  const waitDays = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000);
  if (waitDays > 0 && request.status !== 'archived') {
    items.push({
      label: "Waiting",
      value: `${waitDays}d`,
      highlight: waitDays > 7,
    });
  }

  // Due date
  if (request.due_date) {
    const dueDate = new Date(request.due_date + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((dueDate - today) / 86400000);
    if (daysDiff < 0) {
      items.push({ label: "Overdue", value: `${Math.abs(daysDiff)}d`, warn: true });
    } else if (daysDiff === 0) {
      items.push({ label: "Due", value: "Today", highlight: true });
    } else {
      items.push({ label: "Due In", value: `${daysDiff}d` });
    }
  }

  if (items.length <= 1) return null;

  return (
    <div className={cn(
      "rounded-lg border border-gray-800/60 bg-gray-900/40 px-3 py-2",
      isMobile ? "mx-0" : ""
    )}>
      <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-1.5">
        Review Cycle
      </div>
      <div className={cn(
        "flex items-center gap-0 text-xs",
        isMobile ? "flex-wrap gap-y-1" : ""
      )}>
        {items.map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <span className="text-gray-700 mx-2">·</span>}
            <span className={cn(
              "whitespace-nowrap",
              item.warn ? "text-red-400 font-medium" :
              item.highlight ? "text-orange-400 font-medium" :
              "text-gray-400"
            )}>
              <span className="text-gray-500">{item.label}</span>{" "}
              {item.value}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}