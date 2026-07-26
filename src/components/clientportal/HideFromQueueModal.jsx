import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Clock } from "lucide-react";
import { format, addDays, startOfWeek, addWeeks } from "date-fns";
import { cn } from "@/lib/utils";

const QUICK_OPTIONS = [
  { label: "Tomorrow", getValue: () => format(addDays(new Date(), 1), 'yyyy-MM-dd') },
  { label: "Next Week", getValue: () => format(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), 'yyyy-MM-dd') },
  { label: "Choose Date", value: 'custom' },
  { label: "Until I Resume", value: null },
];

export default function HideFromQueueModal({ open, onClose, onConfirm, isSaving }) {
  const [selectedOption, setSelectedOption] = useState('tomorrow'); // default to tomorrow
  const [customDate, setCustomDate] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);

  const handleConfirm = () => {
    let resumeDate = null;
    if (selectedOption === 'custom' && customDate) {
      resumeDate = format(customDate, 'yyyy-MM-dd');
    } else if (selectedOption && selectedOption !== 'custom' && selectedOption !== 'no_resume') {
      resumeDate = selectedOption;
    }
    onConfirm(resumeDate);
  };

  const handleOptionClick = (opt) => {
    if (opt.value === 'custom') {
      setSelectedOption('custom');
    } else if (opt.getValue) {
      setSelectedOption(opt.getValue());
    } else {
      setSelectedOption('no_resume');
    }
  };

  const isConfirmDisabled = isSaving || (selectedOption === 'custom' && !customDate) || !selectedOption;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            Work on this Later
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            This request will be removed from today's operational queue. It remains active, searchable, and visible within the project. The client experience is unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {QUICK_OPTIONS.map((opt) => {
            const optValue = opt.getValue ? opt.getValue() : (opt.value === null ? 'no_resume' : opt.value);
            const isSelected = opt.value === 'custom'
              ? selectedOption === 'custom'
              : opt.value === null
                ? selectedOption === 'no_resume'
                : selectedOption === optValue;

            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => handleOptionClick(opt)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm",
                  isSelected
                    ? "bg-red-600/20 border border-red-500/50 text-white"
                    : "bg-gray-800/50 text-gray-300 hover:bg-gray-800"
                )}
              >
                {opt.label}
                {opt.getValue && (
                  <span className="text-gray-500 ml-2 text-xs">
                    {format(new Date(opt.getValue()), 'MMM d')}
                  </span>
                )}
              </button>
            );
          })}

          {selectedOption === 'custom' && (
            <Popover open={showCalendar} onOpenChange={setShowCalendar}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-800 border-gray-700 text-white mt-2"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customDate ? format(customDate, 'PPP') : 'Pick resume date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={(d) => { setCustomDate(d); setShowCalendar(false); }}
                  disabled={(d) => d < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
        </div>

        <p className="text-[11px] text-gray-500 px-1">
          This does not archive the request or affect the client. It only removes it from the daily Action Queue.
        </p>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-600 text-gray-300"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="bg-gray-700 hover:bg-gray-600 text-white"
          >
            <Clock className="w-4 h-4 mr-1" />
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}