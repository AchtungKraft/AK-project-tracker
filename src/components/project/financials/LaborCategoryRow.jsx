import React from "react";
import { money, hrs } from "./finFormat";

// Labor row: billable-to-date only; cost isn't configured, so cost/margin are never shown as $0.
export default function LaborCategoryRow({ lb }) {
  return (
    <tr className="border-t border-gray-800">
      <td className="py-2 pr-2 text-white">Labor
        <div className="text-[10px] text-gray-500">{hrs(lb.hours.billable)} billable · +{money(lb.projected_remaining)} projected</div>
        {lb.project_rate == null && <div className="text-[10px] text-amber-400">Billing rate not set</div>}
      </td>
      <td className="py-2 px-2 text-right tabular-nums">{money(lb.billable_to_date)}</td>
      <td className="py-2 px-2 text-right text-gray-500 text-xs">Not configured</td>
      <td className="py-2 px-2 text-right text-gray-500 text-xs hidden md:table-cell">Not configured</td>
      <td className="py-2 px-2 text-right text-gray-500">—</td>
      <td className="hidden md:table-cell" />
      <td className="py-2 px-2 text-right text-gray-500 text-xs">Not invoiced</td>
      <td className="py-2 pl-2 text-right text-gray-500 hidden md:table-cell">—</td>
    </tr>
  );
}