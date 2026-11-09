// Pure gating for the task "Approved Scope Estimate" panel. The server is the real boundary
// (scopeEstimateBaseline rejects task_summary for anyone but Bryan and Matt); this keeps the
// browser from even requesting it, and from showing another task's data while switching tasks.

/** Only an explicit `true` from the server grants access; anything else (loading, error, missing) denies. */
export const hasEstimateAccess = (accessResponse) => accessResponse?.can_view_task_estimate === true;

export const summaryQueryEnabled = (allowed, taskId) => allowed === true && typeof taskId === "string" && taskId.length > 0;

export const summaryQueryKey = (taskId) => ["taskScopeEstimate", taskId];

/** Baselines to render: only when allowed and every baseline belongs to the task on screen. */
export function visibleBaselines(allowed, taskId, data) {
  if (allowed !== true || !taskId || !data?.baselines?.length) return null;
  if (data.financials?.task?.id && data.financials.task.id !== taskId) return null;
  return data.baselines.every((b) => b.task_id === taskId) ? data.baselines : null;
}