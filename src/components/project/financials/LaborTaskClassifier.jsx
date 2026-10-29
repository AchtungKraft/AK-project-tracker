import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import LaborTaskRow from "./LaborTaskRow";
import LaborClassifyBar from "./LaborClassifyBar";

const FILTERS = [["needs", "Needs review"], ["all", "All"], ["BILLABLE", "Billable"], ["INCLUDED_IN_SERVICE", "In service"], ["NON_BILLABLE", "Non-billable"]];
const needsReview = (t) => t.issues.length > 0 || (t.billing_type === "UNCLASSIFIED" && (t.logged > 0 || t.remaining_hours > 0));

// Filter/search state is owned by the parent so it survives drawer close/reopen.
export default function LaborTaskClassifier({ projectId, lb, q, setQ, filter, setFilter }) {
  const [selected, setSelected] = useState(new Set());
  // Tasks updated in this view stay visible (flagged) until the filter or search changes.
  const [kept, setKept] = useState(new Set());
  useEffect(() => setKept(new Set()), [filter, q]);
  const keep = (ids) => setKept((s) => new Set([...s, ...ids]));
  const matches = (t) => filter === "all" || (filter === "needs" ? needsReview(t) : t.billing_type === filter);
  const svcName = useMemo(() => new Map(lb.services.map((s) => [s.id, s.description])), [lb.services]);
  const rows = useMemo(() => lb.tasks
    .filter((t) => !t.cancelled)
    .filter((t) => matches(t) || kept.has(t.id))
    .filter((t) => !q || t.name?.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.logged - a.logged), [lb.tasks, filter, q, kept]);
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="mt-3 border-t border-gray-800 pt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-2 top-2 text-gray-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="h-8 pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-2 py-1 rounded text-xs ${filter === k ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300"}`}>{label}</button>
          ))}
        </div>
      </div>
      <LaborClassifyBar projectId={projectId} services={lb.services} selectedIds={[...selected]} onDone={() => { keep(selected); setSelected(new Set()); }} />
      <div className="max-h-[65vh] overflow-y-auto rounded border border-gray-800">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] uppercase text-gray-500 bg-black/40 sticky top-0">
          <input type="checkbox" checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(rows.map((r) => r.id)))} />
          <span className="flex-1">Task ({rows.length})</span><span className="w-40 text-right hidden md:block">Logged / remaining</span><span className="w-28 text-right">Labor value</span>
        </div>
        {rows.length === 0 && <div className="p-3 text-xs text-gray-500">No tasks match.</div>}
        {rows.map((t) => <LaborTaskRow key={t.id} projectId={projectId} services={lb.services} t={t} svcName={svcName} checked={selected.has(t.id)} onToggle={() => toggle(t.id)} movedOut={kept.has(t.id) && !matches(t)} onSaved={() => keep([t.id])} />)}
      </div>
    </div>
  );
}