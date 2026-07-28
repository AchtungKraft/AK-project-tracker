import React from "react";

/**
 * Phase / group label heading in the print layout.
 * Displayed once per group, not per entry.
 */
export default function PrintPhaseHeading({ label }) {
  if (!label) return null;
  return (
    <div className="print-phase-heading">
      PHASE — {label.toUpperCase()}
    </div>
  );
}