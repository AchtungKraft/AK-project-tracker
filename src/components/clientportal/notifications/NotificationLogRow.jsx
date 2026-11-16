import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const EVENT_LABELS = {
  CLIENT_COMMENT: "Client comment",
  TEAM_COMMENT: "AK comment",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
};

const STATUS_STYLES = {
  sent: "text-emerald-400",
  failed: "text-red-400",
  pending: "text-gray-400",
};

export default function NotificationLogRow({ record }) {
  const when = record.sent_at || record.created_date;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs py-1 border-b border-gray-800 last:border-0">
      <span className="text-gray-500 w-28 shrink-0">{when ? format(new Date(when), "MMM d, h:mm a") : "—"}</span>
      <span className="text-gray-300 w-32 shrink-0">{EVENT_LABELS[record.event_type] || record.event_type}</span>
      <span className="text-gray-200 min-w-0 truncate flex-1" title={record.recipient_email}>
        {record.recipient_name} <span className="text-gray-500">{record.recipient_email}</span>
      </span>
      <span className={cn("font-medium capitalize", STATUS_STYLES[record.status])} title={record.error || ""}>
        {record.status}
      </span>
      {record.error && <span className="basis-full text-red-400/80 truncate" title={record.error}>{record.error}</span>}
    </div>
  );
}