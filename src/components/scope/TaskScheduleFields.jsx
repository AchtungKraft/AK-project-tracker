import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import AssigneeCombobox from "./AssigneeCombobox";
import useScopeAssigneeOptions from "./useScopeAssigneeOptions";
import { scheduleError } from "./scheduleDraft";

// Assignee, start/due dates and priority for converted tasks. In bulk mode these are
// shared defaults copied onto each new task. All optional.
export default function TaskScheduleFields({ value, onChange, bulk = false }) {
  const { options, isLoading } = useScopeAssigneeOptions();
  const set = (patch) => onChange({ ...value, ...patch });
  const error = scheduleError(value);
  return (
    <div className="min-w-0 space-y-2">
      {bulk && <p className="text-[11px] text-gray-500">Defaults for every task created below. Optional, and each task can be edited later.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="min-w-0 sm:col-span-2">
          <Label className="text-gray-400 text-xs">{bulk ? "Assigned to (all tasks)" : "Assigned to"}</Label>
          <AssigneeCombobox value={value.assignedTeamMemberId} onChange={id => set({ assignedTeamMemberId: id })} options={options} loading={isLoading} />
        </div>
        <div className="min-w-0">
          <Label className="text-gray-400 text-xs">{bulk ? "Start date (all tasks)" : "Start date"}</Label>
          <Input type="date" value={value.startDate} onChange={e => set({ startDate: e.target.value })} className="w-full min-w-0 bg-gray-800 border-gray-700 text-white" />
        </div>
        <div className="min-w-0">
          <Label className="text-gray-400 text-xs">{bulk ? "Due date (all tasks)" : "Due date"}</Label>
          <Input type="date" value={value.dueDate} min={value.startDate || undefined} onChange={e => set({ dueDate: e.target.value })} className="w-full min-w-0 bg-gray-800 border-gray-700 text-white" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <Checkbox checked={value.isPriority} onCheckedChange={v => set({ isPriority: v === true })} />
        {bulk ? "Mark all created tasks as priority" : "Mark as priority"}
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}