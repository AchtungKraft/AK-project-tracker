import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer } from "lucide-react";

const SECTION_OPTIONS = [
  { key: "dueThisWeek", label: "Due This Week", defaultOn: true },
  { key: "overdue", label: "Overdue", defaultOn: true },
  { key: "upcoming", label: "Upcoming", defaultOn: false },
  { key: "unscheduled", label: "Unscheduled", defaultOn: false },
];

const FIELD_OPTIONS = [
  { key: "showAssignee", label: "Show Assignee", defaultOn: true },
  { key: "showDueDate", label: "Show Due Date", defaultOn: true },
  { key: "showEstimate", label: "Show Estimated Time", defaultOn: true },
  { key: "showActualBlank", label: "Show Actual Time Blank", defaultOn: true },
  { key: "showNotesLine", label: "Show Notes Line", defaultOn: true },
  { key: "showCompleted", label: "Show Completed Tasks", defaultOn: false },
];

export default function WorkloadPrintOptionsModal({ open, onClose, onPrint, sectionCounts }) {
  const [sections, setSections] = useState(() => {
    const m = {};
    SECTION_OPTIONS.forEach((s) => { m[s.key] = s.defaultOn; });
    return m;
  });

  const [fields, setFields] = useState(() => {
    const m = {};
    FIELD_OPTIONS.forEach((f) => { m[f.key] = f.defaultOn; });
    return m;
  });

  const toggleSection = (key) => setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleField = (key) => setFields((prev) => ({ ...prev, [key]: !prev[key] }));

  const selectedSectionKeys = Object.keys(sections).filter((k) => sections[k]);
  const totalTasks = selectedSectionKeys.reduce((sum, k) => sum + (sectionCounts[k] || 0), 0);

  const handlePrint = () => {
    onPrint({ sections: selectedSectionKeys, fields });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Printer className="w-4 h-4" />
            Print Workload Checklist
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Sections */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Sections to Print</p>
            <div className="space-y-1.5">
              {SECTION_OPTIONS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/40 rounded px-2 py-1">
                  <Checkbox
                    checked={sections[s.key]}
                    onCheckedChange={() => toggleSection(s.key)}
                    className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <span className="text-sm text-gray-200">{s.label}</span>
                  <span className="ml-auto text-xs text-gray-500 tabular-nums">{sectionCounts[s.key] || 0}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Printed Fields</p>
            <div className="space-y-1.5">
              {FIELD_OPTIONS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/40 rounded px-2 py-1">
                  <Checkbox
                    checked={fields[f.key]}
                    onCheckedChange={() => toggleField(f.key)}
                    className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <span className="text-sm text-gray-200">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 text-center">
            {totalTasks} tasks across {selectedSectionKeys.length} sections will be printed
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300 hover:bg-gray-800">
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={selectedSectionKeys.length === 0}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Printer className="w-4 h-4 mr-1" />
            Print {totalTasks} Tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}