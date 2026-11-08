import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { accMoney, range } from "./fundingFormat";
import ReconItemRow from "./ReconItemRow";

function Node({ title, approved, parts, level, children }) {
  const [open, setOpen] = useState(level === 0);
  return (
    <div className={level === 0 ? "rounded-md border border-gray-800" : "border-t border-gray-800"}>
      <button onClick={() => setOpen(!open)} className={`w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-1.5 text-left text-xs ${level === 0 ? "bg-gray-900/70" : "bg-gray-900/30 pl-5"}`}>
        <ChevronRight className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="font-semibold text-white">{title}</span>
        <span className="text-gray-400">{approved.items} item(s) · allowance {range(approved.hard_cost)} · labor {range(approved.labor_dollars)}</span>
        <span className="text-gray-400">planned parts {accMoney(parts.planned_cost)} · PO {accMoney(parts.po_committed_cost)}</span>
      </button>
      {open && <div className={level === 0 ? "px-2" : "pl-6 pr-1"}>{children}</div>}
    </div>
  );
}

// Category → group → scope item, in canonical scope order.
export default function ReconTree({ tree }) {
  return (
    <div className="space-y-2">
      {tree.map((r) => r.categories.map((c) => (
        <Node key={`${r.request_id}-${c.id}`} title={`${c.name}${tree.length > 1 ? ` · ${r.title}` : ""}`} approved={c.approved} parts={c.parts_totals} level={0}>
          {c.groups.map((g) => (
            <Node key={g.id || "none"} title={g.name} approved={g.approved} parts={g.parts_totals} level={1}>
              {g.items.map((i) => <ReconItemRow key={i.scope_item_id} item={i} />)}
            </Node>
          ))}
        </Node>
      )))}
    </div>
  );
}