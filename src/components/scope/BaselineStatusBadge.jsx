import React from "react";
import { STATUS_STYLES, STATUS_LABELS } from "./baselineFormat";

export default function BaselineStatusBadge({ status }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status] || STATUS_STYLES.skipped}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}