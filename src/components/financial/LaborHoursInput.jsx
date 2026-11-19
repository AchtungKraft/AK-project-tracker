import React from "react";
import { Input } from "@/components/ui/input";

// Quantity to bill for one row (partial allocation): hours for labor, units for parts.
// Shows an error above the available amount instead of capping.
export default function LaborHoursInput({ value, max, onChange, unit = "h" }) {
  const over = Number(value) > max + 1e-6;
  const isHours = unit === "h";
  return (
    <div className="flex flex-col items-end shrink-0" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <Input type="number" min={isHours ? "0.25" : "0"} step={isHours ? "0.25" : "any"} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={over ? "h-7 w-20 text-right border-red-500" : "h-7 w-20 text-right"} aria-label={isHours ? "Hours to bill" : "Quantity to bill"} />
        <span className="text-xs text-gray-500">{unit}</span>
      </div>
      {over && <span className="text-[10px] text-red-400">Max {max}{isHours ? "h" : ""}</span>}
    </div>
  );
}