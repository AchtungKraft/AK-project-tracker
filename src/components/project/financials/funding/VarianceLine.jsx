import React from "react";
import { money } from "../finFormat";
import { VARIANCE_LABEL, VAR_TONE } from "./fundingFormat";

const one = (label, v) => {
  if (!v) return null;
  const text = v.state === "incomplete" ? `incomplete (${v.unknown} unknown)` : v.state === "within" ? `within allowance (${money(v.value)})` : `${v.state} by ${money(v.amount)} (${money(v.value)})`;
  return <span key={label} className={VAR_TONE[v.state]}>{label}: {text}</span>;
};

// Cost vs approved hard-cost allowance — only comparable, fully known values.
export default function VarianceLine({ variance }) {
  if (variance.state !== "compared") return <span className="text-gray-500">{VARIANCE_LABEL[variance.state] || variance.state}</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {one("Planned", variance.planned)}{one("Committed", variance.committed)}{one("Received", variance.actual_received)}
    </span>
  );
}