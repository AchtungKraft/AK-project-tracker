import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";

/**
 * Compact inline due date picker with popover calendar.
 * Click icon/badge → popover → pick date → immediate save.
 */
export default function InlineDueDatePicker({ dueDate, isOverdue, onDateChange, size = "sm" }) {
  const [open, setOpen] = useState(false);

  const handleSelect = (date) => {
    onDateChange(date ? format(date, 'yyyy-MM-dd') : null);
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onDateChange(null);
    setOpen(false);
  };

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
            dueDate
              ? isOverdue
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium'
                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
          }`}
        >
          <CalendarIcon className={iconSize} />
          {dueDate ? format(new Date(dueDate), 'MMM d') : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-gray-900 border-gray-700"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <Calendar
          mode="single"
          selected={dueDate ? new Date(dueDate) : undefined}
          onSelect={handleSelect}
          className="rounded-md"
        />
        {dueDate && (
          <div className="px-3 pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="w-full text-gray-400 hover:text-red-400 text-xs h-7"
            >
              <X className="w-3 h-3 mr-1" />
              Clear Due Date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Bulk due date picker for bucket headers.
 * Applies selected date to all requests in a bucket.
 */
export function BulkDueDatePicker({ requestCount, onBulkDateChange }) {
  const [open, setOpen] = useState(false);

  const handleSelect = (date) => {
    if (date) {
      onBulkDateChange(format(date, 'yyyy-MM-dd'));
    }
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onBulkDateChange(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
          title={`Set due date for all ${requestCount} requests`}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-gray-900 border-gray-700"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-3 pb-1">
          <p className="text-xs text-gray-400 mb-1">
            Set date for all {requestCount} requests
          </p>
        </div>
        <Calendar
          mode="single"
          onSelect={handleSelect}
          className="rounded-md"
        />
        <div className="px-3 pb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="w-full text-gray-400 hover:text-red-400 text-xs h-7"
          >
            <X className="w-3 h-3 mr-1" />
            Clear All Dates
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}