import React, { useState, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationCompact, parseEstimateInput, QUICK_ESTIMATE_OPTIONS } from "@/lib/estimateUtils";

export default function InlineEstimateEditor({ value, onSave, disabled = false, className }) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const display = formatDurationCompact(value);

  const handleQuickSelect = useCallback(async (hours) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(hours);
      setOpen(false);
      setShowCustom(false);
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }, [onSave, saving]);

  const handleClear = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(null);
      setOpen(false);
      setShowCustom(false);
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }, [onSave, saving]);

  const handleCustomSave = useCallback(async () => {
    const parsed = parseEstimateInput(customInput);
    if (parsed == null) {
      setError("Invalid format");
      return;
    }
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed);
      setOpen(false);
      setShowCustom(false);
      setCustomInput("");
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }, [customInput, onSave, saving]);

  const handleOpenChange = useCallback((nextOpen) => {
    if (disabled) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setShowCustom(false);
      setCustomInput("");
      setError(null);
    }
  }, [disabled]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "text-[10px] w-10 shrink-0 text-right tabular-nums transition-colors rounded px-0.5",
            display
              ? "text-gray-500 hover:text-blue-400"
              : "text-gray-700 hover:text-gray-400 opacity-0 group-hover/row:opacity-100",
            disabled && "pointer-events-none",
            className
          )}
          title={display ? `Est: ${display} — click to edit` : "Add estimate"}
          onClick={e => e.stopPropagation()}
        >
          {display || "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-48 p-2 bg-gray-900 border-gray-700"
        side="left"
        align="start"
        onClick={e => e.stopPropagation()}
      >
        {!showCustom ? (
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Estimated Time</p>
            <div className="grid grid-cols-4 gap-1">
              {QUICK_ESTIMATE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleQuickSelect(opt.value)}
                  disabled={saving}
                  className={cn(
                    "text-xs px-1.5 py-1 rounded transition-colors",
                    value === opt.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white",
                    saving && "opacity-50"
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setShowCustom(true)}
                disabled={saving}
                className="text-xs px-1.5 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors col-span-1"
              >
                …
              </button>
            </div>
            {value != null && value > 0 && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="w-full text-xs text-gray-500 hover:text-red-400 py-1 transition-colors flex items-center justify-center gap-1 mt-1"
              >
                <X className="w-2.5 h-2.5" /> Clear
              </button>
            )}
            {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Custom Time</p>
            <Input
              autoFocus
              value={customInput}
              onChange={e => { setCustomInput(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === "Enter") handleCustomSave(); if (e.key === "Escape") setShowCustom(false); }}
              placeholder="e.g. 1.5, 30m, 1h 15m"
              className="h-7 text-xs bg-gray-800 border-gray-700 text-white"
            />
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setShowCustom(false)} className="flex-1 h-6 text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleCustomSave} disabled={saving} className="flex-1 h-6 text-xs bg-blue-600 hover:bg-blue-700">
                Save
              </Button>
            </div>
            {error && <p className="text-[10px] text-red-400">{error}</p>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}