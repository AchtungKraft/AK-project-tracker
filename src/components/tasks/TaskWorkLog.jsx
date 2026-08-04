import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock, Plus, CalendarIcon, Pencil, Trash2, Loader2, ArrowDownUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { parseLocalDate, toDateString, formatCalendarDate } from "@/lib/dateUtils";
import { formatDuration } from "@/lib/estimateUtils";
import { buildTaskTimeSummary, validateTimeEntryHours, formatVariance } from "@/lib/taskTimeUtils";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { invalidateProjectCaches } from "./useTaskInteraction";

/**
 * TaskWorkLog — Hours & Work Log section for the task detail drawer.
 * Shows summary header, add-entry form, and chronological entry list.
 */
export default function TaskWorkLog({ task }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [deleteEntry, setDeleteEntry] = useState(null);

  // Fetch time entries for this task
  const { data: timeEntries = [], isLoading } = useQuery({
    queryKey: ['taskTimeEntries', task?.id],
    queryFn: () => base44.entities.TaskTimeEntry.filter({ task_id: task?.id }),
    enabled: !!task?.id,
    staleTime: 10000,
  });

  // Fetch checklist items for optional association
  const { data: checklistItems = [] } = useQuery({
    queryKey: ['taskChecklistItems', 'task', task?.id],
    queryFn: () => base44.entities.TaskChecklistItem.filter({ task_id: task?.id }),
    enabled: !!task?.id,
    staleTime: 30000,
  });

  // Fetch team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
    staleTime: 60000,
  });

  const activeTeamMembers = useMemo(() => teamMembers.filter(tm => tm.active), [teamMembers]);

  // Build canonical summary
  const summary = useMemo(
    () => buildTaskTimeSummary(task || {}, timeEntries),
    [task, timeEntries]
  );

  // Sorted entries — newest first
  const sortedEntries = useMemo(
    () => [...timeEntries].sort((a, b) => {
      const dateCompare = (b.work_date || '').localeCompare(a.work_date || '');
      if (dateCompare !== 0) return dateCompare;
      return (b.created_date || '').localeCompare(a.created_date || '');
    }),
    [timeEntries]
  );

  const invalidateTimeEntries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['taskTimeEntries', task?.id] });
    queryClient.invalidateQueries({ queryKey: ['projectTimeEntries'] });
    invalidateProjectCaches(queryClient, task?.project_id);
  }, [queryClient, task?.id, task?.project_id]);

  const handleEntrySaved = useCallback(() => {
    setShowForm(false);
    setEditingEntry(null);
    invalidateTimeEntries();
  }, [invalidateTimeEntries]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteEntry) return;
    try {
      await base44.entities.TaskTimeEntry.delete(deleteEntry.id);
      toast({ description: 'Time entry deleted' });
      setDeleteEntry(null);
      invalidateTimeEntries();
    } catch {
      toast({ description: 'Failed to delete entry', variant: 'destructive' });
    }
  }, [deleteEntry, invalidateTimeEntries]);

  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">
        Hours & Work Log
      </h3>

      {/* Summary header */}
      <TimeSummaryHeader summary={summary} />

      {/* Add entry button */}
      {!showForm && !editingEntry && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(true)}
          className="w-full mt-2 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Log Hours
        </Button>
      )}

      {/* Entry form */}
      {(showForm || editingEntry) && (
        <TimeEntryForm
          task={task}
          entry={editingEntry}
          checklistItems={checklistItems}
          teamMembers={activeTeamMembers}
          onSaved={handleEntrySaved}
          onCancel={() => { setShowForm(false); setEditingEntry(null); }}
        />
      )}

      {/* Entry list */}
      {sortedEntries.length > 0 && (
        <div className="mt-3 space-y-2">
          {sortedEntries.map(entry => (
            <TimeEntryRow
              key={entry.id}
              entry={entry}
              checklistItems={checklistItems}
              teamMembers={teamMembers}
              onEdit={() => { setEditingEntry(entry); setShowForm(false); }}
              onDelete={() => setDeleteEntry(entry)}
            />
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sortedEntries.length === 0 && !showForm && (
        <p className="text-xs text-gray-600 mt-2 text-center py-2">No time logged yet</p>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteEntry} onOpenChange={(open) => { if (!open) setDeleteEntry(null); }}>
        <AlertDialogContent className="bg-gray-900 border-red-900/30 text-white max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {deleteEntry?.hours && `${formatDuration(deleteEntry.hours)} on ${formatCalendarDate(deleteEntry.work_date, 'MMM d, yyyy')}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-700 text-white hover:bg-gray-800">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ─── Summary Header ───────────────────────────────────────────

function TimeSummaryHeader({ summary }) {
  const { estimatedHours, loggedHours, varianceHours, remainingHours, isOverEstimate } = summary;
  const hasEstimate = estimatedHours != null && estimatedHours > 0;

  return (
    <div className="grid grid-cols-3 gap-2 bg-gray-800/50 rounded-lg p-2.5">
      <div>
        <p className="text-[9px] text-gray-500 uppercase tracking-wider">Estimate</p>
        <p className="text-sm font-medium text-gray-200">
          {hasEstimate ? formatDuration(estimatedHours) : <span className="text-gray-600">Not set</span>}
        </p>
      </div>
      <div>
        <p className="text-[9px] text-gray-500 uppercase tracking-wider">Logged</p>
        <p className="text-sm font-medium text-white">
          {loggedHours > 0 ? formatDuration(loggedHours) : '0h'}
        </p>
      </div>
      <div>
        <p className="text-[9px] text-gray-500 uppercase tracking-wider">
          {isOverEstimate ? 'Over' : 'Remaining'}
        </p>
        <p className={cn("text-sm font-medium", isOverEstimate ? "text-red-400" : hasEstimate ? "text-green-400" : "text-gray-600")}>
          {hasEstimate
            ? (isOverEstimate
              ? `+${formatDuration(Math.abs(varianceHours))}`
              : formatDuration(remainingHours) || '0h')
            : '—'}
        </p>
      </div>
    </div>
  );
}

// ─── Entry Form ───────────────────────────────────────────────

function TimeEntryForm({ task, entry, checklistItems, teamMembers, onSaved, onCancel }) {
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);

  // Get current user's team member
  const { data: currentTeamMember } = useQuery({
    queryKey: ['currentTeamMember'],
    queryFn: async () => {
      const me = await base44.auth.me();
      const members = await base44.entities.TeamMember.filter({ user_id: me.id });
      return members[0] || null;
    },
    staleTime: 120000,
  });

  const today = toDateString(new Date());

  const [form, setForm] = useState(() => ({
    work_date: entry?.work_date || today,
    hours: entry?.hours != null ? String(entry.hours) : '',
    note: entry?.note || '',
    team_member_id: entry?.team_member_id || '',
    checklist_item_id: entry?.checklist_item_id || '',
  }));

  // Default team member to current user once loaded
  React.useEffect(() => {
    if (!entry && currentTeamMember && !form.team_member_id) {
      setForm(prev => ({ ...prev, team_member_id: currentTeamMember.id }));
    }
  }, [currentTeamMember, entry, form.team_member_id]);

  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    const hoursError = validateTimeEntryHours(form.hours);
    if (hoursError) errs.hours = hoursError;
    if (!form.note?.trim()) errs.note = 'Work note is required';
    if (!form.work_date) errs.work_date = 'Date is required';
    if (!form.team_member_id) errs.team_member_id = 'Select who performed the work';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const performer = teamMembers.find(m => m.id === form.team_member_id);
      const data = {
        task_id: task.id,
        project_id: task.project_id,
        work_date: form.work_date,
        hours: parseFloat(form.hours),
        note: form.note.trim(),
        team_member_id: form.team_member_id,
        performed_by_name: performer?.full_name || 'Unknown',
        checklist_item_id: form.checklist_item_id || null,
        entry_source: entry ? (entry.entry_source || 'MANUAL') : 'MANUAL',
      };

      if (entry) {
        await base44.entities.TaskTimeEntry.update(entry.id, data);
        toast({ description: 'Time entry updated' });
      } else {
        await base44.entities.TaskTimeEntry.create(data);
        toast({ description: `${formatDuration(data.hours)} logged` });
      }
      onSaved();
    } catch (err) {
      toast({ description: 'Failed to save time entry', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const QUICK_HOURS = [0.25, 0.5, 1, 1.5, 2, 4];

  return (
    <div className="mt-2 bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-3">
      <p className="text-xs font-medium text-gray-300">
        {entry ? 'Edit Time Entry' : 'Log Hours'}
      </p>

      {/* Date & Hours row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-gray-500 uppercase">Date Worked</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="w-full justify-start bg-gray-900 border-gray-700 text-white text-xs h-8">
                <CalendarIcon className="mr-1.5 h-3 w-3" />
                {form.work_date ? formatCalendarDate(form.work_date, 'MMM d') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={parseLocalDate(form.work_date) || undefined}
                onSelect={(date) => setForm({ ...form, work_date: toDateString(date) })}
              />
            </PopoverContent>
          </Popover>
          {errors.work_date && <p className="text-[10px] text-red-400 mt-0.5">{errors.work_date}</p>}
        </div>
        <div>
          <Label className="text-[10px] text-gray-500 uppercase">Hours</Label>
          <Input
            type="number"
            step="0.25"
            min="0"
            max="24"
            inputMode="decimal"
            value={form.hours}
            onChange={(e) => { setForm({ ...form, hours: e.target.value }); setErrors({ ...errors, hours: undefined }); }}
            placeholder="e.g. 2.5"
            className="bg-gray-900 border-gray-700 text-white h-8 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {errors.hours && <p className="text-[10px] text-red-400 mt-0.5">{errors.hours}</p>}
        </div>
      </div>

      {/* Quick hour presets */}
      <div className="flex flex-wrap gap-1">
        {QUICK_HOURS.map(h => (
          <button
            key={h}
            type="button"
            onClick={() => { setForm({ ...form, hours: String(h) }); setErrors({ ...errors, hours: undefined }); }}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded transition-colors",
              form.hours === String(h)
                ? "bg-red-600 text-white"
                : "bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
            )}
          >
            {formatDuration(h)}
          </button>
        ))}
      </div>

      {/* Work note */}
      <div>
        <Label className="text-[10px] text-gray-500 uppercase">Work Note</Label>
        <Textarea
          value={form.note}
          onChange={(e) => { setForm({ ...form, note: e.target.value }); setErrors({ ...errors, note: undefined }); }}
          placeholder="Describe what was completed, investigated, or changed..."
          className="bg-gray-900 border-gray-700 text-white min-h-[60px] text-xs"
        />
        {errors.note && <p className="text-[10px] text-red-400 mt-0.5">{errors.note}</p>}
      </div>

      {/* Performed By */}
      <div>
        <Label className="text-[10px] text-gray-500 uppercase">Performed By</Label>
        <Select value={form.team_member_id} onValueChange={(v) => setForm({ ...form, team_member_id: v })}>
          <SelectTrigger className="bg-gray-900 border-gray-700 text-white h-8 text-xs">
            <SelectValue placeholder="Select team member" />
          </SelectTrigger>
          <SelectContent>
            {teamMembers.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.team_member_id && <p className="text-[10px] text-red-400 mt-0.5">{errors.team_member_id}</p>}
      </div>

      {/* Optional checklist item */}
      {checklistItems.length > 0 && (
        <div>
          <Label className="text-[10px] text-gray-500 uppercase">Checklist Item (optional)</Label>
          <Select value={form.checklist_item_id || '__none__'} onValueChange={(v) => setForm({ ...form, checklist_item_id: v === '__none__' ? '' : v })}>
            <SelectTrigger className="bg-gray-900 border-gray-700 text-white h-8 text-xs">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None — general task work</SelectItem>
              {checklistItems.map(ci => (
                <SelectItem key={ci.id} value={ci.id}>
                  {ci.is_complete ? '✓ ' : ''}{ci.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} className="flex-1 h-8 border-gray-700 text-xs" disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 h-8 bg-red-600 hover:bg-red-700 text-xs">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : (entry ? 'Update' : 'Save')}
        </Button>
      </div>
    </div>
  );
}

// ─── Entry Row ────────────────────────────────────────────────

function TimeEntryRow({ entry, checklistItems, teamMembers, onEdit, onDelete }) {
  const checklist = checklistItems.find(ci => ci.id === entry.checklist_item_id);
  const performer = teamMembers.find(m => m.id === entry.team_member_id);
  const isLegacy = entry.is_legacy_migration;

  return (
    <div className="group bg-gray-800/30 hover:bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2 transition-colors">
      {/* Top row: date, hours, performer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400 tabular-nums">
            {formatCalendarDate(entry.work_date, 'MMM d, yyyy')}
          </span>
          <Badge className="bg-gray-700 text-white text-[10px] px-1.5 py-0 h-4">
            {formatDuration(entry.hours)}
          </Badge>
          <span className="text-gray-500 text-[11px]">
            {performer?.full_name || entry.performed_by_name || 'Unknown'}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isLegacy && (
            <>
              <button onClick={onEdit} className="text-gray-500 hover:text-blue-400 p-0.5" title="Edit">
                <Pencil className="w-3 h-3" />
              </button>
              <button onClick={onDelete} className="text-gray-500 hover:text-red-400 p-0.5" title="Delete">
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Note */}
      {entry.note && (
        <p className="text-xs text-gray-300 mt-1 whitespace-pre-wrap leading-relaxed">
          {entry.note}
        </p>
      )}

      {/* Checklist item + legacy badge */}
      <div className="flex items-center gap-2 mt-1">
        {checklist && (
          <span className="text-[10px] text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded">
            {checklist.title}
          </span>
        )}
        {isLegacy && (
          <span className="text-[9px] text-amber-500/60 bg-amber-900/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
            Migrated
          </span>
        )}
        {entry.entry_source === 'TASK_COMPLETION' && (
          <span className="text-[9px] text-green-500/60 bg-green-900/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
            Completion
          </span>
        )}
      </div>
    </div>
  );
}