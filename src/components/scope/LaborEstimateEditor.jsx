import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline labor estimate rows for the Scope Item editor.
 * laborGroups: available ScopeLaborGroup records (active ones).
 * estimates: array of { labor_group_id, hours_min, hours_max, rate_snapshot, labor_group_name_snapshot }
 * onChange: called with updated array.
 */
export default function LaborEstimateEditor({ laborGroups = [], estimates = [], onChange, isMobile = false }) {
  const usedGroupIds = new Set(estimates.map(e => e.labor_group_id));
  const available = laborGroups.filter(g => g.is_active && !usedGroupIds.has(g.id));

  const update = (idx, field, value) => {
    const next = estimates.map((e, i) => i === idx ? { ...e, [field]: value } : e);
    onChange(next);
  };

  const addRow = () => {
    if (available.length === 0) return;
    const g = available[0];
    onChange([...estimates, {
      labor_group_id: g.id,
      labor_group_name_snapshot: g.name,
      hours_min: "",
      hours_max: "",
      rate_snapshot: g.hourly_rate,
    }]);
  };

  const removeRow = (idx) => {
    onChange(estimates.filter((_, i) => i !== idx));
  };

  const selectGroup = (idx, groupId) => {
    const g = laborGroups.find(lg => lg.id === groupId);
    if (!g) return;
    const next = estimates.map((e, i) => i === idx ? {
      ...e,
      labor_group_id: groupId,
      labor_group_name_snapshot: g.name,
      rate_snapshot: g.hourly_rate,
    } : e);
    onChange(next);
  };

  // Totals
  let totalHMin = 0, totalHMax = 0, totalCostMin = 0, totalCostMax = 0;
  for (const e of estimates) {
    const hMin = Number(e.hours_min) || 0;
    const hMax = Number(e.hours_max) || 0;
    totalHMin += hMin;
    totalHMax += hMax;
    totalCostMin += hMin * (e.rate_snapshot || 0);
    totalCostMax += hMax * (e.rate_snapshot || 0);
  }

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
        const costMin = (Number(est.hours_min) || 0) * (est.rate_snapshot || 0);
        const costMax = (Number(est.hours_max) || 0) * (est.rate_snapshot || 0);
        // Available groups for this row: current + unselected
        const rowAvailable = laborGroups.filter(g => g.is_active && (g.id === est.labor_group_id || !usedGroupIds.has(g.id) || estimates[idx].labor_group_id === g.id));

        return (
          <div key={idx} className={cn("flex items-center gap-2 flex-wrap bg-gray-800/40 rounded-md p-2 border border-gray-700/30", isMobile && "flex-col items-stretch")}>
            <Select value={est.labor_group_id} onValueChange={(v) => selectGroup(idx, v)}>
              <SelectTrigger className="h-7 w-36 bg-gray-800 border-gray-700 text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {laborGroups.filter(g => g.is_active).map(g => (
                  <SelectItem key={g.id} value={g.id} disabled={usedGroupIds.has(g.id) && g.id !== est.labor_group_id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <Input type="number" step="0.5" min="0" value={est.hours_min} onChange={e => update(idx, 'hours_min', e.target.value)}
                placeholder="Min" className="h-7 w-16 bg-gray-800 border-gray-700 text-white text-xs" />
              <span className="text-xs text-gray-500">–</span>
              <Input type="number" step="0.5" min="0" value={est.hours_max} onChange={e => update(idx, 'hours_max', e.target.value)}
                placeholder="Max" className="h-7 w-16 bg-gray-800 border-gray-700 text-white text-xs" />
              <span className="text-[10px] text-gray-500">hrs</span>
            </div>

            <span className="text-[10px] text-gray-500">${est.rate_snapshot}/hr</span>

            {(costMin > 0 || costMax > 0) && (
              <span className="text-[10px] text-emerald-400 font-medium">
                ${costMin.toLocaleString()}–${costMax.toLocaleString()}
              </span>
            )}

            <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(idx)} className="h-6 w-6 p-0 text-gray-600 hover:text-red-400 ml-auto">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        );
      })}

      {estimates.length > 0 && (totalHMin > 0 || totalHMax > 0) && (
        <div className="flex items-center gap-4 px-2 pt-1 border-t border-gray-700/30 text-[11px]">
          <span className="text-gray-500">TOTAL AK HOURS</span>
          <span className="text-white font-medium">{totalHMin}–{totalHMax} hrs</span>
          <span className="text-gray-500 ml-4">AK LABOR</span>
          <span className="text-emerald-400 font-medium">${totalCostMin.toLocaleString()}–${totalCostMax.toLocaleString()}</span>
        </div>
      )}

      {estimates.length === 0 && (
        <p className="text-[11px] text-gray-600 italic pl-1">No AK labor estimates</p>
      )}
    </div>
  );
}