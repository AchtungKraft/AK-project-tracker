import React from "react";
import { cents, METHOD_LABEL } from "./fundingFormat";

// Saved milestones with their status. All are draft: none has been requested or invoiced.
export default function MilestoneStatusList({ plan }) {
  const ms = plan?.milestones || [];
  if (!ms.length) return <p className="text-xs text-gray-500">No saved milestones yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[480px]">
        <thead><tr className="text-left text-gray-500"><th className="py-1 font-normal">Milestone</th><th className="font-normal">Basis</th><th className="font-normal">Target date</th><th className="font-normal text-right">Planned</th><th className="font-normal text-right">Status</th></tr></thead>
        <tbody>
          {ms.map((m) => (
            <tr key={m.id} className="border-t border-gray-800">
              <td className="py-1 pr-2 text-white">{m.name}</td>
              <td className="pr-2 text-gray-400">{METHOD_LABEL[m.method]}{m.percent_bps != null ? ` · ${m.percent_bps / 100}%` : ""}</td>
              <td className="pr-2 text-gray-400">{m.target_date || "—"}</td>
              <td className="pr-2 text-right text-violet-300">{cents(m.calculated_amount_cents)}</td>
              <td className="text-right"><span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-300">Draft · not requested</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}