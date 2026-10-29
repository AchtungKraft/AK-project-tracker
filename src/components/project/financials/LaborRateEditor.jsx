import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Loader2 } from "lucide-react";
import { money } from "./finFormat";
import useLaborBillingAction from "./useLaborBillingAction";

export default function LaborRateEditor({ projectId, lb }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const action = useLaborBillingAction(projectId);
  const save = (rate) => action.mutate({ action: "set_project_rate", rate }, { onSuccess: () => setEditing(false) });

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span>Project billing rate
          {lb.rate_set_by && <span className="block text-[11px] text-gray-500">Set by {lb.rate_set_by} · {new Date(lb.rate_set_at).toLocaleDateString()}</span>}
        </span>
        <span className="flex items-center gap-1">
          {lb.project_rate == null ? <span className="text-amber-400">Billing rate not set</span> : <span className="tabular-nums">{money(lb.project_rate)}/h</span>}
          <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400" onClick={() => { setValue(lb.project_rate ?? ""); setEditing(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
        </span>
      </div>
    );
  }
  const n = value === "" ? null : Number(value);
  const invalid = n != null && (!Number.isFinite(n) || n < 0);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-gray-400">$/h</span>
      <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-28" placeholder="e.g. 125" />
      <Button size="sm" disabled={invalid || n == null || action.isPending} onClick={() => save(n)} className="bg-red-600 hover:bg-red-700 h-8">
        {action.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
      </Button>
      {lb.project_rate != null && <Button size="sm" variant="ghost" className="h-8 text-gray-400" disabled={action.isPending} onClick={() => save(null)}>Clear</Button>}
      <Button size="sm" variant="ghost" className="h-8 text-gray-400" onClick={() => setEditing(false)}>Cancel</Button>
      {invalid && <span className="text-xs text-red-400">Enter a non-negative amount</span>}
    </div>
  );
}