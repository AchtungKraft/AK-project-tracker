import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { money, hrs } from "../finFormat";
import { accMoney, range, STATE_LABEL } from "./fundingFormat";
import ReconPartsTable from "./ReconPartsTable";
import VarianceLine from "./VarianceLine";

const allowance = (a) => (a.pricing_model !== "hard_cost_plus_labor" ? `Legacy ${range(a.legacy_budget)}` : a.hard_cost_state === "tbd" ? "TBD" : a.hard_cost ? range(a.hard_cost) : "Not estimated");

export default function ReconItemRow({ item }) {
  const [open, setOpen] = useState(false);
  const a = item.approved, lp = item.labor_projection;
  return (
    <div className="border-t border-gray-800/70">
      <button onClick={() => setOpen(!open)} className="w-full text-left grid grid-cols-[16px_minmax(0,1fr)] md:grid-cols-[16px_minmax(0,2fr)_1fr_1fr_1fr] gap-x-2 gap-y-0.5 py-1.5 text-xs hover:bg-gray-900/40">
        <ChevronRight className={`w-3.5 h-3.5 mt-0.5 text-gray-500 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0"><span className="text-white">{item.title}</span> <span className={`text-[10px] ${item.state === "converted" ? "text-emerald-400" : "text-amber-300"}`}>{STATE_LABEL[item.state]}</span></span>
        <span className="col-start-2 md:col-start-auto text-gray-300">Allowance {allowance(a)}</span>
        <span className="col-start-2 md:col-start-auto text-gray-300">Planned {accMoney(item.parts_totals.planned_cost)}</span>
        <span className="col-start-2 md:col-start-auto text-gray-300">{item.parts.length} part(s)</span>
      </button>
      {open && (
        <div className="pl-6 pb-3 space-y-2 text-xs">
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="rounded bg-gray-900/50 p-2">
              <div className="text-gray-400 mb-0.5">Approved labor</div>
              <div className="text-white">{a.labor_hours ? `${a.labor_hours.min}–${a.labor_hours.max}h · ${range(a.labor_dollars)}` : "Not estimated"}</div>
              {a.labor_lines.map((l, i) => <div key={i} className="text-[10px] text-gray-500">{l.labor_group_name} {money(l.rate)}/h · {l.hours_min}–{l.hours_max}h</div>)}
            </div>
            <div className="rounded bg-gray-900/50 p-2">
              <div className="text-gray-400 mb-0.5">Current task projection {item.task_name ? `· ${item.task_name}` : ""}</div>
              {lp ? <><div className="text-white">{hrs(lp.projected_hours)} projected · {hrs(lp.logged_hours)} logged · est {hrs(lp.estimated_hours)}</div>
                <div className="text-[10px] text-gray-500">{lp.effective_rate != null ? `${money(lp.projected_value_at_rate)} at ${money(lp.effective_rate)}/h (${lp.rate_source})` : "No rate set"} · {lp.billing_type} · {lp.task_status || "no status"}</div></>
                : <div className="text-gray-500">{item.state === "task_missing" ? "Converted task no longer exists." : "Not converted — no task yet."}</div>}
            </div>
          </div>
          <div className="text-gray-400">Variance vs allowance: <VarianceLine variance={item.variance} /></div>
          {item.task_links_without_project_commitment > 0 && <div className="text-amber-300">{item.task_links_without_project_commitment} task part link(s) have no commitment on this project — not counted.</div>}
          {item.state === "converted" && <ReconPartsTable rows={item.parts} />}
        </div>
      )}
    </div>
  );
}