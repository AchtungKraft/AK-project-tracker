import React from "react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateUtils";

/**
 * Compact operational summary for a feedback request.
 * Shows key lifecycle timestamps at a glance — only values that exist.
 */
export default function OperationalSummary({ request, isMobile = false }) {
  if (!request) return null;

  const items = [];

  // Posted
  if (request.posted_at) {
    items.push({ label: "Posted", value: format(new Date(request.posted_at), "MMM d") });
  }

  // Client viewed
  if (request.client_last_viewed_at) {
    items.push({ label: "Viewed", value: format(new Date(request.client_last_viewed_at), "MMM d") });
  }

  // Last client activity
  const clientActivityDate = request.latestClientActivityAt || request.client_last_viewed_at;
  if (clientActivityDate && request.posted_at) {
    items.push({ label: "Client", value: formatRelativeShort(clientActivityDate) });
  } else if (request.posted_at && !clientActivityDate) {
    items.push({ label: "Client", value: "None", muted: true });
  }

  // Last internal activity
  if (request.last_viewed_by_internal_at && request.posted_at) {
    items.push({ label: "Internal", value: formatRelativeShort(request.last_viewed_by_internal_at) });
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

  // Due date — show as "Due In" or "Overdue By"
  if (request.due_date) {
    const dueDate = parseLocalDate(request.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysDiff = differenceInDays(dueDate, today);

    if (daysDiff < 0) {
      items.push({
        label: "Overdue",
        value: `${Math.abs(daysDiff)}d`,
        warn: true,
      });
    } else if (daysDiff === 0) {
      items.push({
        label: "Due",
        value: "Today",
        highlight: true,
      });
    } else {
      items.push({
        label: "Due In",
        value: `${daysDiff}d`,
        highlight: daysDiff <= 3,
      });
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

function formatRelativeShort(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return format(new Date(dateStr), 'MMM d');
}