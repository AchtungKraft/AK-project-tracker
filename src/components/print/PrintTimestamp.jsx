import React from "react";

/**
 * Formats a date into operational print timestamp: "5/11/2026 8:42 AM"
 */
function formatPrintTimestamp(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  let h = date.getHours();
  const min = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${m}/${d}/${y} ${h}:${min} ${ampm}`;
}

export { formatPrintTimestamp };

/**
 * Reusable print timestamp display.
 * Shows "Printed 5/11/2026 8:42 AM" optionally with user name.
 *
 * Props:
 *   userName - optional string
 *   prefix   - optional string (default "Printed")
 *   separator - optional string prepended before the timestamp (e.g. " • ")
 *   inline   - if true, renders as inline span instead of block
 */
export default function PrintTimestamp({ userName, prefix = "Printed", separator, inline = false }) {
  const stamp = formatPrintTimestamp();
  const text = [prefix, stamp, userName].filter(Boolean).join(" • ").replace("• •", "•");
  // Clean: "Printed • 5/11/2026 8:42 AM • Dan" → "Printed 5/11/2026 8:42 AM • Dan"
  const display = `${prefix} ${stamp}${userName ? ` • ${userName}` : ""}`;

  if (inline) {
    return <span className="text-gray-500" style={{ fontSize: 10 }}>{separator}{display}</span>;
  }

  return <span className="text-gray-500" style={{ fontSize: 10 }}>{display}</span>;
}