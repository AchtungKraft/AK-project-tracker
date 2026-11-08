import React from "react";
import { AlertTriangle } from "lucide-react";
import { formatCalendarDate } from "@/lib/dateUtils";
import { hardCostText, laborEstimateText, moneyRange, hoursRange, reasonText } from "@/components/scope/baselineFormat";

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-3 text-xs">
    <span className="text-gray-500 shrink-0">{label}</span>
    <span className="text-gray-200 text-right">{children}</span>
  </div>
);

// Immutable approved estimate captured from the scope review. Reference only.
export default function BaselineEstimateBlock({ b }) {
  const total = moneyRange(b.total_estimate_min, b.total_estimate_max);
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400 truncate" title={b.request_title}>
        {b.request_title || "Scope Review"} · {[b.category_name, b.group_name].filter(Boolean).join(" / ")}
      </div>
      <Row label="Approved">
        {b.approved_at ? formatCalendarDate(b.approved_at.slice(0, 10), "MMM d, yyyy") : "Unknown"} · {b.source === "backfill" ? "Backfilled" : "On conversion"}
      </Row>
      <Row label="Hard cost / parts">{hardCostText(b)}</Row>
      <Row label="AK labor">{laborEstimateText(b)}</Row>
      {(b.labor_lines || []).length > 1 && b.labor_lines.map((l, i) => (
        <Row key={i} label={<span className="pl-3">{l.labor_group_name}</span>}>
          {hoursRange(l.hours_min, l.hours_max) || "—"} @ ${l.rate}/hr
        </Row>
      ))}
      <Row label="Total estimate">{total || "Incomplete (TBD or missing)"}</Row>
      {b.hard_cost_note && <p className="text-[11px] text-gray-500">{b.hard_cost_note}</p>}
      {!b.fingerprint_match && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-400">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            Captured without an exact approval match: {(b.ambiguity_reasons || []).map(reasonText).join(", ") || "unknown"}
            {b.reconciliation_note ? ` — "${b.reconciliation_note}"` : ""}
          </span>
        </div>
      )}
    </div>
  );
}