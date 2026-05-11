import React from "react";
import { Input } from "@/components/ui/input";
import { Clock } from "lucide-react";

/**
 * Compact time input for estimated/actual hours.
 * Stores decimal hours internally, displays as h.
 */
export default function TimeEstimateInput({ value, onChange, placeholder = "Est. hours", className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
      <Input
        type="number"
        step="0.25"
        min="0"
        max="999"
        inputMode="decimal"
        value={value || ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : parseFloat(v));
        }}
        placeholder={placeholder}
        className={`pl-8 bg-gray-800 border-gray-700 text-white h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
      />
    </div>
  );
}

/**
 * Formats decimal hours into a compact display string.
 * e.g. 0.5 → "30m", 1 → "1h", 2.5 → "2.5h"
 */
export function formatHours(hours) {
  if (hours == null || hours === 0) return null;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours % 1 === 0) return `${hours}h`;
  return `${hours}h`;
}