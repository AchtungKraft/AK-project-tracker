import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUICK_ESTIMATE_OPTIONS, parseEstimateInput } from "@/lib/estimateUtils";

/**
 * Compact time input for estimated/actual hours in forms.
 * Shows quick-select chips + a text input for custom values.
 * Stores decimal hours internally.
 */
export default function TimeEstimateInput({ value, onChange, placeholder = "Est. hours", className = "" }) {
  const [customMode, setCustomMode] = useState(false);

  const handleQuickSelect = (hours) => {
    if (value === hours) {
      onChange(null); // toggle off
    } else {
      onChange(hours);
    }
    setCustomMode(false);
  };

  const handleCustomInput = (e) => {
    const v = e.target.value;
    if (v === "") {
      onChange(null);
      return;
    }
    // Try parsing as flexible format first
    const parsed = parseEstimateInput(v);
    if (parsed != null) {
      onChange(parsed);
    } else {
      // Allow plain number entry
      const num = parseFloat(v);
      onChange(isNaN(num) ? null : num);
    }
  };

  const isQuickMatch = QUICK_ESTIMATE_OPTIONS.some(opt => opt.value === value);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-1">
        {QUICK_ESTIMATE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleQuickSelect(opt.value)}
            className={cn(
              "text-xs px-2 py-1 rounded transition-colors",
              value === opt.value
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
            )}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          className={cn(
            "text-xs px-2 py-1 rounded transition-colors border",
            !isQuickMatch && value != null
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border-gray-700"
          )}
        >
          Custom
        </button>
        {value != null && (
          <button
            type="button"
            onClick={() => { onChange(null); setCustomMode(false); }}
            className="text-xs px-2 py-1 rounded bg-gray-800 text-red-400 hover:bg-red-900/30 border border-gray-700 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {(customMode || (!isQuickMatch && value != null)) && (
        <div className="relative">
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
            placeholder="e.g. 2.5, 1.5"
            className="pl-8 bg-gray-800 border-gray-700 text-white h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Formats decimal hours into a compact display string.
 * e.g. 0.5 → "30m", 1 → "1h", 2.5 → "2h 30m"
 */
export function formatHours(hours) {
  if (hours == null || hours === 0) return null;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const hrs = Math.floor(hours);
  const mins = Math.round((hours - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}