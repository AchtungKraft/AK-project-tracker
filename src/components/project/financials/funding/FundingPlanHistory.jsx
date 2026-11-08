import React, { useState } from "react";
import { cents } from "./fundingFormat";

// Saved draft versions (each save is a snapshot). Read only.
export default function FundingPlanHistory({ versions }) {
  const [open, setOpen] = useState(false);
  if (!versions.length) return null;
  return (
    <div className="text-xs">
      <button onClick={() => setOpen(!open)} className="text-gray-400 hover:text-white underline-offset-2 hover:underline">{open ? "Hide" : "Show"} version history ({versions.length})</button>
      {open && (
        <ul className="mt-1 space-y-0.5 text-gray-400">
          {versions.map((v) => (
            <li key={v.version}>v{v.version} · {new Date(v.saved_at).toLocaleString()} · {v.saved_by_email} · {v.milestone_count} milestone(s) · {cents(v.total_planned_cents)}{v.change_note ? ` · "${v.change_note}"` : ""}</li>
          ))}
        </ul>
      )}
    </div>
  );
}