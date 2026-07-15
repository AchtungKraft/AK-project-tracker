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

export default function WorkloadProjectPrintModal({
  open,
  onClose,
  project,
  sectionTaskCount = 0,
  allOpenTaskCount = 0,
  onPrint,
}) {
  const [scope, setScope] = useState("current"); // "current" or "all"
  const [includeChecklists, setIncludeChecklists] = useState(false);
  const [includeCompletedChecklists, setIncludeCompletedChecklists] = useState(false);
  const [includeCompletionMarks, setIncludeCompletionMarks] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);

  const count = scope === "current" ? sectionTaskCount : allOpenTaskCount;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white text-sm">
            <Printer className="w-4 h-4" />
            Print Work Packet
          </DialogTitle>
          <p className="text-xs text-gray-400 truncate">{project?.name}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Print Scope</p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/40 rounded px-2 py-1.5">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "current"}
                  onChange={() => setScope("current")}
                  className="accent-red-600"
                />
                <div className="flex-1">
                  <span className="text-sm text-gray-200">Current Workload View</span>
                  <span className="ml-2 text-xs text-gray-500">{sectionTaskCount} tasks</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/40 rounded px-2 py-1.5">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  className="accent-red-600"
                />
                <div className="flex-1">
                  <span className="text-sm text-gray-200">All Open Tasks</span>
                  <span className="ml-2 text-xs text-gray-500">{allOpenTaskCount} tasks</span>
                </div>
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Options</p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/40 rounded px-2 py-1">
                <Checkbox
                  checked={includeChecklists}
                  onCheckedChange={(v) => { setIncludeChecklists(v); if (!v) setIncludeCompletedChecklists(false); }}
                  className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                />
                <span className="text-sm text-gray-200">Include Task Checklists</span>
              </label>
              {includeChecklists && (
                <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/40 rounded px-2 py-1 ml-5">
                  <Checkbox
                    checked={includeCompletedChecklists}
                    onCheckedChange={setIncludeCompletedChecklists}
                    className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <span className="text-sm text-gray-400">Include Completed Items</span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/40 rounded px-2 py-1">
                <Checkbox
                  checked={includeCompletionMarks}
                  onCheckedChange={setIncludeCompletionMarks}
                  className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                />
                <span className="text-sm text-gray-200">Completion & Status Marks</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/40 rounded px-2 py-1">
                <Checkbox
                  checked={includeNotes}
                  onCheckedChange={setIncludeNotes}
                  className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                />
                <span className="text-sm text-gray-200">Technician Notes Lines</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300 hover:bg-gray-800">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onPrint({ scope, includeChecklists, includeCompletedChecklists, includeCompletionMarks, includeNotes });
              onClose();
            }}
            disabled={count === 0}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Printer className="w-4 h-4 mr-1" />
            Print {count} Tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}