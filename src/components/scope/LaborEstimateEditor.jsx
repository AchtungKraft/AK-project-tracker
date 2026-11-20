import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { laborAgg, formatAgg, formatLaborHours, formatLaborCost } from "./scopeEstimate";
import EstimateStateHint from "./EstimateStateHint";

/**
 * Inline labor estimate rows for the Scope Item editor.
 * Low only = exact, High only = up to, both = range, neither = description only, TBD = explicit.
 * estimates: [{ labor_group_id, hours_min, hours_max, hours_tbd, rate_snapshot, labor_group_name_snapshot, description }]
 */
export default function LaborEstimateEditor({ laborGroups = [], estimates = [], onChange, isMobile = false }) {
  const available = laborGroups.filter(g => g.is_active);

  const update = (idx, field, value) => onChange(estimates.map((e, i) => i === idx ? { ...e, [field]: value } : e));

  const addRow = () => {
    if (available.length === 0) return;
    const g = available[0];
    onChange([...estimates, { labor_group_id: g.id, labor_group_name_snapshot: g.name, hours_min: "", hours_max: "", hours_tbd: false, rate_snapshot: g.hourly_rate, description: '' }]);
  };

  const removeRow = (idx) => onChange(estimates.filter((_, i) => i !== idx));

  const selectGroup = (idx, groupId) => {
    const g = laborGroups.find(lg => lg.id === groupId);
    if (!g) return;
    onChange(estimates.map((e, i) => i === idx ? { ...e, labor_group_id: groupId, labor_group_name_snapshot: g.name, rate_snapshot: g.hourly_rate } : e));
  };

  const totals = laborAgg(estimates);
  const hoursTotal = formatAgg(totals.hours, 'hours');
  const costTotal = formatAgg(totals.dollars);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-red-400 uppercase tracking-wide font-semibold">Ächtung Kraft Labor</label>
        <Button type="button" size="sm" variant="ghost" onClick={addRow} disabled={available.length === 0}
          className="h-6 text-[11px] text-gray-400 hover:text-white gap-1 px-2">
          <Plus className="w-3 h-3" /> Add Labor
        </Button>
      </div>

      {estimates.map((est, idx) => {
        const cost = est.hours_tbd ? null : formatLaborCost(est);
        return (
          <div key={idx} className={cn("flex items-center gap-2 flex-wrap bg-gray-800/40 rounded-md p-2 border border-gray-700/30", isMobile && "flex-col items-stretch")}>
            <Select value={est.labor_group_id} onValueChange={(v) => selectGroup(idx, v)}>
              <SelectTrigger className="h-7 w-36 bg-gray-800 border-gray-700 text-white text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {available.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 flex-wrap">
              <Checkbox checked={!!est.hours_tbd} onCheckedChange={v => update(idx, 'hours_tbd', !!v)} />
              <span className="text-xs text-gray-400 mr-1">TBD</span>
              {!est.hours_tbd && (
                <>
                  <Input type="number" step="0.5" min="0" value={est.hours_min ?? ''} onChange={e => update(idx, 'hours_min', e.target.value)}
                    placeholder="Low" className="h-7 w-16 bg-gray-800 border-gray-700 text-white text-xs" />
                  <span className="text-xs text-gray-500">–</span>
                  <Input type="number" step="0.5" min="0" value={est.hours_max ?? ''} onChange={e => update(idx, 'hours_max', e.target.value)}
                    placeholder="High" className="h-7 w-16 bg-gray-800 border-gray-700 text-white text-xs" />
                  <span className="text-[10px] text-gray-500">hrs</span>
                </>
              )}
            </div>

            <span className="text-[10px] text-gray-500">${est.rate_snapshot}/hr</span>
            <EstimateStateHint label={formatLaborHours(est)} sub={cost} />

            <Input value={est.description || ''} onChange={e => update(idx, 'description', e.target.value)} placeholder="Operation / deliverable description" className="h-8 w-full bg-gray-800 border-gray-700 text-white text-xs" />
            <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(idx)} className="h-6 w-6 p-0 text-gray-600 hover:text-red-400 ml-auto">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        );
      })}

      {estimates.length > 0 && (hoursTotal || costTotal) && (
        <div className="flex items-center gap-4 px-2 pt-1 border-t border-gray-700/30 text-[11px] flex-wrap">
          <span className="text-gray-500">TOTAL AK HOURS</span>
          <span className="text-white font-medium">{hoursTotal}</span>
          {costTotal && <><span className="text-gray-500 ml-4">AK LABOR</span><span className="text-emerald-400 font-medium">{costTotal}</span></>}
        </div>
      )}

      {estimates.length === 0 && (
        <p className="text-[11px] text-gray-600 italic pl-1">No AK labor estimates</p>
      )}
    </div>
  );
}