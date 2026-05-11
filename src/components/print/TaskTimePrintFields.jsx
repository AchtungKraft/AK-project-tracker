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
 * Reusable print component for task time tracking.
 * Shows estimated time and either actual time (if completed) or a blank handwritten area.
 *
 * Props:
 *   estimatedHours - decimal number or null
 *   actualHours    - decimal number or null (filled when task is completed digitally)
 *   isCompleted    - boolean, whether task has been completed
 *   inline         - boolean, render as inline shrink-0 block for row integration (default false)
 *   compact        - boolean, use single-line block layout (default true, ignored when inline)
 */
export default function TaskTimePrintFields({ estimatedHours, actualHours, isCompleted = false, inline = false, compact = true }) {
  const estDisplay = formatHours(estimatedHours);
  const actDisplay = formatHours(actualHours);
  const hasEstimate = estDisplay !== null;
  const hasActual = actDisplay !== null;

  // Inline mode: sits inside the flex row next to assignee/date columns
  if (inline) {
    return (
      <div className="flex items-baseline gap-2 shrink-0 text-xs print-time-fields">
        {hasEstimate && (
          <span className="text-gray-500 whitespace-nowrap">
            Est: {estDisplay}
          </span>
        )}
        {isCompleted && hasActual ? (
          <span className="text-gray-500 whitespace-nowrap">
            Act: {actDisplay}
          </span>
        ) : (
          <span className="text-gray-400 whitespace-nowrap">
            Act: <span className="inline-block border-b border-gray-400" style={{ minWidth: '70px' }}>&nbsp;</span>
          </span>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-baseline gap-3 ml-6 py-0.5 text-xs print-time-fields">
        {hasEstimate && (
          <span className="text-gray-600 font-medium whitespace-nowrap">
            Est: {estDisplay}
          </span>
        )}
        {isCompleted && hasActual ? (
          <span className="text-gray-600 whitespace-nowrap">
            Actual: {actDisplay}
          </span>
        ) : (
          <span className="text-gray-500 whitespace-nowrap">
            Actual: <span className="inline-block border-b border-gray-400" style={{ minWidth: '100px' }}>&nbsp;</span>
          </span>
        )}
      </div>
    );
  }

  // Vertical / spacious layout for card-style prints
  return (
    <div className="ml-6 py-1 text-xs print-time-fields space-y-1">
      {hasEstimate && (
        <div className="text-gray-600 font-medium">Est: {estDisplay}</div>
      )}
      {isCompleted && hasActual ? (
        <div className="text-gray-600">Actual: {actDisplay}</div>
      ) : (
        <div className="text-gray-500">
          Actual: <span className="inline-block border-b border-gray-400 ml-1" style={{ minWidth: '140px' }}>&nbsp;</span>
        </div>
      )}
    </div>
  );
}

export { formatHours };