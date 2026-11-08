import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { mRange, hRange } from "./scopeBudgetFormat";

const SRC = { baseline_conversion: "Baseline (conversion)", baseline_backfill: "Baseline (backfill)", approval_fingerprint: "Approval record" };
const Row = ({ name, t, cls }) => (
  <div className={`grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_9rem_6rem_9rem] gap-x-3 px-3 py-1.5 text-xs ${cls}`}>
    <span className="truncate">{name} <span className="text-gray-500">({t.items}{t.not_converted ? `, ${t.not_converted} not converted` : ""})</span></span>
    <span className="text-right">{mRange(t.hard_cost)}</span>
    <span className="hidden sm:block text-right">{hRange(t.labor_hours)}</span>
    <span className="hidden sm:block text-right">{mRange(t.labor_dollars)}</span>
  </div>
);

export default function ScopeBudgetBreakdown({ reviews }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="rounded-md border border-gray-800 overflow-hidden">
      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_9rem_6rem_9rem] gap-x-3 px-3 py-1.5 text-[11px] uppercase text-gray-500 bg-gray-900">
        <span>Category / Group</span><span className="text-right">Hard cost</span><span className="text-right">Labor hrs</span><span className="text-right">Labor $</span>
      </div>
      {reviews.map((r) => r.categories.map((c) => (
        <div key={`${r.request_id}:${c.id}`}>
          <Row name={reviews.length > 1 ? `${r.title} · ${c.name}` : c.name} t={c.totals} cls="bg-gray-800/60 font-semibold text-white uppercase tracking-wide" />
          {c.groups.map((g) => {
            const k = `${r.request_id}:${c.id}:${g.id}`;
            return (
              <div key={k}>
                <button type="button" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k} className="w-full text-left hover:bg-gray-800/40">
                  <Row name={<><ChevronRight className={`inline w-3 h-3 mr-1 transition-transform ${open === k ? "rotate-90" : ""}`} />{g.name}</>} t={g.totals} cls="pl-6 text-gray-300" />
                </button>
                {open === k && g.items.map((i) => (
                  <div key={i.scope_item_id} className="pl-10 pr-3 py-1 text-[11px] text-gray-400 border-t border-gray-800/60">
                    <div className="text-gray-200">{i.title}</div>
                    <div>{i.hard_cost_state === "tbd" ? "Hard cost TBD" : i.hard_cost_state === "not_applicable" ? `Legacy budget ${mRange(i.legacy_budget)}` : `Hard cost ${mRange(i.hard_cost)}`} · Labor {hRange(i.labor_hours)} {i.labor_dollars ? `(${mRange(i.labor_dollars)})` : ""}</div>
                    <div className="text-gray-500">{i.converted ? `Task created · ${i.linked_parts} parts linked` : "Not yet converted"} · Source: {SRC[i.provenance.source] || i.provenance.source}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )))}
    </div>
  );
}