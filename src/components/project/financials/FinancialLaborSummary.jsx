import React from "react";
import { hrs } from "./finFormat";

export default function FinancialLaborSummary({ labor }) {
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 text-sm">
      <div className="font-medium text-white mb-2">Labor hours <span className="text-xs text-gray-500">(informational, not priced)</span></div>
      <div className="space-y-1 text-gray-300">
        <div className="flex justify-between"><span>Logged</span><span className="tabular-nums">{hrs(labor.hours_logged)} <span className="text-gray-500">({labor.entries} entries)</span></span></div>
        <div className="flex justify-between"><span>Estimated</span><span className="tabular-nums">{hrs(labor.hours_estimated)}</span></div>
        <div className="flex justify-between"><span>Remaining estimate</span><span className="tabular-nums">{hrs(labor.hours_remaining)}</span></div>
      </div>
    </div>
  );
}