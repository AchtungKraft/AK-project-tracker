import React from "react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Compact operational summary for a feedback request.
 * Shows key lifecycle timestamps at a glance.
 */
export default function OperationalSummary({ request, isMobile = false }) {
  if (!request) return null;

  const items = [];

  if (request.posted_at) {
    items.push({ label: "Posted", value: format(new Date(request.posted_at), "MMM d") });
  }

  if (request.client_last_viewed_at) {
    items.push({ label: "Viewed", value: format(new Date(request.client_last_viewed_at), "MMM d") });
  }

  // Last client activity — from latest client comment/decision timestamp
  const clientActivityDate = request.latestClientActivityAt || request.client_last_viewed_at;
  if (clientActivityDate && request.posted_at) {
    items.push({ label: "Client Activity", value: format(new Date(clientActivityDate), "MMM d") });
  } else if (request.posted_at && !clientActivityDate) {
    items.push({ label: "Client Activity", value: "None", muted: true });
  }

  // Waiting duration — only for posted, non-archived requests
  if (request.posted_at && request.status !== 'archived') {
    const lastActivity = clientActivityDate || request.posted_at;
    const days = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000);
    if (days > 0) {
      items.push({
        label: "Waiting",
        value: `${days}d`,
        highlight: days > 7,
        warn: days > 14,
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className={cn(
      "flex items-center gap-3 text-xs",
      isMobile ? "gap-2 flex-wrap" : "gap-4"
    )}>
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {i > 0 && <span className="text-gray-700">·</span>}
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