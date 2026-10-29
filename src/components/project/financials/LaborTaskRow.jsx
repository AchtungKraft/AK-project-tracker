import React, { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { money, hrs } from "./finFormat";
import LaborInlineClassify from "./LaborInlineClassify";

const TYPE = { UNCLASSIFIED: ["Unclassified", "text-amber-400"], BILLABLE: ["Billable", "text-green-400"], INCLUDED_IN_SERVICE: ["In service", "text-blue-300"], NON_BILLABLE: ["Non-billable", "text-gray-400"] };
const ISSUE = { rate_not_set: "Billing rate not set", invalid_service_link: "Linked service missing — review" };

export default function LaborTaskRow({ projectId, services, t, svcName, checked, onToggle, movedOut, onSaved }) {
  const [open, setOpen] = useState(false);
  const [label, tone] = TYPE[t.billing_type] || TYPE.UNCLASSIFIED;
  return (
    <div className="border-t border-gray-800 px-2 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <button onClick={() => setOpen((o) => !o)} className="text-gray-500">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button>
        <div className="flex-1 min-w-0">
          <div className="text-gray-200 truncate" title={t.name}>{t.name}</div>
          <div className="text-[11px]">
            <span className={tone}>{label}</span>
            {t.service_commitment_id && <span className="text-gray-500"> · {svcName.get(t.service_commitment_id) || "missing service"}</span>}
            {t.rate_override != null && <span className="text-gray-500"> · override {money(t.rate_override)}/h</span>}
            {t.done && <span className="text-gray-500"> · done</span>}
            {t.issues.map((i) => <span key={i} className="text-red-400"> · {ISSUE[i]}</span>)}
          </div>
          {movedOut && <div className="text-[11px] text-green-400">Updated — no longer matches this filter; it will move out when the filter changes.</div>}
          <div className="mt-1"><LaborInlineClassify projectId={projectId} t={t} services={services} onSaved={onSaved} /></div>
        </div>
        <span className="w-40 text-right tabular-nums text-gray-400 hidden md:block">{hrs(t.logged)} / {hrs(t.remaining_hours)}</span>
        <span className="w-28 text-right tabular-nums">{t.billing_type === "BILLABLE" ? money(t.billable_to_date) : "—"}</span>
      </div>
      {open && (
        <div className="ml-10 mt-1 space-y-0.5 text-[11px] text-gray-400">
          <div>Estimate {hrs(t.estimated_hours)} · logged {hrs(t.logged)} · remaining {hrs(t.remaining_hours)} · rate {t.effective_rate == null ? "not set" : `${money(t.effective_rate)}/h`}
            {t.billing_type === "BILLABLE" && t.effective_rate != null && ` · ${hrs(t.logged)} × ${money(t.effective_rate)} = ${money(t.billable_to_date)}; remaining ${money(t.projected_remaining)}`}</div>
          {t.entries.length === 0 ? <div>No time entries.</div> : t.entries.map((e) => (
            <div key={e.id} className="tabular-nums">{e.work_date || "no date"} · {hrs(e.hours)}{e.by && ` · ${e.by}`}</div>
          ))}
        </div>
      )}
    </div>
  );
}