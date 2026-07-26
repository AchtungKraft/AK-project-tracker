import React from "react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateUtils";

/**
 * Operational Summary — TIMESTAMPS ONLY
 * 
 * Responsibility: "What are the important dates?"
 * Shows: Posted, Client Viewed, Due date.
 * 
 * Does NOT show: waiting duration (NextAction's job),
 * client reply / internal reply (ReviewCycleSummary's job).
 */
export default function OperationalSummary({ request, isMobile = false }) {
  if (!request) return null;

  const items = [];

  // Posted date
  if (request.posted_at) {
    items.push({ label: "Posted", value: format(new Date(request.posted_at), "MMM d") });
  }

  // Client last viewed
  if (request.client_last_viewed_at) {
    items.push({ label: "Viewed", value: format(new Date(request.client_last_viewed_at), "MMM d") });
  } else if (request.posted_at) {
    items.push({ label: "Viewed", value: "Not yet", muted: true });
  }

  // Due date
  if (request.due_date) {
    const dueDate = parseLocalDate(request.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysDiff = differenceInDays(dueDate, today);

    if (daysDiff < 0) {
      items.push({ label: "Overdue", value: `${Math.abs(daysDiff)}d`, warn: true });
    } else if (daysDiff === 0) {
      items.push({ label: "Due", value: "Today", highlight: true });
    } else {
      items.push({ label: "Due", value: format(dueDate, "MMM d"), highlight: daysDiff <= 3 });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className={cn(
      "flex items-center text-xs",
      isMobile ? "gap-1.5 flex-wrap" : "gap-0"
    )}>
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {i > 0 && <span className="text-gray-700 mx-1.5">·</span>}
          <span className={cn(
            "whitespace-nowrap",
            item.warn ? "text-red-400 font-medium" :
            item.highlight ? "text-orange-400 font-medium" :
            item.muted ? "text-gray-600" :
            "text-gray-400"
          )}>
            <span className="text-gray-500">{item.label}</span>{" "}
            {item.value}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}