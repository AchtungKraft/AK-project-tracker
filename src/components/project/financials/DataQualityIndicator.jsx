import React from "react";
import { Info } from "lucide-react";
import StaleTotalsDrilldown from "./StaleTotalsDrilldown";

// Compact, low-emphasis note for harmless stored-total discrepancies (calculated values are always used).
export default function DataQualityIndicator({ dataQuality, lines }) {
  const s = dataQuality?.stale_stored_totals;
  if (!s?.count) return null;
  const parts = [
    s.price_entered_later && `${s.price_entered_later} price entered after creation`,
    s.quantity_changed && `${s.quantity_changed} quantity changed`,
    s.other && `${s.other} other`,
  ].filter(Boolean).join(" · ");
  return (
    <div className="rounded-md border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-400">
      <div className="flex items-center gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 text-gray-500" />
        <span>Data quality: {s.count} saved part total(s) are out of date ({parts}). Not used — totals are calculated.</span>
      </div>
      <StaleTotalsDrilldown parts={lines?.parts} />
    </div>
  );
}