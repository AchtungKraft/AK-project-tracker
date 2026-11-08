import React from "react";
import { hardCostText, laborEstimateText, aggText, laborLoggedText } from "./baselineFormat";

export default function ReconciliationRow({ r }) {
  const n = r.parts?.link_count || 0;
  return (
    <tr className="border-b border-gray-800/60 align-top text-gray-200">
      <td className="py-1.5 pr-3 min-w-[180px]">
        <div className="text-white">{r.title}</div>
        <div className="text-gray-500">
          {[r.category_name, r.group_name].filter(Boolean).join(" / ")}
          {!r.task_found && <span className="text-red-400"> · task missing</span>}
          {!r.fingerprint_match && <span className="text-amber-400"> · confirmed manually</span>}
        </div>
      </td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{hardCostText(r)}</td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{laborEstimateText(r)}</td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{r.parts ? aggText(r.parts.committed_cost, n) : "Unknown"}</td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{r.parts ? aggText(r.parts.actual_cost, n) : "Unknown"}</td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{r.parts ? aggText(r.parts.billed, n) : "Unknown"}</td>
      <td className="py-1.5 whitespace-nowrap">{laborLoggedText(r.labor)}</td>
    </tr>
  );
}