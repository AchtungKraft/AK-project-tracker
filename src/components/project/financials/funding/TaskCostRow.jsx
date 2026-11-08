import React from "react";
import { addAcc } from "./fundingStatus";
import { accMoney, range, VAR_TONE } from "./fundingFormat";
import { money } from "../finFormat";

const allowance = (a) => (a.pricing_model !== "hard_cost_plus_labor" ? "Legacy" : a.hard_cost_state === "tbd" ? "TBD" : a.hard_cost ? range(a.hard_cost) : "Not estimated");
const verdict = (v) => {
  const c = v?.state === "compared" ? (v.actual_received?.state !== "within" && v.actual_received?.state !== "incomplete" ? v.actual_received : v.committed) : null;
  if (!c) return { text: v?.state === "no_linked_parts" ? "No linked parts" : "Not comparable", tone: "text-gray-500" };
  if (c.state === "incomplete") return { text: `${c.unknown} cost unknown`, tone: VAR_TONE.incomplete };
  return { text: c.state === "within" ? "Within allowance" : `${c.state === "over" ? "Over" : "Under"} ${money(c.amount)}`, tone: VAR_TONE[c.state] };
};

export default function TaskCostRow({ item, onOpen }) {
  const p = item.parts_totals, v = verdict(item.variance);
  return (
    <tr className="border-t border-gray-800">
      <td className="py-1 pr-2 min-w-0"><div className="text-white truncate max-w-[220px]" title={item.task_name}>{item.task_name}</div><div className="text-[10px] text-gray-500">{item.parts.length} linked part(s)</div></td>
      <td className="pr-2 text-gray-300">{allowance(item.approved)}</td>
      <td className="pr-2 text-gray-300">{accMoney(p.planned_cost)}</td>
      <td className="pr-2 text-gray-300">{accMoney(p.po_committed_cost)}</td>
      <td className="pr-2 text-gray-300">{accMoney(addAcc(p.received_cost, p.external_received_cost))}</td>
      <td className={`pr-2 ${v.tone}`}>{v.text}</td>
      <td className="text-right"><button onClick={onOpen} className="text-blue-400 hover:text-blue-300 whitespace-nowrap">Open · Link Part</button></td>
    </tr>
  );
}