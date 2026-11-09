// Pure scheduling draft for scope → task conversion. The server re-validates everything.
export const emptySchedule = () => ({ assignedTeamMemberId: "", startDate: "", dueDate: "", isPriority: false });

/** Inline error for the form, or null. Dates come from <input type="date"> (YYYY-MM-DD). */
export function scheduleError(s) {
  if (s.startDate && s.dueDate && s.dueDate < s.startDate) return "Due date cannot be before the start date.";
  return null;
}

/** Payload for scopeEstimateBaseline convert `taskDefaults`. Blank values are omitted. */
export function toTaskDefaults(s) {
  return {
    ...(s.assignedTeamMemberId ? { assignedTeamMemberId: s.assignedTeamMemberId } : {}),
    ...(s.startDate ? { startDate: s.startDate } : {}),
    ...(s.dueDate ? { dueDate: s.dueDate } : {}),
    isPriority: s.isPriority === true,
  };
}