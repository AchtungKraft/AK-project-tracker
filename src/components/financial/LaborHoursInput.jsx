import React from "react";
import { Input } from "@/components/ui/input";

// Hours to bill for one labor row (partial allocation). Shows an error above the available hours instead of capping.
export default function LaborHoursInput({ value, max, onChange }) {
  const over = Number(value) > max + 1e-6;
  return (
    <div className="flex flex-col items-end shrink-0" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <Input type="number" min="0.25" step="0.25" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={over ? "h-7 w-20 text-right border-red-500" : "h-7 w-20 text-right"} aria-label="Hours to bill" />
        <span className="text-xs text-gray-500">h</span>
      </div>
      {over && <span className="text-[10px] text-red-400">Max {max}h</span>}
    </div>
  );
}