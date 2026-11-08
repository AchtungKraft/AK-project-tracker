import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { cents, METHOD_LABEL } from "./fundingFormat";

const field = "h-8 bg-gray-950 border-gray-700 text-white text-xs";

export default function MilestoneEditorRow({ row, index, options, onChange, onRemove }) {
  const set = (patch) => onChange({ ...row, ...patch });
  const cat = options.categories.find((c) => c.id === row.scope_category_id);
  const groups = cat ? options.groups.filter((g) => g.request_id === cat.request_id) : options.groups;
  return (
    <div className="rounded-md border border-gray-800 bg-gray-900/40 p-2 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_190px_130px_130px_auto] gap-2 items-end">
        <Input aria-label={`Milestone ${index + 1} name`} value={row.name} maxLength={120} placeholder="Milestone name" className={field} onChange={(e) => set({ name: e.target.value })} />
        <Select value={row.method} onValueChange={(v) => set({ method: v })}>
          <SelectTrigger className={field}><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(METHOD_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {row.method === "FIXED_PARTS_FUNDING"
          ? <Input aria-label="Amount" value={row.amount} inputMode="decimal" placeholder="Amount $" className={field} onChange={(e) => set({ amount: e.target.value })} />
          : <Input aria-label="Percent" value={row.percent} inputMode="decimal" placeholder="Percent %" className={field} onChange={(e) => set({ percent: e.target.value })} />}
        <Input aria-label="Target date" type="date" value={row.target_date} className={field} onChange={(e) => set({ target_date: e.target.value })} />
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 text-gray-400 hover:text-red-400" aria-label="Remove milestone"><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_minmax(0,2fr)] gap-2">
        <Select value={row.scope_category_id || "none"} onValueChange={(v) => set({ scope_category_id: v === "none" ? "" : v, scope_group_id: "" })}>
          <SelectTrigger className={field}><SelectValue placeholder="Scope category (optional)" /></SelectTrigger>
          <SelectContent><SelectItem value="none">No category</SelectItem>{options.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={row.scope_group_id || "none"} onValueChange={(v) => set({ scope_group_id: v === "none" ? "" : v })}>
          <SelectTrigger className={field}><SelectValue placeholder="Scope group (optional)" /></SelectTrigger>
          <SelectContent><SelectItem value="none">No group</SelectItem>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input aria-label="Notes" value={row.notes} maxLength={2000} placeholder="Notes" className={field} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[11px]">
        <span className="text-gray-500">Draft · planned only, not invoice eligible</span>
        {row.err ? <span className="text-red-400">{row.err}</span> : <span className="text-violet-300">Calculated: {cents(row.calc)}</span>}
      </div>
    </div>
  );
}