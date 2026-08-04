import React from "react";

/**
 * Formats decimal hours into a human-readable string for print.
 * 0.5 → "30m", 1 → "1h", 1.5 → "1h 30m", 2.25 → "2h 15m"
 */
function formatHours(decimal) {
  if (decimal == null || decimal === "" || isNaN(decimal)) return null;
  const num = Number(decimal);
  if (num === 0) return "0m";
  const hours = Math.floor(num);
  const minutes = Math.round((num - hours) * 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Compact production-style TIME module for printed task sheets.
 *
 * Props:
 *   estimatedHours - decimal number or null
 *   loggedHours    - CANONICAL: sum of TaskTimeEntry.hours (preferred)
 *   actualHours    - DEPRECATED: legacy field, used only as fallback if loggedHours not provided
 *   isCompleted    - boolean
 *   inline         - boolean (default true) — sits in a flex row
 *
 * Layout:  TIME  Est 3h · Logged 2h 30m   (completed — both values shown)
 *          TIME  3h  [        ]            (active task — box for handwritten actual)
 *          TIME  —   [        ]            (no estimate — dash + box)
 */
export default function TaskTimePrintFields({ estimatedHours, loggedHours, actualHours, isCompleted = false, inline = true }) {
  const estDisplay = formatHours(estimatedHours);
  // Canonical: use loggedHours from time entries; fall back to legacy actualHours
  const canonicalLogged = loggedHours != null ? loggedHours : actualHours;
  const logDisplay = formatHours(canonicalLogged);

  const showLogged = isCompleted && logDisplay;

  return (
    <div
      className="flex items-center gap-1 shrink-0 whitespace-nowrap"
      style={{ width: 160, justifyContent: "flex-end" }}
    >
      {/* TIME label */}
      <span
        className="font-semibold uppercase tracking-wider text-gray-400"
        style={{ fontSize: 7, letterSpacing: "0.08em" }}
      >
        time
      </span>

      {/* Estimate */}
      <span className="text-gray-700 font-medium" style={{ fontSize: 10, minWidth: 28, textAlign: "right" }}>
        {estDisplay || "—"}
      </span>

      {showLogged ? (
        /* Completed: show slash + logged */
        <>
          <span className="text-gray-400" style={{ fontSize: 9 }}>/</span>
          <span className="text-gray-700 font-medium" style={{ fontSize: 10 }}>
            {logDisplay}
          </span>
        </>
      ) : canonicalLogged > 0 ? (
        /* Open task with some logged hours: show slash + logged + box */
        <>
          <span className="text-gray-400" style={{ fontSize: 9 }}>/</span>
          <span className="text-gray-500 font-medium" style={{ fontSize: 9 }}>
            {logDisplay}
          </span>
          <span
            className="inline-block border border-gray-500"
            style={{ width: 32, height: 14, verticalAlign: "middle" }}
          />
        </>
      ) : (
        /* Active: bordered handwriting box */
        <span
          className="inline-block border border-gray-500"
          style={{ width: 56, height: 14, verticalAlign: "middle" }}
        />
      )}
    </div>
  );
}

export { formatHours };