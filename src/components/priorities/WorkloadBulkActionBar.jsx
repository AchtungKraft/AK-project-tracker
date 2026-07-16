import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  X,
  CalendarPlus,
  ArrowRightLeft,
  User,
  CheckCircle2,
  Flame,
  Printer,
  Layers,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export default function WorkloadBulkActionBar({
  selectedCount,
  onClear,
  onSetDueDate,
  onShiftDates,
  onAssign,
  onSetStatus,
  onTogglePriority,
  onPrintSelected,
  onMovePhase,
  onBulkDelete,
  teamMembers = [],
  statuses = [],
  buckets = [],
  selectedTasks = [],
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [customDays, setCustomDays] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeMembers = useMemo(
    () => (teamMembers || []).filter((tm) => tm.active),
    [teamMembers]
  );
  const taskStatuses = useMemo(
    () =>
      (statuses || [])
        .filter((s) => s.scope === "Task" && s.active)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [statuses]
  );

  const handleShift = useCallback(
    (days) => {
      onShiftDates(days);
      setShiftOpen(false);
      setCustomDays("");
    },
    [onShiftDates]
  );

  const handleCustomShift = useCallback(() => {
    const parsed = parseInt(customDays, 10);
    if (!isNaN(parsed) && parsed !== 0) {
      handleShift(parsed);
    }
  }, [customDays, handleShift]);

  if (selectedCount === 0) return null;

  const SHIFT_PRESETS_LIST = [
    { label: "+1 Day", days: 1 },
    { label: "+3 Days", days: 3 },
    { label: "+1 Week", days: 7 },
    { label: "+2 Weeks", days: 14 },
    { label: "-1 Day", days: -1 },
    { label: "-1 Week", days: -7 },
  ];

  return (
    <div className="sticky bottom-0 z-30 bg-gray-900/95 backdrop-blur-sm border-t border-red-600/30 -mx-3 md:-mx-6 px-3 md:px-6 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-white tabular-nums shrink-0">
          {selectedCount} Task{selectedCount !== 1 ? "s" : ""} Selected
        </span>

        {/* PRIMARY: Shift Dates */}
        <Popover open={shiftOpen} onOpenChange={setShiftOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-7 text-xs gap-1">
              <ArrowRightLeft className="w-3 h-3" />
              Shift Dates
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 bg-gray-900 border-gray-700" side="top" align="start">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 px-1">Shift relative to current due date</p>
            <div className="grid grid-cols-2 gap-1 mb-2">
              {SHIFT_PRESETS_LIST.map((p) => (
                <button
                  key={p.days}
                  onClick={() => handleShift(p.days)}
                  className="text-xs text-gray-200 hover:bg-gray-800 hover:text-white rounded px-2 py-1.5 text-left transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 border-t border-gray-800 pt-2">
              <input
                type="number"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                placeholder="±days"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-20"
                onKeyDown={(e) => { if (e.key === "Enter") handleCustomShift(); }}
              />
              <Button size="sm" onClick={handleCustomShift} disabled={!customDays || isNaN(parseInt(customDays, 10))} className="h-7 text-xs bg-gray-700 hover:bg-gray-600">
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Set Due Date */}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="border-gray-700 text-gray-200 hover:bg-gray-800 h-7 text-xs gap-1">
              <CalendarPlus className="w-3 h-3" />
              Set Due Date
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-700" side="top" align="start">
            <Calendar
              mode="single"
              onSelect={(date) => {
                onSetDueDate(date);
                setDateOpen(false);
              }}
              className="bg-gray-900"
            />
          </PopoverContent>
        </Popover>

        {/* Assign */}
        <Popover open={assignOpen} onOpenChange={setAssignOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="border-gray-700 text-gray-200 hover:bg-gray-800 h-7 text-xs gap-1">
              <User className="w-3 h-3" />
              Assign
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1 bg-gray-900 border-gray-700" side="top" align="start">
            <div className="space-y-px max-h-52 overflow-y-auto">
              <button
                onClick={() => { onAssign(null); setAssignOpen(false); }}
                className="w-full text-left px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              >
                Unassigned
              </button>
              {activeMembers.map((tm) => (
                <button
                  key={tm.id}
                  onClick={() => { onAssign(tm.id); setAssignOpen(false); }}
                  className="w-full text-left px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  {tm.full_name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Status */}
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="border-gray-700 text-gray-200 hover:bg-gray-800 h-7 text-xs gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Status
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1 bg-gray-900 border-gray-700" side="top" align="start">
            <div className="space-y-px max-h-52 overflow-y-auto">
              {taskStatuses.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onSetStatus(s.id); setStatusOpen(false); }}
                  className="w-full text-left px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Priority */}
        <Button
          variant="outline"
          size="sm"
          onClick={onTogglePriority}
          className="border-gray-700 text-gray-200 hover:bg-gray-800 h-7 text-xs gap-1"
        >
          <Flame className="w-3 h-3" />
          Priority
        </Button>

        {/* Move Phase */}
        {onMovePhase && (
          <BulkPhasePopover buckets={buckets} onMovePhase={onMovePhase} selectedTasks={selectedTasks} />
        )}

        {/* Print Selected */}
        <Button
          variant="outline"
          size="sm"
          onClick={onPrintSelected}
          className="border-gray-700 text-gray-200 hover:bg-gray-800 h-7 text-xs gap-1"
        >
          <Printer className="w-3 h-3" />
          Print
        </Button>

        {/* Delete Selected */}
        {onBulkDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteConfirmOpen(true)}
            className="border-red-900/50 text-red-400 hover:bg-red-950/30 hover:text-red-300 h-7 text-xs gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </Button>
        )}

        {/* Clear */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-gray-400 hover:text-white h-7 text-xs gap-1 ml-auto"
        >
          <X className="w-3 h-3" />
          Clear
        </Button>
      </div>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-gray-900 border-red-900/30 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} Task{selectedCount !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-gray-400 space-y-2">
                <p>This will permanently delete the selected tasks. This action cannot be undone.</p>
                <div className="bg-gray-800/50 rounded-md px-3 py-2 space-y-0.5 text-xs max-h-40 overflow-y-auto">
                  {selectedTasks.map(t => (
                    <p key={t.id} className="text-gray-300 truncate">• {t.name}</p>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="border-gray-700 text-white hover:bg-gray-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={async (e) => {
                e.preventDefault();
                setIsDeleting(true);
                await onBulkDelete();
                setIsDeleting(false);
                setDeleteConfirmOpen(false);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Deleting...' : `Delete ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BulkPhasePopover({ buckets, onMovePhase, selectedTasks = [] }) {
  const [open, setOpen] = useState(false);

  // Same-project validation
  const projectIds = useMemo(() => {
    const s = new Set();
    selectedTasks.forEach(t => s.add(t.project_id || "__no_project__"));
    return s;
  }, [selectedTasks]);

  const isSingleProject = projectIds.size === 1;
  const singleProjectId = isSingleProject ? Array.from(projectIds)[0] : null;

  // Filter buckets to the single project
  const projectBuckets = useMemo(() => {
    if (!isSingleProject || !singleProjectId) return [];
    return buckets
      .filter(b => b.project_id === singleProjectId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [buckets, isSingleProject, singleProjectId]);

  const button = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "border-gray-700 text-gray-200 hover:bg-gray-800 h-7 text-xs gap-1",
        !isSingleProject && "opacity-50 cursor-not-allowed"
      )}
      disabled={!isSingleProject}
    >
      <Layers className="w-3 h-3" />
      Phase
    </Button>
  );

  if (!isSingleProject) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="top" className="bg-gray-800 border-gray-700 max-w-xs">
            <div className="flex items-start gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>Selected tasks span {projectIds.size} projects. Bulk phase move requires all tasks to be in the same project.</span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent className="w-44 p-1 bg-gray-900 border-gray-700" side="top" align="start">
        <p className="text-[9px] text-gray-500 uppercase tracking-wider px-2 py-1">Move to Phase</p>
        <div className="space-y-px max-h-52 overflow-y-auto">
          {projectBuckets.map((b) => (
            <button
              key={b.id}
              onClick={() => { onMovePhase(b.id); setOpen(false); }}
              className="w-full text-left px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color || '#6B7280' }} />
              {b.name}
            </button>
          ))}
          {/* General / No Phase */}
          <button
            onClick={() => { onMovePhase(null); setOpen(false); }}
            className="w-full text-left px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full shrink-0 bg-gray-600" />
            General / No Phase
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}