import React from "react";
import { AlertTriangle } from "lucide-react";
import StaleTotalsDrilldown from "./StaleTotalsDrilldown";

export default function FinancialWarnings({ warnings, lines }) {
  if (!warnings?.length) return null;
  return (
    <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 space-y-1.5">
      {warnings.map((w) => (
        <div key={w.code} className="space-y-1">
          <div className="flex items-start gap-2 text-sm text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
            <span>{w.message}</span>
          </div>
          {w.code === "STALE_STORED_TOTALS" && <StaleTotalsDrilldown parts={lines?.parts} />}
        </div>
      ))}
    </div>
  );
}